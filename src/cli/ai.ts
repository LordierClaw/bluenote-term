import { resolveBlueNoteRoot } from "../config/root"
import { UsageError } from "../core/errors"
import type { CliResult } from "../core/types"
import { ensureManagedRoot } from "../storage/root-layout"
import { createAiConfigRepository, maskApiKey, type AiConfig } from "../ai/config"
import { generateNoteDescription, type GenerateNoteDescriptionResult } from "../ai/description-service"
import { sanitizeAiErrorMessage, sanitizeCodexAuthErrorMessage } from "../ai/error-redaction"
import { createAiTextGenerationClient, type AiTextGenerationClient } from "../ai/provider"
import type { OpenAiCompatibleFetch } from "../ai/openai-compatible-client"
import type { AiQueueJob } from "../ai/queue-repository"
import { dropDescribeNoteJobIfNoteMissing, listPendingAiJobs, listRetryableAiJobs, markDescribeNoteJobFailedIfContentHashMatches } from "../ai/queue-service"
import { CodexAuthClientError, createCodexAuthClient, type CodexAuthClientOptions } from "../ai/codex-auth-client"
import { createCodexAuthRepository, formatCodexAuthStatus } from "../ai/codex-auth-repository"

export interface AiCliRuntimeOptions {
  aiClient?: AiTextGenerationClient
  fetch?: OpenAiCompatibleFetch
  codexAuth?: Omit<CodexAuthClientOptions, "fetch" | "repository">
  writeStdout?: (chunk: string) => void
}

const PLAINTEXT_WARNING = [
  "Warning: API key is stored in plaintext under .data/ai/config.json.",
  "Do not commit or share your BlueNote managed root if it contains secrets.",
].join("\n")

export function formatAiHelp(): string {
  return [
    "Opt-in AI description generation for BlueNote notes.",
    "",
    "Usage:",
    "  bn ai <command> [options]",
    "",
    "Commands:",
    "  config set     [--provider openai-compatible] --base-url <url> --api-key <key> --model <model> [--max-attempts <n>] [--output-language <text>]  Configure OpenAI-compatible AI",
    "  config set     --provider codex --model <model> [--max-attempts <n>] [--output-language <text>]  Configure Codex AI model selection",
    "  config show    Show configured provider settings with the API key masked",
    "  codex auth login   Authenticate Codex with device-code OAuth",
    "  codex auth status  Show Codex auth status without secrets",
    "  codex auth logout  Remove stored Codex auth while keeping AI config",
    "  describe       <key|path>  Generate and automatically apply a note description",
    "  queue          Show pending AI description jobs",
    "  process-queue  [--limit <n>]  Process queued description refreshes",
    "",
    "AI is disabled until configured. Core BlueNote commands work offline; AI provider calls require network access.",
  ].join("\n") + "\n"
}

function readFlagValue(args: string[], flagName: string): string | undefined {
  const flagIndex = args.indexOf(flagName)

  if (flagIndex === -1) {
    return undefined
  }

  const value = args[flagIndex + 1]
  if (value === undefined || value.startsWith("--")) {
    throw new UsageError(`Missing value for ${flagName}.`, {
      hint: `Pass ${flagName} "...".`,
    })
  }

  return value
}

function requireFlag(args: string[], flagName: string, hint: string): string {
  const value = readFlagValue(args, flagName)
  if (!value) {
    throw new UsageError(`Missing required ${flagName} for AI config.`, { hint })
  }
  return value
}

function parseLimit(args: string[]): number | undefined {
  const raw = readFlagValue(args, "--limit")
  if (raw === undefined) {
    return undefined
  }

  const limit = Number(raw)
  if (!Number.isInteger(limit) || limit < 1) {
    throw new UsageError("Invalid --limit for AI queue processing.", {
      hint: "Run bn ai process-queue --limit <positive-integer>.",
    })
  }

  return limit
}

function parsePositiveIntegerFlag(args: string[], flagName: string): number | undefined {
  const raw = readFlagValue(args, flagName)
  if (raw === undefined) {
    return undefined
  }
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1 || value > 10) {
    throw new UsageError(`Invalid ${flagName} for AI config.`, {
      hint: `Run bn ai config set ${flagName} <integer-from-1-to-10>.`,
    })
  }
  return value
}

function readOptionalOutputLanguage(args: string[]): string | undefined {
  const value = readFlagValue(args, "--output-language")
  if (value === undefined) return undefined
  if (value.trim() === "") {
    throw new UsageError("Invalid --output-language for AI config.", {
      hint: "Pass a non-empty language preference string.",
    })
  }
  return value
}

const DEFAULT_AI_LOGGING = {
  usage: true,
  conversations: false,
  results: true,
} as const

