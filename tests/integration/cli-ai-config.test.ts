import { test } from "bun:test"
import assert from "node:assert/strict"
import path from "node:path"
import { readFile, access } from "node:fs/promises"

import { createManagedRootHarness } from "../helpers/cli"
import { runCliAsync, type CliRuntimeOptions } from "../../src/cli/entry"
import type { CodexAuthFetch } from "../../src/ai/codex-auth-client"

const CONFIG_PATH = path.join(".data", "ai", "config.json")
const CODEX_AUTH_PATH = path.join(".data", "ai", "codex-auth.json")

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...init.headers },
    ...init,
  })
}

async function runCliWithRoot(rootPath: string, args: string[], runtime: CliRuntimeOptions = {}) {
  const previousRoot = process.env.BLUENOTE_ROOT
  process.env.BLUENOTE_ROOT = rootPath
  try {
    return await runCliAsync(args, "test", runtime)
  } finally {
    if (previousRoot === undefined) {
      delete process.env.BLUENOTE_ROOT
    } else {
      process.env.BLUENOTE_ROOT = previousRoot
    }
  }
}

function createFakeCodexFetch(): { fetch: CodexAuthFetch; calls: string[] } {
  const calls: string[] = []
  const fetch: CodexAuthFetch = async (url) => {
    calls.push(String(url))
    if (calls.length === 1) {
      return jsonResponse({ device_auth_id: "device-secret-value", user_code: "TEST-CODE", interval: 1 })
    }
    if (calls.length === 2) {
      return jsonResponse({ authorization_code: "authorization-code-secret", code_challenge: "challenge-secret", code_verifier: "verifier-secret" })
    }
    return jsonResponse({
      access_token: "access-token-secret-value",
      refresh_token: "refresh-token-secret-value",
      id_token: "id-token-secret-value",
      expires_in: 3600,
    })
  }

  return { fetch, calls }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

test("bn ai config set writes plaintext config and prints a plaintext storage warning", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-ai-config-")

  try {
    const result = harness.run([
      "ai",
      "config",
      "set",
      "--base-url",
      "http://127.0.0.1:4321/v1",
      "--api-key",
      "test-token-123",
      "--model",
      "test-model",
    ])

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.match(result.stdout, /AI config saved\./)
    assert.match(result.stdout, /Warning: API key is stored in plaintext under \.data\/ai\/config\.json\./)
    assert.match(result.stdout, /Do not commit or share your BlueNote managed root if it contains secrets\./)

    const config = JSON.parse(await readFile(path.join(harness.rootPath, CONFIG_PATH), "utf8"))
    assert.deepEqual(config, {
      version: 1,
      enabled: true,
      provider: "openai-compatible",
      baseUrl: "http://127.0.0.1:4321/v1",
      apiKey: "test-token-123",
      model: "test-model",
      logging: {
        usage: true,
        conversations: false,
        results: true,
      },
      maxAttempts: 3,
      outputLanguage: "English",
    })
  } finally {
    await harness.cleanup()
  }
})

test("bn ai config set accepts retry attempts and output language", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-ai-config-prefs-")

  try {
    const result = harness.run([
      "ai",
      "config",
      "set",
      "--base-url",
      "http://127.0.0.1:4321/v1",
      "--api-key",
      "test-token-123",
      "--model",
      "test-model",
      "--max-attempts",
      "5",
      "--output-language",
      "日本語",
    ])

    assert.equal(result.exitCode, 0)
    const showResult = harness.run(["ai", "config", "show"])
    assert.equal(showResult.exitCode, 0)
    assert.match(showResult.stdout, /maxAttempts: 5/)
    assert.match(showResult.stdout, /outputLanguage: 日本語/)

    const config = JSON.parse(await readFile(path.join(harness.rootPath, CONFIG_PATH), "utf8"))
    assert.equal(config.maxAttempts, 5)
    assert.equal(config.outputLanguage, "日本語")
  } finally {
    await harness.cleanup()
  }
}, 10_000)

