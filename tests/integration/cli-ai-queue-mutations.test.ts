import { test } from "bun:test"
import assert from "node:assert/strict"
import path from "node:path"
import { mkdir, readFile, rm } from "node:fs/promises"
import { existsSync } from "node:fs"

import { createManagedRootHarness, type ManagedRootHarness } from "../helpers/cli"
import { hashDescribeNoteContent } from "../../src/ai/queue-service"
import { createNoteDescription } from "../../src/domain/note-description"

const SUBPROCESS_HEAVY_TIMEOUT_MS = 45_000

async function readQueue(rootPath: string) {
  return JSON.parse(await readFile(path.join(rootPath, ".data", "ai", "queue.json"), "utf8"))
}

function extractKey(stdout: string): string {
  const match = stdout.match(/^Created note\nKey: (.+)\n/m)
  assert.notEqual(match, null)
  return match?.[1] ?? ""
}

async function configureAi(rootPath: string, run: ManagedRootHarness["run"]) {
  const result = run([
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
  assert.equal(result.exitCode, 0)
  assert.ok(existsSync(path.join(rootPath, ".data", "ai", "config.json")))
}

test("bn new enqueues a describe-note job when AI is configured", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-ai-new-queue-")

  try {
    assert.equal(harness.run(["init"]).exitCode, 0)
    await configureAi(harness.rootPath, harness.run)

    const result = harness.run(["new", "--title", "Queued New Note"], {
      BLUENOTE_TEST_NOW: "2026-06-01T00:00:00.000Z",
    })

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    const key = extractKey(result.stdout)
    const queue = await readQueue(harness.rootPath)
    assert.equal(queue.version, 1)
    assert.equal(queue.jobs.length, 1)
    assert.equal(queue.jobs[0].kind, "describe-note")
    assert.equal(queue.jobs[0].key, key)
    assert.equal(queue.jobs[0].relativePath, `notes/inbox/${key}.md`)
    assert.equal(queue.jobs[0].status, "pending")
    assert.equal(queue.jobs[0].contentHash, hashDescribeNoteContent({ title: "Queued New Note", body: "", currentDescription: "" }))
    assert.match(queue.jobs[0].promptHash, /^sha256:[a-f0-9]{64}$/)
  } finally {
    await harness.cleanup()
  }
}, SUBPROCESS_HEAVY_TIMEOUT_MS)

test("bn edit refreshes a describe-note job after body changes", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-ai-edit-queue-")

  try {
    assert.equal(harness.run(["init"]).exitCode, 0)
    await configureAi(harness.rootPath, harness.run)
    const created = harness.run(["new", "--title", "Editable Queue Note"], {
      BLUENOTE_TEST_NOW: "2026-06-01T00:00:00.000Z",
    })
    assert.equal(created.exitCode, 0)
    const key = extractKey(created.stdout)
    const initialQueue = await readQueue(harness.rootPath)
    const initialHash = initialQueue.jobs[0].contentHash

    const editedBody = "Changed CLI body for queue refresh.\nSecond line."
    const editor = await harness.writeFakeEditorScript(editedBody)
    const result = harness.run(["edit", key], {
      EDITOR: editor,
      BLUENOTE_TEST_NOW: "2026-06-01T00:05:00.000Z",
    })

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    const queue = await readQueue(harness.rootPath)
    assert.equal(queue.jobs.length, 1)
    assert.equal(queue.jobs[0].key, key)
    assert.equal(queue.jobs[0].status, "pending")
    assert.notEqual(queue.jobs[0].contentHash, initialHash)
    assert.equal(queue.jobs[0].contentHash, hashDescribeNoteContent({
      title: "Editable Queue Note",
      body: editedBody,
      currentDescription: createNoteDescription(editedBody),
    }))
    assert.equal(await readFile(path.join(harness.rootPath, "notes", "inbox", `${key}.md`), "utf8"), editedBody)
  } finally {
    await harness.cleanup()
  }
}, SUBPROCESS_HEAVY_TIMEOUT_MS)

test("no AI config leaves normal new workflow unchanged and does not create queue.json", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-no-ai-new-")

  try {
    assert.equal(harness.run(["init"]).exitCode, 0)
    const result = harness.run(["new", "--title", "No AI Note"], {
      BLUENOTE_TEST_NOW: "2026-06-01T00:00:00.000Z",
    })

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    const key = extractKey(result.stdout)
    assert.match(result.stdout, new RegExp(`^Created note\\nKey: ${harness.escapeForRegExp(key)}\\nPath: notes/inbox/${harness.escapeForRegExp(key)}\\.md\\n$`))
    assert.equal(existsSync(path.join(harness.rootPath, ".data", "ai", "queue.json")), false)
  } finally {
    await harness.cleanup()
  }
}, SUBPROCESS_HEAVY_TIMEOUT_MS)