function createDefaultConfig(input: { baseUrl: string; apiKey: string; model: string; maxAttempts?: number; outputLanguage?: string; existing?: AiConfig | null }): AiConfig {
  const existingOpenAiConfig = input.existing?.provider === "openai-compatible" ? input.existing : null
  return {
    version: 1,
    enabled: existingOpenAiConfig?.enabled ?? true,
    provider: "openai-compatible",
    baseUrl: input.baseUrl,
    apiKey: input.apiKey,
    model: input.model,
    logging: existingOpenAiConfig?.logging ?? DEFAULT_AI_LOGGING,
    maxAttempts: input.maxAttempts ?? input.existing?.maxAttempts ?? 3,
    outputLanguage: input.outputLanguage ?? input.existing?.outputLanguage ?? "English",
  }
}

function createCodexConfig(input: { model: string; maxAttempts?: number; outputLanguage?: string; existing?: AiConfig | null }): AiConfig {
  const existingCodexConfig = input.existing?.provider === "codex" ? input.existing : null
  return {
    version: 1,
    enabled: existingCodexConfig?.enabled ?? true,
    provider: "codex",
    model: input.model,
    logging: existingCodexConfig?.logging ?? DEFAULT_AI_LOGGING,
    maxAttempts: input.maxAttempts ?? input.existing?.maxAttempts ?? 3,
    outputLanguage: input.outputLanguage ?? input.existing?.outputLanguage ?? "English",
  }
}

function getConfiguredRootPath(): string {
  return ensureManagedRoot(resolveBlueNoteRoot())
}

function requireAiConfig(rootPath: string): void {
  if (!createAiConfigRepository(rootPath).exists()) {
    throw new UsageError("AI is not configured.", {
      hint: "Run bn ai config set --base-url <url> --api-key <key> --model <model>. For Codex, run bn ai config set --provider codex --model <model>.",
    })
  }
}

function requireCodexConfig(rootPath: string): AiConfig {
  requireAiConfig(rootPath)
  const config = createAiConfigRepository(rootPath).read()
  if (config.provider !== "codex") {
    throw new UsageError("Codex is not the configured AI provider.", {
      hint: "Run bn ai config set --provider codex --model <model> before Codex auth commands.",
    })
  }

  return config
}

function getAiClient(config: AiConfig, runtime: AiCliRuntimeOptions): AiTextGenerationClient {
  if (runtime.aiClient) {
    return runtime.aiClient
  }

  if (config.provider === "codex") {
    const rootPath = getConfiguredRootPath()
    const repository = createCodexAuthRepository(rootPath, runtime.codexAuth)
    const authClient = createCodexAuthClient({
      ...runtime.codexAuth,
      fetch: runtime.fetch ?? fetch,
      repository,
    })

    return createAiTextGenerationClient(config, {
      fetch: runtime.fetch ?? fetch,
      codexAuth: {
        hasAuth: () => repository.exists(),
        async getAuth() {
          return repository.exists() ? repository.read() : null
        },
        async refreshAuth(auth) {
          const refreshed = await authClient.refreshAuth(auth)
          repository.write(refreshed)
          return refreshed
        },
      },
    })
  }

  return createAiTextGenerationClient(config, { fetch: runtime.fetch ?? fetch })
}

function formatConfig(config: AiConfig): string {
  return [
    "AI config:",
    `  enabled: ${config.enabled}`,
    `  provider: ${config.provider}`,
    `  model: ${config.model}`,
    ...(config.provider === "openai-compatible" ? [
      `  baseUrl: ${config.baseUrl}`,
      `  apiKey: ${maskApiKey(config.apiKey)}`,
    ] : []),
    `  logging.usage: ${config.logging.usage}`,
    `  logging.conversations: ${config.logging.conversations}`,
    `  logging.results: ${config.logging.results}`,
    `  maxAttempts: ${config.maxAttempts ?? 3}`,
    `  outputLanguage: ${config.outputLanguage ?? "English"}`,
  ].join("\n") + "\n"
}

function formatPendingJobs(jobs: AiQueueJob[]): string {
  if (jobs.length === 0) {
    return "Pending AI jobs: 0\n"
  }

  return [
    `Pending AI jobs: ${jobs.length}`,
    ...jobs.map((job) => `${job.kind}\t${job.key}\t${job.relativePath}\tattempts=${job.attempts}`),
  ].join("\n") + "\n"
}

function markJobFailed(rootPath: string, job: AiQueueJob, error: unknown, secrets: string[] = []): boolean {
  const message = sanitizeAiErrorMessage(error, secrets)
  return markDescribeNoteJobFailedIfContentHashMatches({
    rootPath,
    key: job.key,
    contentHash: job.contentHash,
    lastError: message,
  })
}

