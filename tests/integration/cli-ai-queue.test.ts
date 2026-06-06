import { test } from "bun:test"
import assert from "node:assert/strict"
import path from "node:path"
import { readFile } from "node:fs/promises"

import { createManagedRootHarness } from "../helpers/cli"
import { enqueueDescribeNoteJob, markDescribeNoteJobFailedIfContentHashMatches } from "../../src/ai/queue-service"
import { readDescribeNotePrompt } from "../../src/ai/prompt-repository"
import { runCliAsync } from "../../src/cli/entry"
import type { AiTextGenerationClient } from "../../src/ai/provider"
import { CodexTextGenerationClientError } from "../../src/ai/codex-client"
import pkg from "../../package.json"

const SUBPROCESS_HEAVY_TIMEOUT_MS = 45_000

async function runInjectedAi(
  rootPath: string,
  args: string[],
  createChatCompletion?: AiTextGenerationClient["createChatCompletion"],
) {
  let count = 0
  const previousRoot = process.env.BLUENOTE_ROOT
  process.env.BLUENOTE_ROOT = rootPath
  try {
    return await runCliAsync(args, pkg.version, {
      ai: {
        aiClient: {
          async createChatCompletion(input) {
            if (createChatCompletion) {
              return createChatCompletion(input)
            }

            count += 1
            return { text: `AI summary ${count}.`, usage: { totalTokens: count } }
          },
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

async function runAiWithoutInjectedClient(rootPath: string, args: string[]) {
  const previousRoot = process.env.BLUENOTE_ROOT
  process.env.BLUENOTE_ROOT = rootPath
  try {
    return await runCliAsync(args, pkg.version)
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

async function createQueuedNote(harness: Awaited<ReturnType<typeof createManagedRootHarness>>, title: string, random: string) {
  const createResult = harness.run(["new", "--title", title], {
    BLUENOTE_TEST_NOW: "2026-06-01T00:00:00.000Z",
    BLUENOTE_TEST_RANDOM_SEQUENCE: random,
  })
  assert.equal(createResult.exitCode, 0)
  const key = extractKey(createResult.stdout)
  const body = `${title} body.\n`
  await Bun.write(path.join(harness.rootPath, "notes", "inbox", `${key}.md`), body)
  assert.equal(harness.run(["rebuild"]).exitCode, 0)
  const prompt = readDescribeNotePrompt(harness.rootPath)
  enqueueDescribeNoteJob(harness.rootPath, {
    key,
    relativePath: `notes/inbox/${key}.md`,
    title,
    body,
    currentDescription: "",
    promptHash: prompt.hash,
  })
  return key
}

test("bn ai queue lists pending jobs", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-ai-queue-")

  try {
    const firstKey = await createQueuedNote(harness, "First Queue Note", "0x11111111")
    const secondKey = await createQueuedNote(harness, "Second Queue Note", "0x22222222")

    const result = harness.run(["ai", "queue"])

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.match(result.stdout, /Pending AI jobs: 2/)
    assert.match(result.stdout, new RegExp(`describe-note\\s+${firstKey}\\s+notes/inbox/${firstKey}\\.md`))
    assert.match(result.stdout, new RegExp(`describe-note\\s+${secondKey}\\s+notes/inbox/${secondKey}\\.md`))
  } finally {
    await harness.cleanup()
  }
}, SUBPROCESS_HEAVY_TIMEOUT_MS)

test("bn ai process-queue --limit 2 processes only two jobs and prints a summary", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-ai-process-queue-")

  try {
    const keys = [
      await createQueuedNote(harness, "First Process Note", "0x11111111"),
      await createQueuedNote(harness, "Second Process Note", "0x22222222"),
      await createQueuedNote(harness, "Third Process Note", "0x33333333"),
    ]

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

    const result = await runInjectedAi(harness.rootPath, ["ai", "process-queue", "--limit", "2"])

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.match(result.stdout, /Processed AI queue: 2 applied, 0 failed, 1 remaining\./)

    const firstSidecar = JSON.parse(await readFile(path.join(harness.rootPath, ".data", "notes", `${keys[0]}.json`), "utf8"))
    const secondSidecar = JSON.parse(await readFile(path.join(harness.rootPath, ".data", "notes", `${keys[1]}.json`), "utf8"))
    const thirdSidecar = JSON.parse(await readFile(path.join(harness.rootPath, ".data", "notes", `${keys[2]}.json`), "utf8"))
    assert.equal(firstSidecar.description, "AI summary 1.")
    assert.equal(secondSidecar.description, "AI summary 2.")
    assert.equal(thirdSidecar.description, "")

    const queue = JSON.parse(await readFile(path.join(harness.rootPath, ".data", "ai", "queue.json"), "utf8"))
    assert.deepEqual(queue.jobs.map((job: { key: string }) => job.key), [keys[2]])
  } finally {
    await harness.cleanup()
  }
}, SUBPROCESS_HEAVY_TIMEOUT_MS)

test("bn ai process-queue cleans up deleted-note jobs without provider calls", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-ai-process-queue-deleted-")

  try {
    const deletedKey = await createQueuedNote(harness, "Deleted Process Note", "0x44444444")
    const existingKey = await createQueuedNote(harness, "Existing Process Note", "0x55555555")
    const deleteResult = harness.run(["delete", deletedKey, "--force"])
    assert.equal(deleteResult.exitCode, 0)

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

    let providerCalls = 0
    const result = await runInjectedAi(harness.rootPath, ["ai", "process-queue"], async () => {
      providerCalls += 1
      return { text: "Existing summary." }
    })

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.equal(providerCalls, 1)
    assert.match(result.stdout, /Processed AI queue: 1 applied, 0 failed, 0 remaining\./)

    const queue = JSON.parse(await readFile(path.join(harness.rootPath, ".data", "ai", "queue.json"), "utf8"))
    assert.deepEqual(queue.jobs, [])
    const existingSidecar = JSON.parse(await readFile(path.join(harness.rootPath, ".data", "notes", `${existingKey}.json`), "utf8"))
    assert.equal(existingSidecar.description, "Existing summary.")
  } finally {
    await harness.cleanup()
  }
}, SUBPROCESS_HEAVY_TIMEOUT_MS)

test("bn ai process-queue forgets deleted failed retryable jobs without retrying provider", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-ai-process-queue-deleted-failed-")

  try {
    const key = await createQueuedNote(harness, "Deleted Failed Process Note", "0x66666666")
    const queue = JSON.parse(await readFile(path.join(harness.rootPath, ".data", "ai", "queue.json"), "utf8"))
    assert.equal(markDescribeNoteJobFailedIfContentHashMatches({
      rootPath: harness.rootPath,
      key,
      contentHash: queue.jobs[0].contentHash,
      lastError: "prior provider failure",
    }), true)
    const deleteResult = harness.run(["delete", key, "--force"])
    assert.equal(deleteResult.exitCode, 0)

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

    let providerCalls = 0
    const result = await runInjectedAi(harness.rootPath, ["ai", "process-queue"], async () => {
      providerCalls += 1
      throw new Error("provider must not be called")
    })

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.equal(providerCalls, 0)
    assert.match(result.stdout, /Processed AI queue: 0 applied, 0 failed, 0 remaining\./)

    const queueAfter = JSON.parse(await readFile(path.join(harness.rootPath, ".data", "ai", "queue.json"), "utf8"))
    assert.deepEqual(queueAfter.jobs, [])
  } finally {
    await harness.cleanup()
  }
}, SUBPROCESS_HEAVY_TIMEOUT_MS)

test("bn ai process-queue reports malformed existing-note cleanup errors as job failures with summary", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-ai-process-queue-malformed-existing-")

  try {
    const key = await createQueuedNote(harness, "Malformed Existing Process Note", "0x77777777")
    await Bun.write(path.join(harness.rootPath, ".data", "notes", `${key}.json`), "{ not valid json")

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

    let providerCalls = 0
    const result = await runInjectedAi(harness.rootPath, ["ai", "process-queue"], async () => {
      providerCalls += 1
      return { text: "Should not be reached." }
    })

    assert.notEqual(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.equal(providerCalls, 0)
    assert.match(result.stdout, /Processed AI queue: 0 applied, 1 failed, 0 remaining\./)

    const queue = JSON.parse(await readFile(path.join(harness.rootPath, ".data", "ai", "queue.json"), "utf8"))
    assert.equal(queue.jobs.length, 1)
    assert.equal(queue.jobs[0].key, key)
    assert.equal(queue.jobs[0].status, "failed")
    assert.equal(queue.jobs[0].attempts, 1)
  } finally {
    await harness.cleanup()
  }
}, SUBPROCESS_HEAVY_TIMEOUT_MS)

test("bn ai process-queue exits non-zero when a queued job fails and still prints a summary", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-ai-process-queue-failure-")

  try {
    const key = await createQueuedNote(harness, "Failing Process Note", "0x44444444")

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

    const result = await runInjectedAi(harness.rootPath, ["ai", "process-queue"], async () => {
      throw new Error("provider unavailable")
    })

    assert.notEqual(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.match(result.stdout, /Processed AI queue: 0 applied, 1 failed, 0 remaining\./)

    const queue = JSON.parse(await readFile(path.join(harness.rootPath, ".data", "ai", "queue.json"), "utf8"))
    assert.equal(queue.jobs.length, 1)
    assert.equal(queue.jobs[0].key, key)
    assert.equal(queue.jobs[0].status, "failed")
    assert.equal(queue.jobs[0].attempts, 1)
    assert.equal(queue.jobs[0].lastError, "provider unavailable")
  } finally {
    await harness.cleanup()
  }
}, SUBPROCESS_HEAVY_TIMEOUT_MS)

test("bn ai process-queue leaves Codex jobs pending without consuming attempts when auth is missing", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-ai-process-queue-codex-auth-missing-")

  try {
    const key = await createQueuedNote(harness, "Codex Auth Missing Process Note", "0x88888888")

    const setConfig = harness.run([
      "ai",
      "config",
      "set",
      "--provider",
      "codex",
      "--model",
      "gpt-5.1-codex",
    ])
    assert.equal(setConfig.exitCode, 0)

    const firstResult = await runAiWithoutInjectedClient(harness.rootPath, ["ai", "process-queue"])
    const secondResult = await runAiWithoutInjectedClient(harness.rootPath, ["ai", "process-queue"])

    assert.notEqual(firstResult.exitCode, 0)
    assert.equal(firstResult.stderr, "")
    assert.match(firstResult.stdout, /Processed AI queue: 0 applied, 0 failed, 1 remaining\./)
    assert.notEqual(secondResult.exitCode, 0)
    assert.equal(secondResult.stderr, "")
    assert.match(secondResult.stdout, /Processed AI queue: 0 applied, 0 failed, 1 remaining\./)

    const queue = JSON.parse(await readFile(path.join(harness.rootPath, ".data", "ai", "queue.json"), "utf8"))
    assert.equal(queue.jobs.length, 1)
    assert.equal(queue.jobs[0].key, key)
    assert.equal(queue.jobs[0].status, "pending")
    assert.equal(queue.jobs[0].attempts, 0)
    assert.equal(queue.jobs[0].lastError, null)
  } finally {
    await harness.cleanup()
  }
}, SUBPROCESS_HEAVY_TIMEOUT_MS)

test("bn ai process-queue leaves Codex jobs pending without consuming attempts when auth refresh fails", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-ai-process-queue-codex-refresh-failure-")

  try {
    const key = await createQueuedNote(harness, "Codex Refresh Failure Process Note", "0x99999999")

    const setConfig = harness.run([
      "ai",
      "config",
      "set",
      "--provider",
      "codex",
      "--model",
      "gpt-5.1-codex",
    ])
    assert.equal(setConfig.exitCode, 0)

    const firstResult = await runInjectedAi(harness.rootPath, ["ai", "process-queue"], async () => {
      throw new CodexTextGenerationClientError("Codex auth refresh failed: Codex token refresh failed with status 400: invalid_grant. Run bn ai codex auth login.")
    })
    const secondResult = await runInjectedAi(harness.rootPath, ["ai", "process-queue"], async () => {
      throw new CodexTextGenerationClientError("Codex auth refresh failed: Codex token refresh failed with status 400: invalid_grant. Run bn ai codex auth login.")
    })

    assert.notEqual(firstResult.exitCode, 0)
    assert.equal(firstResult.stderr, "")
    assert.match(firstResult.stdout, /Processed AI queue: 0 applied, 0 failed, 1 remaining\./)
    assert.notEqual(secondResult.exitCode, 0)
    assert.equal(secondResult.stderr, "")
    assert.match(secondResult.stdout, /Processed AI queue: 0 applied, 0 failed, 1 remaining\./)

    const queue = JSON.parse(await readFile(path.join(harness.rootPath, ".data", "ai", "queue.json"), "utf8"))
    assert.equal(queue.jobs.length, 1)
    assert.equal(queue.jobs[0].key, key)
    assert.equal(queue.jobs[0].status, "pending")
    assert.equal(queue.jobs[0].attempts, 0)
    assert.equal(queue.jobs[0].lastError, null)
  } finally {
    await harness.cleanup()
  }
}, SUBPROCESS_HEAVY_TIMEOUT_MS)

test("bn ai process-queue leaves refreshed newer jobs pending when an older provider call fails", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-ai-process-queue-stale-failure-")

  try {
    const key = await createQueuedNote(harness, "Stale Failure Note", "0x55555555")
    const prompt = readDescribeNotePrompt(harness.rootPath)

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

    const result = await runInjectedAi(harness.rootPath, ["ai", "process-queue"], async () => {
      const refreshedBody = "Fresh body queued while an older provider call fails.\n"
      await Bun.write(path.join(harness.rootPath, "notes", "inbox", `${key}.md`), refreshedBody)
      assert.equal(harness.run(["rebuild"]).exitCode, 0)
      enqueueDescribeNoteJob(harness.rootPath, {
        key,
        relativePath: `notes/inbox/${key}.md`,
        title: "Stale Failure Note",
        body: refreshedBody,
        currentDescription: "",
        promptHash: prompt.hash,
      })
      throw new Error("old provider failed")
    })

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.match(result.stdout, /Processed AI queue: 0 applied, 0 failed, 1 remaining\./)

    const queue = JSON.parse(await readFile(path.join(harness.rootPath, ".data", "ai", "queue.json"), "utf8"))
    assert.equal(queue.jobs.length, 1)
    assert.equal(queue.jobs[0].key, key)
    assert.equal(queue.jobs[0].status, "pending")
    assert.equal(queue.jobs[0].attempts, 0)
    assert.equal(queue.jobs[0].lastError, null)
  } finally {
    await harness.cleanup()
  }
}, SUBPROCESS_HEAVY_TIMEOUT_MS)