test("queue write failure warns but does not fail a CLI note save", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-ai-queue-fail-")

  try {
    assert.equal(harness.run(["init"]).exitCode, 0)
    await configureAi(harness.rootPath, harness.run)
    await rm(path.join(harness.rootPath, ".data", "ai", "queue.json"), { force: true })
    await mkdir(path.join(harness.rootPath, ".data", "ai", "queue.json"))

    const result = harness.run(["new", "--title", "Queue Failure Still Saves"], {
      BLUENOTE_TEST_NOW: "2026-06-01T00:00:00.000Z",
    })

    assert.equal(result.exitCode, 0)
    assert.match(result.stderr, /Warning: could not enqueue AI description refresh/i)
    const key = extractKey(result.stdout)
    assert.equal(await readFile(path.join(harness.rootPath, "notes", "inbox", `${key}.md`), "utf8"), "")
  } finally {
    await harness.cleanup()
  }
}, SUBPROCESS_HEAVY_TIMEOUT_MS)

test("bn edit does not enqueue or refresh when the note body and title are unchanged", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-ai-edit-no-change-")

  try {
    assert.equal(harness.run(["init"]).exitCode, 0)
    await configureAi(harness.rootPath, harness.run)
    const created = harness.run(["new", "--title", "Unchanged Queue Note"], {
      BLUENOTE_TEST_NOW: "2026-06-01T00:00:00.000Z",
    })
    assert.equal(created.exitCode, 0)
    const key = extractKey(created.stdout)
    const initialQueue = await readQueue(harness.rootPath)

    const editor = await harness.writeFakeEditorScript("")
    const result = harness.run(["edit", key], {
      EDITOR: editor,
      BLUENOTE_TEST_NOW: "2026-06-01T00:05:00.000Z",
    })

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.deepEqual(await readQueue(harness.rootPath), initialQueue)
  } finally {
    await harness.cleanup()
  }
}, SUBPROCESS_HEAVY_TIMEOUT_MS)

test("bn edit rename replaces stale old-key describe-note job", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-ai-edit-rename-queue-")

  try {
    assert.equal(harness.run(["init"]).exitCode, 0)
    await configureAi(harness.rootPath, harness.run)
    const created = harness.run(["new", "--title", "Old Queue Title"], {
      BLUENOTE_TEST_NOW: "2026-06-01T00:00:00.000Z",
    })
    assert.equal(created.exitCode, 0)
    const oldKey = extractKey(created.stdout)

    const editedBody = "# Renamed Queue Title\nRenamed body for queue refresh."
    const editor = await harness.writeFakeEditorScript(editedBody)
    const result = harness.run(["edit", oldKey], {
      EDITOR: editor,
      BLUENOTE_TEST_NOW: "2026-06-01T00:05:00.000Z",
    })

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    const queue = await readQueue(harness.rootPath)
    assert.equal(queue.jobs.length, 1)
    assert.notEqual(queue.jobs[0].key, oldKey)
    assert.match(queue.jobs[0].key, /^renamed-queue-title(?:-[a-z0-9]+)?$/)
    assert.equal(queue.jobs[0].relativePath, `notes/inbox/${queue.jobs[0].key}.md`)
  } finally {
    await harness.cleanup()
  }
}, SUBPROCESS_HEAVY_TIMEOUT_MS)

test("no AI config leaves normal edit workflow unchanged and does not create queue.json", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-no-ai-edit-")

  try {
    assert.equal(harness.run(["init"]).exitCode, 0)
    const created = harness.run(["new", "--title", "No AI Edit Note"])
    assert.equal(created.exitCode, 0)
    const key = extractKey(created.stdout)
    const editor = await harness.writeFakeEditorScript("Edited without AI")
    const result = harness.run(["edit", key], { EDITOR: editor })

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.equal(existsSync(path.join(harness.rootPath, ".data", "ai", "queue.json")), false)
    assert.equal(await readFile(path.join(harness.rootPath, "notes", "inbox", `${key}.md`), "utf8"), "Edited without AI")
  } finally {
    await harness.cleanup()
  }
}, SUBPROCESS_HEAVY_TIMEOUT_MS)

test("queue write failure warns but does not fail a CLI edit save", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-ai-edit-queue-fail-")

  try {
    assert.equal(harness.run(["init"]).exitCode, 0)
    const created = harness.run(["new", "--title", "Edit Queue Failure Still Saves"])
    assert.equal(created.exitCode, 0)
    const key = extractKey(created.stdout)
    await configureAi(harness.rootPath, harness.run)
    await rm(path.join(harness.rootPath, ".data", "ai", "queue.json"), { force: true })
    await mkdir(path.join(harness.rootPath, ".data", "ai", "queue.json"))

    const editor = await harness.writeFakeEditorScript("Edited despite queue failure")
    const result = harness.run(["edit", key], { EDITOR: editor })

    assert.equal(result.exitCode, 0)
    assert.match(result.stderr, /Warning: could not enqueue AI description refresh/i)
    assert.equal(await readFile(path.join(harness.rootPath, "notes", "inbox", `${key}.md`), "utf8"), "Edited despite queue failure")
  } finally {
    await harness.cleanup()
  }
}, SUBPROCESS_HEAVY_TIMEOUT_MS)
