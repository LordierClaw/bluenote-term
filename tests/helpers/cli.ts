import os from "node:os"
import path from "node:path"
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises"

import { MANAGED_ROOT_LAYOUT } from "../../src/storage/root-layout"

const workspaceRoot = path.resolve(import.meta.dir, "../..")
const cliPath = path.join(workspaceRoot, "tests", "helpers", "run-cli.ts")

export type CliRunResult = {
  exitCode: number
  stdout: string
  stderr: string
}

export type CliEnvOverrides = Record<string, string | undefined>

export type ManagedRootHarness = {
  rootPath: string
  run(args: string[], extraEnv?: CliEnvOverrides): CliRunResult
  runAsync(args: string[], extraEnv?: CliEnvOverrides): Promise<CliRunResult>
  runBin(args: string[], extraEnv?: CliEnvOverrides): CliRunResult
  runScript(relativeScriptPath: string, extraEnv?: CliEnvOverrides): CliRunResult
  writeNote(relativePath: string, markdown: string): Promise<void>
  writeFakeEditorScript(markdown: string, fileName?: string): Promise<string>
  cleanup(): Promise<void>
  escapeForRegExp(value: string): string
}

export type BlockedRootFixture = {
  blockedRoot: string
  cleanup(): Promise<void>
}

type RunWorkspaceCommandOptions = {
  rootPath?: string
  extraEnv?: CliEnvOverrides
}

function buildCommandEnv(rootPath?: string, extraEnv: CliEnvOverrides = {}): Record<string, string> {
  const envEntries = Object.entries({
    ...process.env,
    ...(rootPath ? { BLUENOTE_ROOT: rootPath } : {}),
  }).filter((entry): entry is [string, string] => typeof entry[1] === "string")

  const env = Object.fromEntries(envEntries)

  for (const [key, value] of Object.entries(extraEnv)) {
    if (value === undefined) {
      delete env[key]
      continue
    }

    env[key] = value
  }

  return env
}

function runWorkspaceCommand(command: string[], { rootPath, extraEnv = {} }: RunWorkspaceCommandOptions = {}): CliRunResult {
  const result = Bun.spawnSync(command, {
    cwd: workspaceRoot,
    env: buildCommandEnv(rootPath, extraEnv),
    stdout: "pipe",
    stderr: "pipe",
  })

  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }
}

async function runWorkspaceCommandAsync(
  command: string[],
  { rootPath, extraEnv = {} }: RunWorkspaceCommandOptions = {},
): Promise<CliRunResult> {
  const process = Bun.spawn(command, {
    cwd: workspaceRoot,
    env: buildCommandEnv(rootPath, extraEnv),
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ])

  return { exitCode, stdout, stderr }
}

export function runCli(args: string[], options: RunWorkspaceCommandOptions = {}): CliRunResult {
  return runWorkspaceCommand(["bun", "run", cliPath, ...args], options)
}

export function runCliAsync(args: string[], options: RunWorkspaceCommandOptions = {}): Promise<CliRunResult> {
  return runWorkspaceCommandAsync(["bun", "run", cliPath, ...args], options)
}

export function runBinCli(args: string[], options: RunWorkspaceCommandOptions = {}): CliRunResult {
  return runWorkspaceCommand(["bun", "run", path.join(workspaceRoot, "bin", "bn.ts"), ...args], options)
}

export function runWorkspaceScript(
  relativeScriptPath: string,
  { rootPath, extraEnv = {} }: RunWorkspaceCommandOptions = {},
): CliRunResult {
  return runWorkspaceCommand(["bun", "run", path.join(workspaceRoot, relativeScriptPath)], {
    rootPath,
    extraEnv,
  })
}

export async function assertManagedRootLayout(rootPath: string) {
  for (const relativePath of MANAGED_ROOT_LAYOUT) {
    const stats = await stat(path.join(rootPath, relativePath))
    if (!stats.isDirectory()) {
      throw new Error(`${relativePath} should be created as a directory`)
    }
  }
}

export async function createBlockedRootFixture(prefix = "bluenote-blocked-root-"): Promise<BlockedRootFixture> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), prefix))
  const blockedRoot = path.join(tempRoot, "blocked-root")
  await writeFile(blockedRoot, "not a directory")

  return {
    blockedRoot,
    cleanup() {
      return rm(tempRoot, { recursive: true, force: true })
    },
  }
}

export async function createManagedRootHarness(prefix = "bluenote-test-"): Promise<ManagedRootHarness> {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), prefix))

  return {
    rootPath,
    run(args, extraEnv = {}) {
      return runCli(args, { rootPath, extraEnv })
    },
    runAsync(args, extraEnv = {}) {
      return runCliAsync(args, { rootPath, extraEnv })
    },
    runBin(args, extraEnv = {}) {
      return runBinCli(args, { rootPath, extraEnv })
    },
    runScript(relativeScriptPath, extraEnv = {}) {
      return runWorkspaceScript(relativeScriptPath, { rootPath, extraEnv })
    },
    async writeNote(relativePath, markdown) {
      const absolutePath = path.join(rootPath, relativePath)
      await mkdir(path.dirname(absolutePath), { recursive: true })
      await Bun.write(absolutePath, markdown)
    },
    async writeFakeEditorScript(markdown, fileName = "fake-editor.ts") {
      const editorScriptPath = path.join(rootPath, fileName)
      await writeFile(editorScriptPath, `await Bun.write(Bun.argv[2], ${JSON.stringify(markdown)})\n`, "utf8")
      return `bun "${editorScriptPath}"`
    },
    cleanup() {
      return rm(rootPath, { recursive: true, force: true })
    },
    escapeForRegExp(value) {
      return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    },
  }
}