function describeOutput(result: GenerateNoteDescriptionResult): CliResult {
  if (result.status === "applied" && result.description) {
    return {
      exitCode: 0,
      stdout: `Updated AI description for ${result.key}\nDescription: ${result.description}\n`,
      stderr: "",
    }
  }

  if (result.status === "stale") {
    throw new UsageError(`AI description result was stale: ${result.error ?? "note changed while AI description was generating"}.`, {
      hint: "The existing note description was left unchanged. Run bn ai describe again to refresh it.",
    })
  }

  throw new UsageError(result.error ?? "Provider returned an invalid description.", {
    hint: "The existing note description was left unchanged.",
  })
}

function providerFailureError(error: unknown, secrets: string[] = []): UsageError {
  return new UsageError(`AI provider request failed: ${sanitizeAiErrorMessage(error, secrets)}`, {
    hint: "The existing note description was left unchanged.",
  })
}

async function runConfigCommand(args: string[]): Promise<CliResult> {
  const [subcommand, ...subcommandArgs] = args
  const rootPath = getConfiguredRootPath()
  const repository = createAiConfigRepository(rootPath)

  if (subcommand === "set") {
    const existingConfig = repository.exists() ? repository.read() : null
    const provider = readFlagValue(subcommandArgs, "--provider") ?? existingConfig?.provider ?? "openai-compatible"
    if (provider !== "openai-compatible" && provider !== "codex") {
      throw new UsageError("Invalid AI provider.", {
        hint: "Use --provider openai-compatible or --provider codex.",
      })
    }

    const maxAttempts = parsePositiveIntegerFlag(subcommandArgs, "--max-attempts")
    const outputLanguage = readOptionalOutputLanguage(subcommandArgs)
    const config = provider === "codex"
      ? createCodexConfig({
        model: readFlagValue(subcommandArgs, "--model") ?? (existingConfig?.provider === "codex" ? existingConfig.model : undefined) ?? requireFlag(subcommandArgs, "--model", "Run bn ai config set --provider codex --model <model>."),
        maxAttempts,
        outputLanguage,
        existing: existingConfig,
      })
      : createDefaultConfig({
        baseUrl: readFlagValue(subcommandArgs, "--base-url") ?? (existingConfig?.provider === "openai-compatible" ? existingConfig.baseUrl : undefined) ?? requireFlag(subcommandArgs, "--base-url", "Run bn ai config set --base-url <url> --api-key <key> --model <model>."),
        apiKey: readFlagValue(subcommandArgs, "--api-key") ?? (existingConfig?.provider === "openai-compatible" ? existingConfig.apiKey : undefined) ?? requireFlag(subcommandArgs, "--api-key", "Run bn ai config set --base-url <url> --api-key <key> --model <model>."),
        model: readFlagValue(subcommandArgs, "--model") ?? (existingConfig?.provider === "openai-compatible" ? existingConfig.model : undefined) ?? requireFlag(subcommandArgs, "--model", "Run bn ai config set --base-url <url> --api-key <key> --model <model>."),
        maxAttempts,
        outputLanguage,
        existing: existingConfig,
      })

    repository.write(config)
    return {
      exitCode: 0,
      stdout: config.provider === "codex" ? "AI Codex config saved. Run bn ai codex auth login before Codex generation.\n" : `AI config saved.\n${PLAINTEXT_WARNING}\n`,
      stderr: "",
    }
  }

  if (subcommand === "show") {
    requireAiConfig(rootPath)
    return { exitCode: 0, stdout: formatConfig(repository.read()), stderr: "" }
  }

  throw new UsageError(`Unknown AI config command: ${subcommand ?? ""}`.trim(), {
    hint: "Run bn ai config set ... or bn ai config show.",
  })
}

function assertNoExtraArgs(args: string[], command: string): void {
  if (args.length > 0) {
    throw new UsageError(`Unexpected arguments for ${command}.`, {
      hint: `Run ${command}.`,
    })
  }
}

