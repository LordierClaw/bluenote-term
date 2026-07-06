import { test } from "bun:test"
import assert from "node:assert/strict"
import path from "node:path"
import { access, readFile } from "node:fs/promises"

import { createManagedRootHarness, type CliRunResult } from "../helpers/cli"
import { readSidecarByKey } from "../helpers/sidecar"

function extractCreatedKey(stdout: string): string {
  const match = stdout.match(/^Created note\nKey: (.+)\n/m)
  assert.notEqual(match, null, `expected created note key in stdout:\n${stdout}`)
  return match?.[1] ?? ""
}

function runOk(
  harness: Awaited<ReturnType<typeof createManagedRootHarness>>,
  step: string,
  args: string[],
  extraEnv?: Record<string, string | undefined>,
): CliRunResult {
  const result = harness.run(args, extraEnv)

  assert.equal(result.exitCode, 0, `${step} should exit 0\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`)
  assert.equal(result.stderr, "", `${step} should not write stderr`)

  return result
}

test("AI description workflow runs end to end against a mock OpenAI-compatible provider", async () => {
  const harness = await createManagedRootHarness("bluenote-ai-e2e-")
  const providerRequests: Array<{ authorization: string | null; body: unknown }> = []
  const mockDescription = "Mock project task summary."
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url)
      if (request.method !== "POST" || url.pathname !== "/v1/chat/completions") {
        return new Response("not found", { status: 404 })
      }

      const body = await request.json()
      providerRequests.push({
        authorization: request.headers.get("authorization"),
        body,
      })

      return Response.json({
        id: "chatcmpl-mock-ai-e2e",
        object: "chat.completion",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: mockDescription },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 12,
          completion_tokens: 4,
          total_tokens: 16,
        },
      })
    },
  })

  try {
    const initResult = runOk(harness, "bn init", ["init"])
    assert.match(initResult.stdout, new RegExp(`Initialized BlueNote root: ${harness.escapeForRegExp(harness.rootPath)}`))

    const configResult = runOk(harness, "bn ai config set", [
      "ai",
      "config",
      "set",
      "--base-url",
      `${server.url}v1`,
      "--api-key",
      "test-token",
      "--model",
      "test-model",
    ])
    assert.match(configResult.stdout, /AI config saved\./)
    assert.match(configResult.stdout, /API key is stored in plaintext/)

    const createResult = runOk(harness, "bn new", ["new", "Project task body."], {
      BLUENOTE_TEST_NOW: "2026-06-01T00:00:00.000Z",
      BLUENOTE_TEST_RANDOM_SEQUENCE: "0x12345678",
    })
    const key = extractCreatedKey(createResult.stdout)
    assert.match(createResult.stdout, new RegExp(`Path: draft/${key}\\.md`))

    const queuePath = path.join(harness.rootPath, ".data", "ai", "queue.json")
    const queued = JSON.parse(await readFile(queuePath, "utf8"))
    assert.equal(queued.version, 1)
    assert.equal(queued.jobs.length, 1)
    assert.equal(queued.jobs[0].kind, "describe-note")
    assert.equal(queued.jobs[0].key, key)
    assert.equal(queued.jobs[0].relativePath, `draft/${key}.md`)
    assert.equal(queued.jobs[0].status, "pending")

    const processResult = await harness.runAsync(["ai", "process-queue"])
    assert.equal(
      processResult.exitCode,
      0,
      `bn ai process-queue should exit 0\nstdout:\n${processResult.stdout}\nstderr:\n${processResult.stderr}`,
    )
    assert.equal(processResult.stderr, "", "bn ai process-queue should not write stderr")
    assert.equal(processResult.stdout, "Processed AI queue: 1 applied, 0 failed, 0 remaining.\n")

    assert.equal(providerRequests.length, 1)
    assert.equal(providerRequests[0]?.authorization, "Bearer test-token")
    assert.equal((providerRequests[0]?.body as { model?: string }).model, "test-model")
    assert.match(JSON.stringify(providerRequests[0]?.body), new RegExp(key))

    const sidecar = await readSidecarByKey(harness.rootPath, key)
    assert.equal(sidecar.description, mockDescription)

    const markdown = await readFile(path.join(harness.rootPath, "draft", `${key}.md`), "utf8")
    assert.equal(markdown, "Project task body.")
    assert.doesNotMatch(markdown, /^---$/m)
    assert.doesNotMatch(markdown, /description:/)

    const listResult = runOk(harness, "bn list --drafts", ["list", "--drafts"])
    assert.match(listResult.stdout, new RegExp(`${key}\\t${key}\\t${harness.escapeForRegExp(mockDescription)}\\tdraft/${key}\\.md`))

    const searchResult = runOk(harness, "bn search --drafts", ["search", "--drafts", "Mock project task"])
    assert.match(searchResult.stdout, new RegExp(key))
    assert.match(searchResult.stdout, new RegExp(`key: ${key}`))
    assert.match(searchResult.stdout, /match: description/)

    const usageLogPath = path.join(harness.rootPath, ".data", "ai", "logs", "usage.jsonl")
    const resultsLogPath = path.join(harness.rootPath, ".data", "ai", "logs", "results.jsonl")
    await access(usageLogPath)
    await access(resultsLogPath)

    const usageLines = (await readFile(usageLogPath, "utf8")).trim().split("\n")
    const resultLines = (await readFile(resultsLogPath, "utf8")).trim().split("\n")
    assert.equal(usageLines.length, 1)
    assert.equal(resultLines.length, 1)

    const usageRecord = JSON.parse(usageLines[0] ?? "{}")
    assert.equal(usageRecord.key, key)
    assert.equal(usageRecord.model, "test-model")
    assert.equal(usageRecord.status, "applied")
    assert.equal(usageRecord.usage.totalTokens, 16)

    const resultRecord = JSON.parse(resultLines[0] ?? "{}")
    assert.equal(resultRecord.key, key)
    assert.equal(resultRecord.status, "applied")
    assert.equal(resultRecord.description, mockDescription)
  } finally {
    server.stop(true)
    await harness.cleanup()
  }
}, 30_000)
