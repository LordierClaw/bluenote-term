import { test } from "bun:test"
import assert from "node:assert/strict"
import path from "node:path"
import { readFile } from "node:fs/promises"

import { createManagedRootHarness } from "../helpers/cli"
import { enqueueDescribeNoteJob } from "../../src/ai/queue-service"
import { readDescribeNotePrompt } from "../../src/ai/prompt-repository"
import { runCliAsync } from "../../src/cli/entry"
import type { AiTextGenerationClient } from "../../src/ai/provider"
import { createCodexAuthRepository } from "../../src/ai/codex-auth-repository"
import pkg from "../../package.json"

async function runInjectedAi(
  rootPath: string,
  args: string[],
  createChatCompletion: AiTextGenerationClient["createChatCompletion"],
) {
  const previousRoot = process.env.BLUENOTE_ROOT
  process.env.BLUENOTE_ROOT = rootPath
  try {
    return await runCliAsync(args, pkg.version, {
      ai: {
        aiClient: {
          createChatCompletion,
        },
      },
    })
  } finally {
    if (previousRoot === undefined) {
      delete process.env.BLUENOTE_ROOT
    } else {
      process.env.BLUENOTE_ROOT = previousRoot
    }
  }
}

function extractKey(stdout: string): string {
  const match = stdout.match(/^Created note\nKey: (.+)\n/m)
  assert.notEqual(match, null)
  return match?.[1] ?? ""
}

function fakeJwt(payload: Record<string, unknown>): string {
  return [
    Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "signature-secret",
  ].join(".")
}