test("bn ai config set updates preferences without re-entering OpenAI-compatible provider setup", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-ai-config-prefs-update-")

  try {
    assert.equal(harness.run([
      "ai",
      "config",
      "set",
      "--base-url",
      "http://127.0.0.1:4321/v1",
      "--api-key",
      "test-token-123",
      "--model",
      "test-model",
    ]).exitCode, 0)

    const result = harness.run(["ai", "config", "set", "--max-attempts", "6", "--output-language", "Français"])

    assert.equal(result.exitCode, 0)
    const config = JSON.parse(await readFile(path.join(harness.rootPath, CONFIG_PATH), "utf8"))
    assert.deepEqual({
      provider: config.provider,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
      maxAttempts: config.maxAttempts,
      outputLanguage: config.outputLanguage,
    }, {
      provider: "openai-compatible",
      baseUrl: "http://127.0.0.1:4321/v1",
      apiKey: "test-token-123",
      model: "test-model",
      maxAttempts: 6,
      outputLanguage: "Français",
    })
  } finally {
    await harness.cleanup()
  }
}, 10_000)

test("bn ai config show masks the API key", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-ai-config-show-")

  try {
    const setResult = harness.run([
      "ai",
      "config",
      "set",
      "--base-url",
      "http://127.0.0.1:4321/v1",
      "--api-key",
      "secret-token-value",
      "--model",
      "test-model",
    ])
    assert.equal(setResult.exitCode, 0)

    const showResult = harness.run(["ai", "config", "show"])

    assert.equal(showResult.exitCode, 0)
    assert.equal(showResult.stderr, "")
    assert.match(showResult.stdout, /provider: openai-compatible/)
    assert.match(showResult.stdout, /baseUrl: http:\/\/127\.0\.0\.1:4321\/v1/)
    assert.match(showResult.stdout, /model: test-model/)
    assert.match(showResult.stdout, /maxAttempts: 3/)
    assert.match(showResult.stdout, /outputLanguage: English/)
    assert.match(showResult.stdout, /apiKey: /)
    assert.doesNotMatch(showResult.stdout, /secret-token-value/)
  } finally {
    await harness.cleanup()
  }
}, 10_000)

test("bn ai config set can select the Codex provider without OpenAI-compatible secrets", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-ai-codex-config-")

  try {
    const result = harness.run([
      "ai",
      "config",
      "set",
      "--provider",
      "codex",
      "--model",
      "codex-test-model",
    ])

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.match(result.stdout, /AI Codex config saved\./)
    assert.doesNotMatch(result.stdout, /API key is stored in plaintext/)

    const config = JSON.parse(await readFile(path.join(harness.rootPath, CONFIG_PATH), "utf8"))
    assert.deepEqual(config, {
      version: 1,
      enabled: true,
      provider: "codex",
      model: "codex-test-model",
      logging: {
        usage: true,
        conversations: false,
        results: true,
      },
      maxAttempts: 3,
      outputLanguage: "English",
    })

    const showResult = harness.run(["ai", "config", "show"])
    assert.equal(showResult.exitCode, 0)
    assert.match(showResult.stdout, /provider: codex/)
    assert.match(showResult.stdout, /model: codex-test-model/)
    assert.doesNotMatch(showResult.stdout, /apiKey:/)
    assert.doesNotMatch(showResult.stdout, /baseUrl:/)
  } finally {
    await harness.cleanup()
  }
}, 10_000)

test("bn ai config set updates Codex preferences without re-entering model setup", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-ai-codex-config-prefs-update-")

  try {
    assert.equal(harness.run(["ai", "config", "set", "--provider", "codex", "--model", "codex-test-model"]).exitCode, 0)

    const result = harness.run(["ai", "config", "set", "--max-attempts", "4", "--output-language", "Deutsch"])

    assert.equal(result.exitCode, 0)
    const config = JSON.parse(await readFile(path.join(harness.rootPath, CONFIG_PATH), "utf8"))
    assert.deepEqual({
      provider: config.provider,
      model: config.model,
      maxAttempts: config.maxAttempts,
      outputLanguage: config.outputLanguage,
    }, {
      provider: "codex",
      model: "codex-test-model",
      maxAttempts: 4,
      outputLanguage: "Deutsch",
    })
  } finally {
    await harness.cleanup()
  }
}, 10_000)