async function runCodexAuthCommand(args: string[], runtime: AiCliRuntimeOptions): Promise<CliResult> {
  const [subcommand, ...subcommandArgs] = args
  const rootPath = getConfiguredRootPath()
  const config = requireCodexConfig(rootPath)
  const repository = createCodexAuthRepository(rootPath, runtime.codexAuth)

  if (subcommand === "status") {
    assertNoExtraArgs(subcommandArgs, "bn ai codex auth status")
    return {
      exitCode: 0,
      stdout: `${formatCodexAuthStatus(repository.getStatus({ provider: config.provider }))}\n`,
      stderr: "",
    }
  }

  if (subcommand === "login") {
    assertNoExtraArgs(subcommandArgs, "bn ai codex auth login")
    const outputLines: string[] = []
    const shouldStream = runtime.writeStdout !== undefined || (runtime.fetch === undefined && runtime.codexAuth === undefined && runtime.aiClient === undefined)
    const writeInteractive = (line: string) => {
      if (shouldStream) {
        ;(runtime.writeStdout ?? process.stdout.write.bind(process.stdout))(`${line}\n`)
        return
      }
      outputLines.push(line)
    }
    const client = createCodexAuthClient({
      ...runtime.codexAuth,
      fetch: runtime.fetch ?? fetch,
      repository,
    })

    try {
      await client.login({
        onDeviceFlow(flow) {
          writeInteractive(`Open ${flow.verificationUrl} and enter code ${flow.userCode}.`)
          writeInteractive("Waiting for Codex authentication to complete...")
        },
      })
    } catch (error) {
      const message = error instanceof CodexAuthClientError
        ? sanitizeCodexAuthErrorMessage(error)
        : sanitizeCodexAuthErrorMessage(error)
      throw new UsageError(`Codex auth login failed: ${message}`, {
        hint: "Check network access and retry bn ai codex auth login.",
      })
    }

    const completeLine = "Codex auth login complete."
    outputLines.push(completeLine)
    return { exitCode: 0, stdout: `${outputLines.join("\n")}\n`, stderr: "" }
  }

  if (subcommand === "logout") {
    assertNoExtraArgs(subcommandArgs, "bn ai codex auth logout")
    repository.delete()
    return { exitCode: 0, stdout: "Codex auth removed. Codex AI config was kept.\n", stderr: "" }
  }

  throw new UsageError("Unknown AI Codex auth command.", {
    hint: "Run bn ai codex auth login, bn ai codex auth status, or bn ai codex auth logout.",
  })
}

export async function runAiCli(args: string[], runtime: AiCliRuntimeOptions = {}): Promise<CliResult> {
  const [subcommand, ...subcommandArgs] = args

  if (!subcommand || subcommand === "--help" || subcommand === "help") {
    return { exitCode: 0, stdout: formatAiHelp(), stderr: "" }
  }

  if (subcommand === "config") {
    return runConfigCommand(subcommandArgs)
  }

  if (subcommand === "codex") {
    if (subcommandArgs[0] === "auth") {
      return runCodexAuthCommand(subcommandArgs.slice(1), runtime)
    }

    throw new UsageError("Unknown AI Codex command.", {
      hint: "Run bn ai codex auth login, bn ai codex auth status, or bn ai codex auth logout.",
    })
  }

  if (subcommand === "queue") {
    const rootPath = getConfiguredRootPath()
    return { exitCode: 0, stdout: formatPendingJobs(listPendingAiJobs(rootPath)), stderr: "" }
  }

  if (subcommand === "describe") {
    const selector = subcommandArgs[0]
    if (!selector) {
      throw new UsageError("Missing required selector for AI describe.", {
        hint: "Run bn ai describe <key|path>.",
      })
    }

    const rootPath = getConfiguredRootPath()
    requireAiConfig(rootPath)
    const config = createAiConfigRepository(rootPath).read()
    const secrets = config.provider === "openai-compatible" ? [config.apiKey] : []
    try {
      return describeOutput(await generateNoteDescription({ rootPath, selector, client: getAiClient(config, runtime) }))
    } catch (error) {
      if (error instanceof UsageError) {
        throw error
      }

      throw providerFailureError(error, secrets)
    }
  }

  if (subcommand === "process-queue") {
    const rootPath = getConfiguredRootPath()
    requireAiConfig(rootPath)
    const config = createAiConfigRepository(rootPath).read()
    const secrets = config.provider === "openai-compatible" ? [config.apiKey] : []
    const limit = parseLimit(subcommandArgs)
    const jobs = listRetryableAiJobs(rootPath, config.maxAttempts ?? 3)
    const selectedJobs = jobs.slice(0, limit ?? jobs.length)
    let applied = 0
    let failed = 0

    for (const job of selectedJobs) {
      try {
        if (dropDescribeNoteJobIfNoteMissing(rootPath, job)) {
          continue
        }

        const result = await generateNoteDescription({ rootPath, selector: job.key, client: getAiClient(config, runtime) })
        if (result.status === "applied") {
          applied += 1
        } else if (result.status === "stale") {
          // Leave refreshed queue jobs pending; this provider response was for older content.
        } else {
          if (markJobFailed(rootPath, job, result.error ?? "invalid description", secrets)) {
            failed += 1
          }
        }
      } catch (error) {
        if (markJobFailed(rootPath, job, error, secrets)) {
          failed += 1
        }
      }
    }

    const remaining = listPendingAiJobs(rootPath).length
    return {
      exitCode: failed > 0 ? 1 : 0,
      stdout: `Processed AI queue: ${applied} applied, ${failed} failed, ${remaining} remaining.\n`,
      stderr: "",
    }
  }

  throw new UsageError(`Unknown AI command: ${subcommand ?? ""}`.trim(), {
    hint: "Run bn ai config set, bn ai config show, bn ai describe, bn ai queue, or bn ai process-queue.",
  })
}