test("bn ai describe auto-applies a mock provider description and updates list/search indexes", async () => {
    const harness = await createManagedRootHarness("bluenote-cli-ai-describe-")

    try {
      const createResult = harness.run(["new", "--title", "Project Notes"], {
        BLUENOTE_TEST_NOW: "2026-06-01T00:00:00.000Z",
        BLUENOTE_TEST_RANDOM_SEQUENCE: "0x12345678",
      })
      assert.equal(createResult.exitCode, 0)
      const key = extractKey(createResult.stdout)

      await Bun.write(path.join(harness.rootPath, "notes", "inbox", `${key}.md`), "Project tasks and deadlines.\n")
      assert.equal(harness.run(["rebuild"]).exitCode, 0)

      const setConfig = harness.run([
        "ai",
        "config",
        "set",
        "--base-url",
        "http://127.0.0.1:4321/v1",
        "--api-key",
        "test-token",
        "--model",
        "test-model",
      ])
      assert.equal(setConfig.exitCode, 0)

      const prompt = readDescribeNotePrompt(harness.rootPath)
      enqueueDescribeNoteJob(harness.rootPath, {
        key,
        relativePath: `notes/inbox/${key}.md`,
        title: "Project Notes",
        body: "Project tasks and deadlines.\n",
        currentDescription: "",
        promptHash: prompt.hash,
      })

      const describeResult = await runInjectedAi(harness.rootPath, ["ai", "describe", key], async (request) => {
        assert.equal(request.apiKey, undefined)
        assert.equal(request.model, "test-model")
        return {
          text: "Concise AI project summary.",
          usage: { promptTokens: 10, completionTokens: 4, totalTokens: 14 },
        }
      })

      assert.equal(describeResult.exitCode, 0)
      assert.equal(describeResult.stderr, "")
      assert.match(describeResult.stdout, new RegExp(`Updated AI description for ${key}`))
      assert.match(describeResult.stdout, /Description: Concise AI project summary\./)

      const sidecar = JSON.parse(await readFile(path.join(harness.rootPath, ".data", "notes", `${key}.json`), "utf8"))
      assert.equal(sidecar.description, "Concise AI project summary.")
      assert.equal(sidecar.updatedAt, "2026-06-01T00:00:00.000Z")
      assert.match(sidecar.ai.description.lastProcessedAt, /^\d{4}-\d{2}-\d{2}T/)

      const queue = JSON.parse(await readFile(path.join(harness.rootPath, ".data", "ai", "queue.json"), "utf8"))
      assert.deepEqual(queue.jobs, [])

      const listResult = harness.run(["list"])
      assert.equal(listResult.exitCode, 0)
      assert.match(listResult.stdout, /Project Notes\t.+\tConcise AI project summary\.\tnotes\/inbox\//)

      const searchResult = harness.run(["search", "Concise AI"])
      assert.equal(searchResult.exitCode, 0)
      assert.match(searchResult.stdout, /Project Notes/)
      assert.match(searchResult.stdout, /description/)

      const markdown = await readFile(path.join(harness.rootPath, "notes", "inbox", `${key}.md`), "utf8")
      assert.equal(markdown, "Project tasks and deadlines.\n")
    } finally {
      await harness.cleanup()
    }
}, 20_000)

test("bn ai describe sanitizes provider errors before returning CLI output", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-ai-describe-sanitized-error-")

  try {
    const createResult = harness.run(["new", "--title", "Secret Provider Failure"], {
      BLUENOTE_TEST_NOW: "2026-06-01T00:00:00.000Z",
      BLUENOTE_TEST_RANDOM_SEQUENCE: "0x12345678",
    })
    assert.equal(createResult.exitCode, 0)
    const key = extractKey(createResult.stdout)

    const setConfig = harness.run([
      "ai",
      "config",
      "set",
      "--base-url",
      "http://127.0.0.1:4321/v1",
      "--api-key",
      "test-token-secret",
      "--model",
      "test-model",
    ])
    assert.equal(setConfig.exitCode, 0)

    const result = await runInjectedAi(harness.rootPath, ["ai", "describe", key], async () => {
      throw new Error(
        "401 test-token-secret rejected jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJibHVlbm90ZSJ9.providerSignature and Bearer abc.def.ghi",
      )
    })

    assert.equal(result.exitCode, 1)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /AI provider request failed: 401 \[redacted\] rejected jwt \[redacted\] and Bearer \[redacted\]/)
    assert.match(result.stderr, /Hint: The existing note description was left unchanged\./)
    assert.doesNotMatch(
      result.stderr,
      /test-token-secret|eyJhbGciOiJIUzI1NiJ9\.eyJzdWIiOiJibHVlbm90ZSJ9\.providerSignature|abc\.def\.ghi/,
    )
  } finally {
    await harness.cleanup()
  }
}, 20_000)

test("bn ai describe surfaces invalid description details", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-ai-describe-invalid-detail-")

  try {
    const createResult = harness.run(["new", "--title", "Invalid Detail"], {
      BLUENOTE_TEST_NOW: "2026-06-01T00:00:00.000Z",
      BLUENOTE_TEST_RANDOM_SEQUENCE: "0x12345678",
    })
    assert.equal(createResult.exitCode, 0)
    const key = extractKey(createResult.stdout)

    const setConfig = harness.run([
      "ai",
      "config",
      "set",
      "--base-url",
      "http://127.0.0.1:4321/v1",
      "--api-key",
      "test-token-secret",
      "--model",
      "test-model",
    ])
    assert.equal(setConfig.exitCode, 0)

    const result = await runInjectedAi(harness.rootPath, ["ai", "describe", key], async () => ({
      text: "This output has far too many words to be accepted by BlueNote.",
    }))

    assert.equal(result.exitCode, 1)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /Provider returned an invalid description: description must be under 10 words\./)
    assert.match(result.stderr, /Hint: The existing note description was left unchanged\./)
  } finally {
    await harness.cleanup()
  }
}, 20_000)