test("bn ai codex auth status reports setup-required when Codex is configured and auth is absent", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-ai-codex-status-")

  try {
    assert.equal(harness.run(["ai", "config", "set", "--provider", "codex", "--model", "codex-test-model"]).exitCode, 0)
    const result = harness.run(["ai", "codex", "auth", "status"])

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.match(result.stdout, /Codex auth setup required\./)
    assert.match(result.stdout, /Run bn ai codex auth login\./)
    assert.doesNotMatch(result.stdout, /token|secret|Bearer|apiKey/i)
  } finally {
    await harness.cleanup()
  }
}, 10_000)

test("bn ai codex auth login stores fake OAuth auth without printing token material", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-ai-codex-login-")
  const { fetch, calls } = createFakeCodexFetch()

  try {
    assert.equal(harness.run(["ai", "config", "set", "--provider", "codex", "--model", "codex-test-model"]).exitCode, 0)

    const streamed: string[] = []
    const loginResult = await runCliWithRoot(harness.rootPath, ["ai", "codex", "auth", "login"], {
      ai: {
        fetch,
        writeStdout: (chunk) => streamed.push(chunk),
        codexAuth: {
          issuer: "https://auth.fake.test",
          clientId: "client-test",
          now: () => new Date("2099-06-04T00:00:00.000Z"),
          sleep: async () => {},
        },
      },
    })

    assert.equal(loginResult.exitCode, 0)
    assert.equal(loginResult.stderr, "")
    const combinedOutput = `${streamed.join("")}${loginResult.stdout}`
    assert.doesNotMatch(loginResult.stdout, /Open https:\/\/auth\.fake\.test\/codex\/device/)
    assert.doesNotMatch(loginResult.stdout, /TEST-CODE/)
    assert.match(loginResult.stdout, /Codex auth login complete\./)
    assert.match(combinedOutput, /Open https:\/\/auth\.fake\.test\/codex\/device/)
    assert.match(combinedOutput, /TEST-CODE/)
    assert.equal((combinedOutput.match(/Open https:\/\/auth\.fake\.test\/codex\/device/gu) ?? []).length, 1)
    assert.equal((combinedOutput.match(/Waiting for Codex authentication to complete/gu) ?? []).length, 1)
    assert.deepEqual(streamed, [
      "Open https://auth.fake.test/codex/device and enter code TEST-CODE.\n",
      "Waiting for Codex authentication to complete...\n",
    ])
    assert.doesNotMatch(loginResult.stdout, /access-token-secret-value|refresh-token-secret-value|id-token-secret-value|device-secret-value|authorization-code-secret|verifier-secret|challenge-secret/)
    assert.deepEqual(calls, [
      "https://auth.fake.test/api/accounts/deviceauth/usercode",
      "https://auth.fake.test/api/accounts/deviceauth/token",
      "https://auth.fake.test/oauth/token",
    ])

    const persisted = await readFile(path.join(harness.rootPath, CODEX_AUTH_PATH), "utf8")
    assert.match(persisted, /access-token-secret-value/)
  } finally {
    await harness.cleanup()
  }
}, 15_000)

test("bn ai codex auth status after fake login reports authenticated without secrets", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-ai-codex-authenticated-")
  const { fetch } = createFakeCodexFetch()

  try {
    assert.equal(harness.run(["ai", "config", "set", "--provider", "codex", "--model", "codex-test-model"]).exitCode, 0)
    assert.equal((await runCliWithRoot(harness.rootPath, ["ai", "codex", "auth", "login"], {
      ai: { fetch, codexAuth: { issuer: "https://auth.fake.test", clientId: "client-test", now: () => new Date("2099-06-04T00:00:00.000Z"), sleep: async () => {} } },
    })).exitCode, 0)

    const statusResult = harness.run(["ai", "codex", "auth", "status"])

    assert.equal(statusResult.exitCode, 0)
    assert.equal(statusResult.stderr, "")
    assert.match(statusResult.stdout, /Codex auth authenticated\./)
    assert.match(statusResult.stdout, /Expires at 2099-06-04T01:00:00\.000Z\./)
    assert.doesNotMatch(statusResult.stdout, /access-token-secret-value|refresh-token-secret-value|id-token-secret-value|token|secret|Bearer/i)
  } finally {
    await harness.cleanup()
  }
}, 15_000)

test("bn ai codex auth logout removes auth and keeps Codex config and model", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-ai-codex-logout-")
  const { fetch } = createFakeCodexFetch()

  try {
    assert.equal(harness.run(["ai", "config", "set", "--provider", "codex", "--model", "codex-test-model"]).exitCode, 0)
    assert.equal((await runCliWithRoot(harness.rootPath, ["ai", "codex", "auth", "login"], {
      ai: { fetch, codexAuth: { issuer: "https://auth.fake.test", clientId: "client-test", now: () => new Date("2099-06-04T00:00:00.000Z"), sleep: async () => {} } },
    })).exitCode, 0)

    const logoutResult = harness.run(["ai", "codex", "auth", "logout"])

    assert.equal(logoutResult.exitCode, 0)
    assert.equal(logoutResult.stderr, "")
    assert.match(logoutResult.stdout, /Codex auth removed\./)
    assert.equal(await pathExists(path.join(harness.rootPath, CODEX_AUTH_PATH)), false)
    const config = JSON.parse(await readFile(path.join(harness.rootPath, CONFIG_PATH), "utf8"))
    assert.equal(config.provider, "codex")
    assert.equal(config.model, "codex-test-model")
  } finally {
    await harness.cleanup()
  }
}, 15_000)

test("bn ai codex auth login sanitizes failures and logout rejects unexpected args", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-ai-codex-login-failure-")

  try {
    assert.equal(harness.run(["ai", "config", "set", "--provider", "codex", "--model", "codex-test-model"]).exitCode, 0)
    const failure = await runCliWithRoot(harness.rootPath, ["ai", "codex", "auth", "login"], {
      ai: {
        fetch: async () => jsonResponse({ error: "Bearer raw-token-secret access_token=access-token-secret-value" }, { status: 500 }),
        codexAuth: { issuer: "https://auth.fake.test", clientId: "client-test" },
      },
    })

    assert.equal(failure.exitCode, 1)
    assert.equal(failure.stdout, "")
    assert.match(failure.stderr, /Codex auth login failed:/)
    assert.match(failure.stderr, /Hint: Check network access and retry bn ai codex auth login\./)
    assert.doesNotMatch(failure.stderr, /raw-token-secret|access-token-secret-value|Bearer raw/)

    const logout = harness.run(["ai", "codex", "auth", "logout", "--dry-run"])
    assert.equal(logout.exitCode, 1)
    assert.match(logout.stderr, /Unexpected arguments for bn ai codex auth logout\./)
  } finally {
    await harness.cleanup()
  }
}, 15_000)

test("bn ai describe reports a helpful error when AI config is missing", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-ai-missing-config-")

  try {
    const createResult = harness.run(["new", "Missing config body", "--path", "note", "--title", "Needs AI"], {
      BLUENOTE_TEST_NOW: "2026-06-01T00:00:00.000Z",
      BLUENOTE_TEST_RANDOM_SEQUENCE: "0x12345678",
    })
    assert.equal(createResult.exitCode, 0)

    const result = harness.run(["ai", "describe", "needs-ai-51u7i0"])

    assert.equal(result.exitCode, 1)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /AI is not configured\./)
    assert.match(result.stderr, /Hint: Run bn ai config set --base-url <url> --api-key <key> --model <model>\./)
  } finally {
    await harness.cleanup()
  }
}, 15_000)