test("bn ai describe surfaces stale result details separately from invalid output", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-ai-describe-stale-detail-")

  try {
    const createResult = harness.run(["new", "--title", "Stale Detail"], {
      BLUENOTE_TEST_NOW: "2026-06-01T00:00:00.000Z",
      BLUENOTE_TEST_RANDOM_SEQUENCE: "0x12345678",
    })
    assert.equal(createResult.exitCode, 0)
    const key = extractKey(createResult.stdout)

    const setConfig = harness.run([
      "ai",
      "config",
      "set",
      "--base-url",
      "http://127.0.0.1:4321/v1",
      "--api-key",
      "test-token-secret",
      "--model",
      "test-model",
    ])
    assert.equal(setConfig.exitCode, 0)

    const result = await runInjectedAi(harness.rootPath, ["ai", "describe", key], async () => {
      await Bun.write(path.join(harness.rootPath, "notes", "inbox", `${key}.md`), "Changed while provider was running.\n")
      return { text: "Fresh result ignored." }
    })

    assert.equal(result.exitCode, 1)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /AI description result was stale: note changed while AI description was generating; skipped stale result\./)
    assert.match(result.stderr, /Hint: The existing note description was left unchanged\. Run bn ai describe again to refresh it\./)
  } finally {
    await harness.cleanup()
  }
}, 20_000)

test("bn ai describe creates the default Codex provider from root-local auth", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-ai-describe-codex-")

  try {
    const createResult = harness.run(["new", "--title", "Codex Provider Note"], {
      BLUENOTE_TEST_NOW: "2026-06-01T00:00:00.000Z",
      BLUENOTE_TEST_RANDOM_SEQUENCE: "0x12345678",
    })
    assert.equal(createResult.exitCode, 0)
    const key = extractKey(createResult.stdout)

    const setConfig = harness.run(["ai", "config", "set", "--provider", "codex", "--model", "codex-test-model"])
    assert.equal(setConfig.exitCode, 0)

    createCodexAuthRepository(harness.rootPath).write({
      version: 1,
      provider: "codex",
      authType: "device-code-oauth",
      idToken: fakeJwt({ chatgpt_account_id: "workspace-123" }),
      accessToken: "access-token-secret",
      refreshToken: "refresh-token-secret",
      expiresAt: "2099-06-04T12:30:00.000Z",
      createdAt: "2026-06-04T12:00:00.000Z",
      updatedAt: "2026-06-04T12:00:00.000Z",
      issuer: "https://auth.openai.com",
      clientId: "client-id",
    })

    const calls: Array<{ input: string | URL | Request; init?: RequestInit }> = []
    const previousRoot = process.env.BLUENOTE_ROOT
    process.env.BLUENOTE_ROOT = harness.rootPath
    try {
      const result = await runCliAsync(["ai", "describe", key], pkg.version, {
        ai: {
          fetch: async (input, init) => {
            calls.push({ input, init })
            return new Response(JSON.stringify({ output_text: "Codex generated description." }), { status: 200 })
          },
        },
      })

      assert.equal(result.exitCode, 0)
      assert.match(result.stdout, /Description: Codex generated description\./)
    } finally {
      if (previousRoot === undefined) {
        delete process.env.BLUENOTE_ROOT
      } else {
        process.env.BLUENOTE_ROOT = previousRoot
      }
    }

    assert.equal(String(calls[0].input), "https://chatgpt.com/backend-api/codex/responses")
    assert.equal((calls[0].init?.headers as Record<string, string>).authorization, "Bearer access-token-secret")
    assert.equal((calls[0].init?.headers as Record<string, string>)["ChatGPT-Account-ID"], "workspace-123")
    const body = JSON.parse(String(calls[0].init?.body)) as Record<string, unknown>
    assert.equal(body.model, "codex-test-model")
    assert.equal(body.stream, true)
    assert.equal(body.store, false)
    assert.equal(body.tool_choice, "none")
    assert.equal(body.parallel_tool_calls, false)
    assert.ok(Array.isArray(body.input))
    assert.equal(typeof body.instructions, "string")
  } finally {
    await harness.cleanup()
  }
}, 20_000)
