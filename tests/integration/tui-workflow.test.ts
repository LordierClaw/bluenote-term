import { describe, test, beforeEach, afterEach } from "bun:test"
import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import { mkdtemp, rm, readFile, access, readdir, writeFile, mkdir } from "node:fs/promises"
import { existsSync, mkdirSync } from "node:fs"

import { createAiConfigRepository } from "../../src/ai/config-repository"
import { createCodexAuthRepository } from "../../src/ai/codex-auth-repository"
import { CodexTextGenerationClientError } from "../../src/ai/codex-client"
import { enqueueDescribeNoteJob, hashDescribeNoteContent, markDescribeNoteJobFailedIfContentHashMatches } from "../../src/ai/queue-service"
import { createNote } from "../../src/core/create-note"
import { initRoot } from "../../src/core/init-root"
import { listNotes } from "../../src/core/list-notes"
import { rebuildIndexes } from "../../src/core/rebuild-indexes"
import { showNote } from "../../src/core/show-note"
import { buildSearchEverythingPreview, type SearchEverythingContentResult } from "../../src/tui/adapters/search-everything-adapter"
import { createDefaultWorkspaceController, createDesktopClipboardModel, routeWorkspaceKey } from "../../src/tui/app"
import { buildEditorViewModel } from "../../src/tui/render-editor"
import { routeManagerKey } from "../../src/tui/render-manager"
import { createWorkspaceController } from "../../src/tui/workspace-controller"
import { ATOMIC_NOTE_WRITER_TEMP_PREFIX } from "../../src/storage/atomic-note-writer"
import { getStateTmpPath } from "../../src/storage/root-layout"
import { createLatestOpenedNoteRepository } from "../../src/tui/latest-opened-note"

function fixedClock(iso: string) {
  return { now: () => new Date(iso) }
}

type DefaultWorkspaceController = ReturnType<typeof createDefaultWorkspaceController>

function openManagerNoteByKey(controller: DefaultWorkspaceController, key: string): void {
  assert.deepEqual(controller.showManager(), { blocked: false })

  const visited = new Set<string>()
  function openFromCurrentFolder(): boolean {
    const state = controller.getState()
    const currentFolderPath = state.manager.currentFolderPath ?? ""
    if (visited.has(currentFolderPath)) {
      return false
    }
    visited.add(currentFolderPath)

    const noteIndex = state.manager.items.findIndex((item) => item.type === "note" && item.key === key)
    if (noteIndex !== -1) {
      controller.focusManagerItem(noteIndex)
      assert.equal(controller.openFocusedManagerItem().blocked, false)
      return true
    }

    const folders = state.manager.items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.type === "folder")
    for (const { item, index } of folders) {
      controller.focusManagerItem(index)
      assert.equal(controller.openFocusedManagerItem().blocked, false)
      if (openFromCurrentFolder()) {
        return true
      }
      assert.equal(controller.goBack().blocked, false)
      assert.equal(controller.getState().manager.currentFolderPath, currentFolderPath)
    }
    return false
  }

  assert.equal(openFromCurrentFolder(), true, `missing manager note ${key}`)
}

async function countNoteSidecars(rootPath: string): Promise<number> {
  const entries = await readdir(path.join(rootPath, ".data", "notes"), { withFileTypes: true })
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json")).length
}

async function waitForAutosave(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 900))
}

async function waitForCondition(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now()
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("condition was not met before timeout")
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

function configureAiForTui(rootPath: string): void {
  createAiConfigRepository(rootPath).write({
    version: 1,
    enabled: true,
    provider: "openai-compatible",
    baseUrl: "http://127.0.0.1:4321/v1",
    apiKey: "test-token",
    model: "test-model",
    logging: {
      usage: true,
      conversations: false,
      results: true,
    },
  })
}

function configureDisabledAiForTui(rootPath: string): void {
  createAiConfigRepository(rootPath).write({
    version: 1,
    enabled: false,
    provider: "openai-compatible",
    baseUrl: "http://127.0.0.1:4321/v1",
    apiKey: "disabled-test-token",
    model: "disabled-test-model",
    logging: {
      usage: true,
      conversations: false,
      results: true,
    },
  })
}

function configureCodexForTui(rootPath: string): void {
  createAiConfigRepository(rootPath).write({
    version: 1,
    enabled: true,
    provider: "codex",
    model: "codex-test-model",
    logging: {
      usage: true,
      conversations: false,
      results: true,
    },
  })
}

function writeExpiredCodexAuth(rootPath: string): void {
  createCodexAuthRepository(rootPath).write({
    version: 1,
    provider: "codex",
    authType: "device-code-oauth",
    idToken: "expired-id-token-secret",
    accessToken: "expired-access-token-secret",
    refreshToken: "refresh-token-secret",
    expiresAt: "2026-05-26T10:00:00.000Z",
    createdAt: "2026-05-26T09:00:00.000Z",
    updatedAt: "2026-05-26T09:00:00.000Z",
    issuer: "https://chatgpt.com",
    clientId: "codex-client-id",
  })
}

function createFakeScheduler() {
  type ScheduledTask = { id: number; callback: () => void; delay: number; cleared: boolean }
  const tasks: ScheduledTask[] = []
  let nextId = 1

  return {
    tasks,
    setTimeout(callback: () => void, delay: number) {
      const task = { id: nextId++, callback, delay, cleared: false }
      tasks.push(task)
      return task.id
    },
    clearTimeout(handle: unknown) {
      const task = tasks.find((candidate) => candidate.id === handle)
      if (task) {
        task.cleared = true
      }
    },
    runNext() {
      const task = tasks.find((candidate) => !candidate.cleared)
      if (!task) {
        throw new Error("No scheduled task to run")
      }
      task.cleared = true
      task.callback()
    },
    activeTasks() {
      return tasks.filter((task) => !task.cleared)
    },
  }
}

async function readAiQueue(rootPath: string) {
  return JSON.parse(await readFile(path.join(rootPath, ".data", "ai", "queue.json"), "utf8"))
}

async function markDescriptionProcessedAt(rootPath: string, key: string, lastProcessedAt: string): Promise<void> {
  const sidecarPath = path.join(rootPath, ".data", "notes", `${key}.json`)
  const sidecar = JSON.parse(await readFile(sidecarPath, "utf8"))
  sidecar.ai = { description: { lastProcessedAt } }
  await writeFile(sidecarPath, JSON.stringify(sidecar, null, 2) + "\n", "utf8")
}

function openManagerFolderPath(controller: DefaultWorkspaceController, folderPath: string): void {
  const directFolderIndex = controller.getState().manager.items.findIndex((item) => item.type === "folder" && item.relativePath === folderPath)
  if (directFolderIndex !== -1) {
    controller.focusManagerItem(directFolderIndex)
    assert.equal(controller.openFocusedManagerItem().blocked, false)
    return
  }

  const parts = folderPath.split("/").filter(Boolean)
  let prefix = ""

  for (const part of parts) {
    prefix = prefix ? `${prefix}/${part}` : part
    const folderIndex = controller.getState().manager.items.findIndex((item) => item.type === "folder" && item.relativePath === prefix)
    assert.notEqual(folderIndex, -1, `missing manager folder ${prefix}`)
    controller.focusManagerItem(folderIndex)
    assert.equal(controller.openFocusedManagerItem().blocked, false)
  }
}

describe("TUI workspace workflows", () => {
  let rootPath: string

  beforeEach(async () => {
    rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-tui-workflow-"))
    initRoot({ override: rootPath })
  })

  afterEach(async () => {
    await rm(rootPath, { recursive: true, force: true })
  })

  test("startup opens recorded note if path exists and openedAt is within TTL", () => {
    const restoredNote = createNote({
      override: rootPath,
      title: "Restore Me",
      body: "restored body",
      clock: fixedClock("2026-06-05T12:00:00.000Z"),
    })
    createLatestOpenedNoteRepository(rootPath).write({
      relativePath: restoredNote.relativePath,
      openedAt: "2026-06-05T12:00:00.000Z",
    })

    const controller = createDefaultWorkspaceController({
      rootPath,
      clock: fixedClock("2026-06-06T12:00:00.000Z"),
      cleanupStaleAtomicTemps: () => {},
    })

    assert.equal(controller.getState().screen, "editor")
    assert.equal(controller.getState().editor?.note.relativePath, restoredNote.relativePath)
    assert.deepEqual(createLatestOpenedNoteRepository(rootPath).read(), {
      relativePath: restoredNote.relativePath,
      openedAt: "2026-06-06T12:00:00.000Z",
    })
  })

  test("startup creates and opens draft when latest-opened is stale", () => {
    const staleNote = createNote({
      override: rootPath,
      title: "Stale Restore",
      body: "stale body",
      clock: fixedClock("2026-05-01T12:00:00.000Z"),
    })
    createLatestOpenedNoteRepository(rootPath).write({
      relativePath: staleNote.relativePath,
      openedAt: "2026-05-01T12:00:00.000Z",
    })

    const controller = createDefaultWorkspaceController({
      rootPath,
      clock: fixedClock("2026-06-06T12:00:00.000Z"),
      cleanupStaleAtomicTemps: () => {},
    })

    const opened = controller.getState().editor?.note
    assert.equal(controller.getState().screen, "editor")
    assert.ok(opened?.relativePath.startsWith("draft/"))
    assert.notEqual(opened?.relativePath, staleNote.relativePath)
    assert.equal(createLatestOpenedNoteRepository(rootPath).read()?.relativePath, opened?.relativePath)
  })

  test("startup creates and opens draft when latest-opened path is missing", async () => {
    createLatestOpenedNoteRepository(rootPath).write({
      relativePath: "note/missing.md",
      openedAt: "2026-06-06T11:00:00.000Z",
    })

    const controller = createDefaultWorkspaceController({
      rootPath,
      clock: fixedClock("2026-06-06T12:00:00.000Z"),
      cleanupStaleAtomicTemps: () => {},
    })

    const opened = controller.getState().editor?.note
    assert.equal(controller.getState().screen, "editor")
    assert.ok(opened?.relativePath.startsWith("draft/"))
    assert.equal(createLatestOpenedNoteRepository(rootPath).read()?.relativePath, opened?.relativePath)
    await access(path.join(rootPath, opened?.relativePath ?? "missing"))
  })

  test("loads manager rows after creating derived indexes for a freshly initialized root", async () => {
    const freshRootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-tui-fresh-root-"))

    try {
      initRoot({ override: freshRootPath })

      const controller = createDefaultWorkspaceController({ rootPath: freshRootPath })

      assert.equal(controller.getState().screen, "editor")
      assert.ok(controller.getState().editor?.note.relativePath.startsWith("draft/"))
      assert.deepEqual(controller.showManager(), { blocked: false })
      assert.deepEqual(
        controller.getState().manager.items.map((item) => `${item.type}:${item.relativePath}`),
        ["folder:draft"],
      )
      assert.deepEqual(JSON.parse(await readFile(path.join(freshRootPath, ".data", "config.json"), "utf8")), {
        latestOpenedNoteTtlDays: 7,
      })
    } finally {
      await rm(freshRootPath, { recursive: true, force: true })
    }
  })

  test("manager shows filesystem-seeded empty user folders while hiding internal note folders", async () => {
    await mkdir(path.join(rootPath, "note", "projects", "empty-client"), { recursive: true })
    await mkdir(path.join(rootPath, "note", ".data", "shadow"), { recursive: true })
    await mkdir(path.join(rootPath, "note", ".cache", "scratch"), { recursive: true })
    await mkdir(path.join(rootPath, "note", "projects", ".hidden-child"), { recursive: true })
    rebuildIndexes({ override: rootPath })

    const controller = createDefaultWorkspaceController({ rootPath })
    assert.deepEqual(controller.showManager(), { blocked: false })

    assert.deepEqual(
      controller.getState().manager.items.map((item) => `${item.type}:${item.relativePath}`),
      [
        "folder:draft",
        "folder:note",
      ],
    )

    openManagerFolderPath(controller, "note/projects")
    assert.deepEqual(controller.getState().manager.items.map((item) => `${item.type}:${item.relativePath}`), [
      "folder:note/projects/empty-client",
    ])

    assert.equal(controller.openFocusedManagerItem().blocked, false)
    assert.equal(controller.getState().manager.currentFolderPath, "note/projects/empty-client")
    assert.equal(controller.getManagerBrowserModel().empty, true)
  })

  test("manager filter navigation routes to rows filtered by visible filename and opens the focused note", () => {
    const first = createNote({
      override: rootPath,
      title: "Alpha Filter Target",
      body: "alpha body",
      clock: fixedClock("2026-05-26T10:00:00.000Z"),
    })
    const second = createNote({
      override: rootPath,
      title: "Beta Filter Target",
      body: "beta body",
      clock: fixedClock("2026-05-26T10:01:00.000Z"),
    })
    rebuildIndexes({ override: rootPath })

    const controller = createDefaultWorkspaceController({ rootPath })
    openManagerFolderPath(controller, path.dirname(first.relativePath))
    assert.equal(path.dirname(second.relativePath), path.dirname(first.relativePath))

    controller.openManagerFilter()
    for (const key of "filter-target") {
      assert.equal(routeManagerKey(key, controller), true)
    }
    assert.deepEqual(controller.getState().manager.items.map((item) => item.key), [first.key, second.key])

    assert.equal(routeManagerKey("\u001b[B", controller), true)
    assert.equal(controller.getState().manager.focusedIndex, 1)
    assert.equal(routeManagerKey("\u001b[C", controller), true)

    assert.equal(controller.getState().screen, "editor")
    assert.equal(controller.getState().editor?.note.key, second.key)

    assert.equal(controller.showManager().blocked, false)
    controller.openManagerFilter()
    controller.updateManagerFilter("beta-filter")
    assert.equal(routeManagerKey("\u001b[D", controller), true)
    assert.equal(controller.getState().mode, "manager.browse")
    assert.equal(controller.getState().manager.filterQuery, "")
  })

  test("TUI controller bootstrap removes only stale BlueNote atomic writer temps", async () => {
    const tempPath = getStateTmpPath(rootPath)
    const staleWriterTemp = path.join(tempPath, `${ATOMIC_NOTE_WRITER_TEMP_PREFIX}tui-stale.tmp`)
    const unrelatedTemp = path.join(tempPath, "editor-swap.tmp")
    const normalNote = createNote({
      override: rootPath,
      title: "Normal Note",
      body: "normal note body",
      clock: fixedClock("2026-05-26T10:00:00.000Z"),
    })
    rebuildIndexes({ override: rootPath })

    await writeFile(staleWriterTemp, "stale temp", "utf8")
    await writeFile(unrelatedTemp, "unrelated temp", "utf8")

    const controller = createDefaultWorkspaceController({ rootPath })

    assert.equal(controller.getState().screen, "editor")
    assert.deepEqual(controller.showManager(), { blocked: false })
    await assert.rejects(() => access(staleWriterTemp))
    assert.equal(await readFile(unrelatedTemp, "utf8"), "unrelated temp")
    assert.equal(await readFile(path.join(rootPath, normalNote.relativePath), "utf8"), "normal note body")
  })

  test("TUI controller bootstrap surfaces atomic temp cleanup failures", () => {
    assert.throws(
      () => createDefaultWorkspaceController({
        rootPath,
        cleanupStaleAtomicTemps: () => {
          throw new Error("injected cleanup failure")
        },
      }),
      /injected cleanup failure/,
    )
  })

  test("loads manager rows, opens a note, edits body, saves, and persists the plain note file", async () => {
    const first = createNote({
      override: rootPath,
      title: "Daily Ideas",
      body: "Initial body with café",
      clock: fixedClock("2026-05-26T10:00:00.000Z"),
    })
    createNote({
      override: rootPath,
      title: "Second Note",
      body: "Another note",
      clock: fixedClock("2026-05-26T10:01:00.000Z"),
    })
    rebuildIndexes({ override: rootPath })

    const controller = createDefaultWorkspaceController({ rootPath })
    openManagerNoteByKey(controller, first.key)
    assert.equal(controller.getState().screen, "editor")
    assert.equal(controller.getState().editor?.body, "Initial body with café")

    const changedBody = "Updated TUI body ✨\n続きの行"
    controller.updateEditorBody(changedBody)
    assert.equal(controller.getState().editor?.dirty, true)

    assert.equal(controller.runCommand("/save").blocked, false)

    assert.equal(controller.getState().editor?.dirty, false)
    assert.equal(showNote({ override: rootPath, selector: first.key }).body, changedBody)
    assert.equal(await readFile(path.join(rootPath, first.relativePath), "utf8"), changedBody)
  })

  test("AI idle TUI save enqueues and processes the queue in the background after save returns", async () => {
    const aiIdleScheduler = createFakeScheduler()
    const first = createNote({
      override: rootPath,
      title: "TUI Queued Save",
      body: "Initial TUI body",
      clock: fixedClock("2026-05-26T10:00:00.000Z"),
    })
    configureAiForTui(rootPath)
    assert.equal(existsSync(path.join(rootPath, ".data", "ai", "queue.json")), false)
    rebuildIndexes({ override: rootPath })
    let providerCalls = 0

    const controller = createDefaultWorkspaceController({
      rootPath,
      aiIdleScheduler,
      aiClient: {
        createChatCompletion: async () => {
          providerCalls += 1
          return { text: "Updated TUI idle summary." }
        },
      },
    })
    openManagerNoteByKey(controller, first.key)

    const changedBody = "Updated TUI body that should be queued."
    controller.updateEditorBody(changedBody)
    assert.equal(controller.runCommand("/save").blocked, false)

    assert.equal(showNote({ override: rootPath, selector: first.key }).body, changedBody)
    assert.equal(providerCalls, 0)
    assert.equal(existsSync(path.join(rootPath, ".data", "ai", "queue.json")), false)
    assert.deepEqual(aiIdleScheduler.activeTasks().map((task) => task.delay), [10_000])

    aiIdleScheduler.runNext()
    await waitForCondition(() => providerCalls === 1)
    await waitForCondition(() => controller.getState().ai?.kind === "updated")

    const queue = await readAiQueue(rootPath)
    assert.equal(queue.jobs.length, 0)
    assert.deepEqual(controller.getState().ai, { kind: "updated", count: 1, queue: { queued: 0, failed: 0 } })
    assert.equal(showNote({ override: rootPath, selector: first.key }).description, "Updated TUI idle summary.")
    assert.equal(listNotes({ override: rootPath, visibility: "drafts" }).some((summary) => summary.key === first.key && summary.description === "Updated TUI idle summary."), true)
  })

  test("TUI autosave refreshes an existing describe-note job on AI idle when AI is configured", async () => {
    const aiIdleScheduler = createFakeScheduler()
    const first = createNote({
      override: rootPath,
      title: "TUI Queued Autosave",
      body: "Initial autosave body",
      clock: fixedClock("2026-05-26T10:00:00.000Z"),
    })
    await markDescriptionProcessedAt(rootPath, first.key, "2026-05-26T10:00:00.000Z")
    configureAiForTui(rootPath)
    rebuildIndexes({ override: rootPath })

    const controller = createDefaultWorkspaceController({ rootPath, aiIdleScheduler })
    openManagerNoteByKey(controller, first.key)

    const firstBody = "First autosaved body."
    controller.updateEditorBody(firstBody)
    await waitForAutosave()
    assert.equal(existsSync(path.join(rootPath, ".data", "ai", "queue.json")), false)
    assert.deepEqual(aiIdleScheduler.activeTasks().map((task) => task.delay), [10_000])
    aiIdleScheduler.runNext()
    const initialQueue = await readAiQueue(rootPath)
    assert.equal(initialQueue.jobs.length, 1)
    const initialHash = initialQueue.jobs[0].contentHash

    const secondBody = "Second autosaved body with latest content."
    controller.updateEditorBody(secondBody)
    await waitForAutosave()
    assert.deepEqual(aiIdleScheduler.activeTasks().map((task) => task.delay), [10_000])
    aiIdleScheduler.runNext()

    const refreshedQueue = await readAiQueue(rootPath)
    assert.equal(refreshedQueue.jobs.length, 1)
    assert.equal(refreshedQueue.jobs[0].key, first.key)
    assert.notEqual(refreshedQueue.jobs[0].contentHash, initialHash)
    const saved = showNote({ override: rootPath, selector: first.key })
    assert.equal(refreshedQueue.jobs[0].contentHash, hashDescribeNoteContent({ title: saved.title, body: secondBody, currentDescription: saved.description }))
    assert.equal(saved.body, secondBody)
  })

  test("TUI save does not enqueue when body is unchanged", async () => {
    const first = createNote({
      override: rootPath,
      title: "TUI Unchanged Save",
      body: "Stable TUI body",
      clock: fixedClock("2026-05-26T10:00:00.000Z"),
    })
    configureAiForTui(rootPath)
    rebuildIndexes({ override: rootPath })

    const controller = createDefaultWorkspaceController({ rootPath })
    openManagerNoteByKey(controller, first.key)
    assert.equal(controller.runCommand("/save").blocked, false)

    assert.equal(existsSync(path.join(rootPath, ".data", "ai", "queue.json")), false)
    assert.equal(controller.getState().editor?.statusMessage, null)
  })

  test("no AI config leaves TUI save and autosave workflows without queue.json", async () => {
    const first = createNote({
      override: rootPath,
      title: "TUI No AI Save",
      body: "Initial no AI body",
      clock: fixedClock("2026-05-26T10:00:00.000Z"),
    })
    rebuildIndexes({ override: rootPath })

    const controller = createDefaultWorkspaceController({ rootPath })
    openManagerNoteByKey(controller, first.key)
    controller.updateEditorBody("Manual save without AI")
    assert.equal(controller.runCommand("/save").blocked, false)
    controller.updateEditorBody("Autosave without AI")
    await waitForAutosave()

    assert.equal(existsSync(path.join(rootPath, ".data", "ai", "queue.json")), false)
    assert.equal(showNote({ override: rootPath, selector: first.key }).body, "Autosave without AI")
  })

  test("TUI save idle queue failure is visible and does not roll back note persistence", async () => {
    const aiIdleScheduler = createFakeScheduler()
    const first = createNote({
      override: rootPath,
      title: "TUI Queue Failure Save",
      body: "Initial failure body",
      clock: fixedClock("2026-05-26T10:00:00.000Z"),
    })
    configureAiForTui(rootPath)
    await rm(path.join(rootPath, ".data", "ai", "queue.json"), { force: true })
    await mkdir(path.join(rootPath, ".data", "ai", "queue.json"))
    rebuildIndexes({ override: rootPath })

    const controller = createDefaultWorkspaceController({ rootPath, aiIdleScheduler })
    openManagerNoteByKey(controller, first.key)
    controller.updateEditorBody("Saved despite TUI queue failure")
    assert.equal(controller.runCommand("/save").blocked, false)

    assert.equal(controller.getState().editor?.statusMessage, null)
    assert.equal(showNote({ override: rootPath, selector: first.key }).body, "Saved despite TUI queue failure")
    aiIdleScheduler.runNext()
    await waitForCondition(() => controller.getState().ai?.kind === "error")
    assert.equal(controller.getState().ai?.kind, "error")
  })

  test("TUI autosave idle queue failure is visible and does not roll back note persistence", async () => {
    const aiIdleScheduler = createFakeScheduler()
    const first = createNote({
      override: rootPath,
      title: "TUI Queue Failure Autosave",
      body: "Initial autosave failure body",
      clock: fixedClock("2026-05-26T10:00:00.000Z"),
    })
    configureAiForTui(rootPath)
    await rm(path.join(rootPath, ".data", "ai", "queue.json"), { force: true })
    await mkdir(path.join(rootPath, ".data", "ai", "queue.json"))
    rebuildIndexes({ override: rootPath })

    const controller = createDefaultWorkspaceController({ rootPath, aiIdleScheduler })
    openManagerNoteByKey(controller, first.key)
    controller.updateEditorBody("Autosaved despite TUI queue failure")
    await waitForAutosave()

    assert.equal(controller.getState().editor?.statusMessage, null)
    assert.equal(showNote({ override: rootPath, selector: first.key }).body, "Autosaved despite TUI queue failure")
    aiIdleScheduler.runNext()
    await waitForCondition(() => controller.getState().ai?.kind === "error")
    assert.equal(controller.getState().ai?.kind, "error")
  })

  test("AI startup scan starts default controller without blocking and enqueues only stale notes", async () => {
    const stale = createNote({
      override: rootPath,
      title: "Startup Stale Description",
      body: "Stale startup body should be queued.",
      clock: fixedClock("2026-05-26T10:00:00.000Z"),
    })
    const fresh = createNote({
      override: rootPath,
      title: "Startup Fresh Description",
      body: "Fresh startup body should not be queued.",
      clock: fixedClock("2026-05-26T10:01:00.000Z"),
    })
    await markDescriptionProcessedAt(rootPath, fresh.key, "2026-05-26T10:01:00.000Z")
    configureAiForTui(rootPath)
    assert.equal(existsSync(path.join(rootPath, ".data", "ai", "queue.json")), false)
    rebuildIndexes({ override: rootPath })

    const aiStartupScheduler = createFakeScheduler()
    const neverSettledCompletion = new Promise<never>(() => {})
    const controller = createDefaultWorkspaceController({
      rootPath,
      aiStartupScheduler,
      aiClient: {
        createChatCompletion: () => neverSettledCompletion,
      },
    })

    assert.equal(controller.getState().screen, "editor")
    assert.ok(controller.getState().editor?.note.relativePath.startsWith("draft/"))
    assert.equal(controller.getState().ai?.kind, "connected")
    assert.equal(existsSync(path.join(rootPath, ".data", "ai", "queue.json")), false)
    assert.equal(aiStartupScheduler.activeTasks().length, 1)
    assert.equal(aiStartupScheduler.activeTasks()[0].delay, 0)
    aiStartupScheduler.runNext()

    await waitForCondition(() => existsSync(path.join(rootPath, ".data", "ai", "queue.json")))
    const queue = await readAiQueue(rootPath)
    assert.deepEqual(queue.jobs.map((job: { key: string }) => job.key), [stale.key])
    assert.equal(queue.jobs[0].relativePath, stale.relativePath)
    assert.ok(["pending", "running"].includes(queue.jobs[0].status))
    const startupStatus = controller.getState().ai
    assert.deepEqual(startupStatus, { kind: "running", progress: { processed: 0, total: 1 }, queue: { queued: 1, failed: 0 } })
  })

  test("AI startup scan preserves existing failed queue counts when no stale work is enqueued", async () => {
    const note = createNote({
      override: rootPath,
      title: "Startup Failed Queue Count",
      body: "Already processed startup body.",
      clock: fixedClock("2026-05-26T10:00:00.000Z"),
    })
    await markDescriptionProcessedAt(rootPath, note.key, "2026-05-26T10:00:00.000Z")
    configureAiForTui(rootPath)
    const savedNote = showNote({ override: rootPath, selector: note.key })
    const contentHash = hashDescribeNoteContent({ title: savedNote.title, body: savedNote.body, currentDescription: savedNote.description })
    enqueueDescribeNoteJob(rootPath, {
      key: note.key,
      relativePath: note.relativePath,
      title: savedNote.title,
      body: savedNote.body,
      currentDescription: savedNote.description,
      promptHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    })
    assert.equal(markDescribeNoteJobFailedIfContentHashMatches({
      rootPath,
      key: note.key,
      contentHash,
      lastError: "synthetic startup failure",
    }), true)
    rebuildIndexes({ override: rootPath })

    const aiStartupScheduler = createFakeScheduler()
    const controller = createDefaultWorkspaceController({ rootPath, aiStartupScheduler })

    assert.deepEqual(controller.getState().ai, { kind: "connected", model: "test-model", queue: { queued: 0, failed: 1 } })
    aiStartupScheduler.runNext()
    await waitForCondition(() => {
      const status = controller.getState().ai
      return status?.kind === "connected" && status.queue?.failed === 1
    })

    assert.deepEqual(controller.getState().ai, { kind: "connected", model: "test-model", queue: { queued: 0, failed: 1 } })
    const queue = await readAiQueue(rootPath)
    assert.deepEqual(queue.jobs.map((job: { status: string }) => job.status), ["failed"])
  })

  test("AI startup scan processes already pending queue work when no stale work is enqueued", async () => {
    const note = createNote({
      override: rootPath,
      title: "Startup Pending Queue",
      body: "Already queued startup body.",
      clock: fixedClock("2026-05-26T10:00:00.000Z"),
    })
    await markDescriptionProcessedAt(rootPath, note.key, "2026-05-26T10:00:00.000Z")
    configureAiForTui(rootPath)
    const savedNote = showNote({ override: rootPath, selector: note.key })
    enqueueDescribeNoteJob(rootPath, {
      key: note.key,
      relativePath: note.relativePath,
      title: savedNote.title,
      body: savedNote.body,
      currentDescription: savedNote.description,
      promptHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    })
    rebuildIndexes({ override: rootPath })

    const aiStartupScheduler = createFakeScheduler()
    const controller = createDefaultWorkspaceController({
      rootPath,
      aiStartupScheduler,
      aiClient: {
        createChatCompletion: async () => ({ text: "Pending startup summary." }),
      },
    })

    assert.deepEqual(controller.getState().ai, { kind: "connected", model: "test-model", queue: { queued: 1, failed: 0 } })
    aiStartupScheduler.runNext()
    await waitForCondition(() => controller.getState().ai?.kind === "updated")

    assert.deepEqual(controller.getState().ai, { kind: "updated", count: 1, queue: { queued: 0, failed: 0 } })
    assert.equal(showNote({ override: rootPath, selector: note.key }).description, "Pending startup summary.")
  })

  test("AI startup scan timer is cleared when the default controller is disposed before idle", async () => {
    const stale = createNote({
      override: rootPath,
      title: "Disposed Startup Scan",
      body: "Disposed startup scan should not leave a pending timer.",
      clock: fixedClock("2026-05-26T10:00:00.000Z"),
    })
    configureAiForTui(rootPath)
    rebuildIndexes({ override: rootPath })
    const aiStartupScheduler = createFakeScheduler()

    const controller = createDefaultWorkspaceController({ rootPath, aiStartupScheduler })

    assert.equal(aiStartupScheduler.activeTasks().length, 1)
    controller.dispose()
    assert.equal(aiStartupScheduler.activeTasks().length, 0)
    assert.equal(existsSync(path.join(rootPath, ".data", "ai", "queue.json")), false)
  })

  test("AI startup queued stale notes can still be processed explicitly", async () => {
    const note = createNote({
      override: rootPath,
      title: "Startup Explicit Process Queue",
      body: "Startup queued body should be processed on command.",
      clock: fixedClock("2026-05-26T10:00:00.000Z"),
    })
    configureAiForTui(rootPath)
    rebuildIndexes({ override: rootPath })
    const aiStartupScheduler = createFakeScheduler()
    const controller = createDefaultWorkspaceController({
      rootPath,
      aiStartupScheduler,
      aiClient: {
        createChatCompletion: async () => ({ text: "Startup processed summary." }),
      },
    })

    assert.equal(existsSync(path.join(rootPath, ".data", "ai", "queue.json")), false)
    aiStartupScheduler.runNext()
    await waitForCondition(() => existsSync(path.join(rootPath, ".data", "ai", "queue.json")))
    assert.equal(controller.getState().ai?.kind, "running")

    await waitForCondition(() => controller.getState().ai?.kind === "updated")

    assert.deepEqual(controller.getState().ai, { kind: "updated", count: 1, queue: { queued: 0, failed: 0 } })
    assert.equal(showNote({ override: rootPath, selector: note.key }).description, "Startup processed summary.")
    assert.equal(listNotes({ override: rootPath, visibility: "drafts" }).some((summary) => summary.key === note.key && summary.description === "Startup processed summary."), true)
  })

  test("AI startup scan attempts Codex refreshable expired auth instead of preflight blocking", async () => {
    const note = createNote({
      override: rootPath,
      title: "Expired Codex Refreshable Startup",
      body: "Expired access token should still allow refresh-backed startup work.",
      clock: fixedClock("2026-05-26T10:00:00.000Z"),
    })
    configureCodexForTui(rootPath)
    writeExpiredCodexAuth(rootPath)
    rebuildIndexes({ override: rootPath })
    const aiStartupScheduler = createFakeScheduler()
    let providerCalls = 0
    const controller = createDefaultWorkspaceController({
      rootPath,
      aiStartupScheduler,
      aiClient: {
        createChatCompletion: async () => {
          providerCalls += 1
          return { text: "Refresh-backed startup summary." }
        },
      },
    })

    assert.notEqual(controller.getState().ai?.kind, "auth-required")
    aiStartupScheduler.runNext()

    await waitForCondition(() => controller.getState().ai?.kind === "updated")

    assert.equal(providerCalls, 1)
    assert.deepEqual(controller.getState().ai, { kind: "updated", count: 1, queue: { queued: 0, failed: 0 } })
    assert.equal(showNote({ override: rootPath, selector: note.key }).description, "Refresh-backed startup summary.")
  })

  test("AI process queue leaves refreshed newer jobs pending when an older provider call fails", async () => {
    const note = createNote({
      override: rootPath,
      title: "TUI Stale Failure Queue",
      body: "Original queued body.",
      clock: fixedClock("2026-05-26T10:00:00.000Z"),
    })
    configureAiForTui(rootPath)
    rebuildIndexes({ override: rootPath })
    const aiStartupScheduler = createFakeScheduler()
    const controller = createDefaultWorkspaceController({
      rootPath,
      aiStartupScheduler,
      aiClient: {
        createChatCompletion: async () => {
          const refreshedBody = "Fresh body queued while an older TUI provider call fails."
          await writeFile(path.join(rootPath, note.relativePath), refreshedBody, "utf8")
          rebuildIndexes({ override: rootPath })
          enqueueDescribeNoteJob(rootPath, {
            key: note.key,
            relativePath: note.relativePath,
            title: "TUI Stale Failure Queue",
            body: refreshedBody,
            currentDescription: "",
            promptHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          })
          throw new Error("old tui provider failed")
        },
      },
    })

    aiStartupScheduler.runNext()
    await waitForCondition(() => existsSync(path.join(rootPath, ".data", "ai", "queue.json")))
    assert.deepEqual(controller.runCommand("/ai-process-queue"), { blocked: false })
    assert.equal(controller.getState().ai?.kind, "running")

    await waitForCondition(() => controller.getState().ai?.kind !== "running")

    assert.deepEqual(controller.getState().ai, { kind: "updated", count: 0, queue: { queued: 1, failed: 0 } })
    const queue = await readAiQueue(rootPath)
    assert.equal(queue.jobs.length, 1)
    assert.equal(queue.jobs[0].key, note.key)
    assert.equal(queue.jobs[0].status, "pending")
    assert.equal(queue.jobs[0].attempts, 0)
    assert.equal(queue.jobs[0].lastError, null)
  })

  test("AI process queue cleans up deleted-note work without blocking TUI interaction", async () => {
    const deletedNote = createNote({
      override: rootPath,
      title: "Deleted TUI Queue",
      body: "Deleted stale queue body.",
      clock: fixedClock("2026-05-26T10:00:00.000Z"),
    })
    const existingNote = createNote({
      override: rootPath,
      title: "Existing TUI Queue",
      body: "Existing queue body.",
      clock: fixedClock("2026-05-26T10:01:00.000Z"),
    })
    configureAiForTui(rootPath)
    for (const note of [deletedNote, existingNote]) {
      const savedNote = showNote({ override: rootPath, selector: note.key })
      enqueueDescribeNoteJob(rootPath, {
        key: note.key,
        relativePath: note.relativePath,
        title: savedNote.title,
        body: savedNote.body,
        currentDescription: savedNote.description,
        promptHash: "sha256:4444444444444444444444444444444444444444444444444444444444444444",
      })
    }
    await rm(path.join(rootPath, deletedNote.relativePath), { force: true })
    await rm(path.join(rootPath, ".data", "notes", `${deletedNote.key}.json`), { force: true })
    rebuildIndexes({ override: rootPath })

    let providerCalls = 0
    let releaseProviderCall = () => {}
    const providerCall = new Promise<void>((resolve) => {
      releaseProviderCall = resolve
    })
    const controller = createDefaultWorkspaceController({
      rootPath,
      aiStartupScheduler: createFakeScheduler(),
      aiClient: {
        createChatCompletion: async () => {
          providerCalls += 1
          await providerCall
          return { text: "Existing TUI summary." }
        },
      },
    })

    assert.deepEqual(controller.runCommand("/ai-process-queue"), { blocked: false })
    assert.equal(controller.getState().ai?.kind, "running")
    controller.focusManagerItem(0)
    assert.equal(controller.getState().manager.focusedIndex, 0)
    assert.equal(providerCalls, 1)

    releaseProviderCall()
    await waitForCondition(() => controller.getState().ai?.kind === "updated")

    assert.deepEqual(controller.getState().ai, { kind: "updated", count: 1, queue: { queued: 0, failed: 0 } })
    assert.equal(showNote({ override: rootPath, selector: existingNote.key }).description, "Existing TUI summary.")
    const queue = await readAiQueue(rootPath)
    assert.deepEqual(queue.jobs, [])
  })

  test("AI process queue cleans up deleted-note work before Codex auth setup and does not block TUI interaction", async () => {
    const deletedNote = createNote({
      override: rootPath,
      title: "Deleted Codex Auth Queue",
      body: "Deleted codex auth queue body.",
      clock: fixedClock("2026-05-26T10:00:00.000Z"),
    })
    configureCodexForTui(rootPath)
    const savedNote = showNote({ override: rootPath, selector: deletedNote.key })
    enqueueDescribeNoteJob(rootPath, {
      key: deletedNote.key,
      relativePath: deletedNote.relativePath,
      title: savedNote.title,
      body: savedNote.body,
      currentDescription: savedNote.description,
      promptHash: "sha256:4545454545454545454545454545454545454545454545454545454545454545",
    })
    await rm(path.join(rootPath, deletedNote.relativePath), { force: true })
    await rm(path.join(rootPath, ".data", "notes", `${deletedNote.key}.json`), { force: true })
    rebuildIndexes({ override: rootPath })

    const controller = createDefaultWorkspaceController({
      rootPath,
      aiStartupScheduler: createFakeScheduler(),
    })

    assert.deepEqual(controller.runCommand("/ai-process-queue"), { blocked: false })
    assert.equal(controller.getState().ai?.kind, "running")
    controller.focusManagerItem(0)
    assert.equal(controller.getState().manager.focusedIndex, 0)

    await waitForCondition(() => controller.getState().ai?.kind === "error")

    const queue = await readAiQueue(rootPath)
    assert.deepEqual(queue.jobs, [])
  })

  test("TUI startup forgets deleted exhausted failed queue jobs before showing AI status", async () => {
    const deletedNote = createNote({
      override: rootPath,
      title: "Deleted Exhausted Queue",
      body: "Deleted exhausted queue body.",
      clock: fixedClock("2026-05-26T10:00:00.000Z"),
    })
    configureCodexForTui(rootPath)
    const savedNote = showNote({ override: rootPath, selector: deletedNote.key })
    const job = enqueueDescribeNoteJob(rootPath, {
      key: deletedNote.key,
      relativePath: deletedNote.relativePath,
      title: savedNote.title,
      body: savedNote.body,
      currentDescription: savedNote.description,
      promptHash: "sha256:4646464646464646464646464646464646464646464646464646464646464646",
    })
    for (let attempt = 0; attempt < 3; attempt += 1) {
      markDescribeNoteJobFailedIfContentHashMatches({
        rootPath,
        key: deletedNote.key,
        contentHash: job.contentHash,
        lastError: "Could not find a note matching selector.",
        updatedAt: "2026-05-26T10:02:00.000Z",
      })
    }
    await rm(path.join(rootPath, deletedNote.relativePath), { force: true })
    await rm(path.join(rootPath, ".data", "notes", `${deletedNote.key}.json`), { force: true })
    rebuildIndexes({ override: rootPath })

    const controller = createDefaultWorkspaceController({
      rootPath,
      aiStartupScheduler: createFakeScheduler(),
    })

    assert.deepEqual(controller.getState().ai, { kind: "auth-required", reason: "auth required · run bn ai codex auth login", queue: { queued: 0, failed: 0 } })
    const queue = await readAiQueue(rootPath)
    assert.deepEqual(queue.jobs, [])
  })

  test("AI process queue preserves queued jobs without attempts when AI is disabled", async () => {
    const note = createNote({
      override: rootPath,
      title: "Disabled TUI Queue",
      body: "Disabled AI should not consume queued attempts.",
      clock: fixedClock("2026-05-26T10:00:00.000Z"),
    })
    configureDisabledAiForTui(rootPath)
    rebuildIndexes({ override: rootPath })
    const savedNote = showNote({ override: rootPath, selector: note.key })
    enqueueDescribeNoteJob(rootPath, {
      key: savedNote.key,
      relativePath: savedNote.relativePath,
      title: savedNote.title,
      body: savedNote.body,
      currentDescription: savedNote.description ?? "",
      promptHash: "sha256:4747474747474747474747474747474747474747474747474747474747474747",
    })
    const controller = createDefaultWorkspaceController({
      rootPath,
      aiClient: {
        createChatCompletion: async () => {
          throw new Error("provider should not be called while AI is disabled")
        },
      },
    })

    controller.runCommand("/ai-process-queue")

    await waitForCondition(() => controller.getState().ai?.kind === "updated")

    assert.deepEqual(controller.getState().ai, { kind: "updated", count: 0, queue: { queued: 1, failed: 0 } })
    const queue = await readAiQueue(rootPath)
    assert.equal(queue.jobs.length, 1)
    assert.equal(queue.jobs[0].key, note.key)
    assert.equal(queue.jobs[0].status, "pending")
    assert.equal(queue.jobs[0].attempts, 0)
    assert.equal(queue.jobs[0].lastError, null)
  })

  test("AI process queue preserves Codex jobs when auth refresh fails without blocking TUI interaction", async () => {
    const note = createNote({
      override: rootPath,
      title: "TUI Codex Refresh Failure Queue",
      body: "Codex refresh failure should keep this job pending.",
      clock: fixedClock("2026-05-26T10:00:00.000Z"),
    })
    configureCodexForTui(rootPath)
    const savedNote = showNote({ override: rootPath, selector: note.key })
    enqueueDescribeNoteJob(rootPath, {
      key: note.key,
      relativePath: note.relativePath,
      title: savedNote.title,
      body: savedNote.body,
      currentDescription: savedNote.description,
      promptHash: "sha256:4747474747474747474747474747474747474747474747474747474747474747",
    })
    rebuildIndexes({ override: rootPath })

    const controller = createDefaultWorkspaceController({
      rootPath,
      aiStartupScheduler: createFakeScheduler(),
      aiClient: {
        createChatCompletion: async () => {
          throw new CodexTextGenerationClientError("Codex auth refresh failed: Codex token refresh failed with status 400: invalid_grant. Run bn ai codex auth login.")
        },
      },
    })

    assert.deepEqual(controller.runCommand("/ai-process-queue"), { blocked: false })
    assert.equal(controller.getState().ai?.kind, "running")
    controller.focusManagerItem(0)
    assert.equal(controller.getState().manager.focusedIndex, 0)

    await waitForCondition(() => controller.getState().ai?.kind !== "running")

    assert.deepEqual(controller.getState().ai, { kind: "error", reason: "auth required · run bn ai codex auth login", queue: { queued: 1, failed: 0 } })
    const queue = await readAiQueue(rootPath)
    assert.equal(queue.jobs.length, 1)
    assert.equal(queue.jobs[0].key, note.key)
    assert.equal(queue.jobs[0].status, "pending")
    assert.equal(queue.jobs[0].attempts, 0)
    assert.equal(queue.jobs[0].lastError, null)
  })

  test("AI process queue retries a long-note failure without blocking TUI interaction", async () => {
    const longBody = Array.from({ length: 220 }, (_, index) => `Section ${index}: detailed non-sensitive project notes for retry coverage.`).join("\n")
    const note = createNote({
      override: rootPath,
      title: "Long Retry Nonblocking",
      body: longBody,
      clock: fixedClock("2026-05-26T10:00:00.000Z"),
    })
    configureAiForTui(rootPath)
    const savedNote = showNote({ override: rootPath, selector: note.key })
    enqueueDescribeNoteJob(rootPath, {
      key: note.key,
      relativePath: note.relativePath,
      title: savedNote.title,
      body: savedNote.body,
      currentDescription: savedNote.description,
      promptHash: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
    })
    rebuildIndexes({ override: rootPath })

    let calls = 0
    let releaseSecondProviderCall = () => {}
    const secondProviderCall = new Promise<void>((resolve) => {
      releaseSecondProviderCall = resolve
    })
    const controller = createDefaultWorkspaceController({
      rootPath,
      aiStartupScheduler: createFakeScheduler(),
      aiClient: {
        createChatCompletion: async () => {
          calls += 1
          if (calls === 1) {
            return { text: "This description is deliberately far too verbose for the strict policy." }
          }
          await secondProviderCall
          return { text: "Long retry summary." }
        },
      },
    })

    assert.deepEqual(controller.runCommand("/ai-process-queue"), { blocked: false })
    await waitForCondition(() => controller.getState().ai?.kind !== "running")
    let queue = await readAiQueue(rootPath)
    assert.equal(queue.jobs.length, 1)
    assert.equal(queue.jobs[0].status, "failed")
    assert.equal(queue.jobs[0].attempts, 1)
    assert.equal(showNote({ override: rootPath, selector: note.key }).description, savedNote.description)

    assert.deepEqual(controller.runCommand("/ai-process-queue"), { blocked: false })
    assert.equal(controller.getState().ai?.kind, "running")
    controller.focusManagerItem(0)
    assert.equal(controller.getState().manager.focusedIndex, 0)
    assert.equal(controller.requestQuit().blocked, false)
    assert.equal(controller.getState().ai?.kind, "running")

    releaseSecondProviderCall()
    await waitForCondition(() => controller.getState().ai?.kind === "updated")

    assert.deepEqual(controller.getState().ai, { kind: "updated", count: 1, queue: { queued: 0, failed: 0 } })
    assert.equal(showNote({ override: rootPath, selector: note.key }).description, "Long retry summary.")
    queue = await readAiQueue(rootPath)
    assert.equal(queue.jobs.length, 0)
  })

  test("AI process queue retries existing failed jobs before max attempts", async () => {
    const failedNote = createNote({
      override: rootPath,
      title: "Existing Failed Queue Count",
      body: "Failed queue body.",
      clock: fixedClock("2026-05-26T10:00:00.000Z"),
    })
    const pendingNote = createNote({
      override: rootPath,
      title: "Pending With Failed Queue Count",
      body: "Pending queue body.",
      clock: fixedClock("2026-05-26T10:01:00.000Z"),
    })
    configureAiForTui(rootPath)
    for (const note of [failedNote, pendingNote]) {
      const savedNote = showNote({ override: rootPath, selector: note.key })
      enqueueDescribeNoteJob(rootPath, {
        key: note.key,
        relativePath: note.relativePath,
        title: savedNote.title,
        body: savedNote.body,
        currentDescription: savedNote.description,
        promptHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
      })
    }
    const failedSaved = showNote({ override: rootPath, selector: failedNote.key })
    assert.equal(markDescribeNoteJobFailedIfContentHashMatches({
      rootPath,
      key: failedNote.key,
      contentHash: hashDescribeNoteContent({ title: failedSaved.title, body: failedSaved.body, currentDescription: failedSaved.description }),
      lastError: "existing failed job",
    }), true)
    rebuildIndexes({ override: rootPath })

    const aiStartupScheduler = createFakeScheduler()
    const controller = createDefaultWorkspaceController({
      rootPath,
      aiStartupScheduler,
      aiClient: {
        createChatCompletion: async () => ({ text: "Pending success summary." }),
      },
    })

    assert.deepEqual(controller.runCommand("/ai-process-queue"), { blocked: false })
    await waitForCondition(() => controller.getState().ai?.kind === "updated")

    assert.deepEqual(controller.getState().ai, { kind: "updated", count: 2, queue: { queued: 0, failed: 0 } })
    assert.equal(showNote({ override: rootPath, selector: failedNote.key }).description, "Pending success summary.")
    assert.equal(showNote({ override: rootPath, selector: pendingNote.key }).description, "Pending success summary.")
    const queue = await readAiQueue(rootPath)
    assert.equal(queue.jobs.length, 0)
  })

  test("unwrapped long-line navigation pans cursor logically and saves exact note body", async () => {
    const longLine = "0123456789abcdefghijklmnopqrstuvwxyz日本語"
    const note = createNote({
      override: rootPath,
      title: "Long Line",
      body: longLine,
      clock: fixedClock("2026-05-26T10:00:00.000Z"),
    })
    rebuildIndexes({ override: rootPath })
    const controller = createDefaultWorkspaceController({ rootPath })

    openManagerNoteByKey(controller, note.key)
    const route = (sequence: string) => routeWorkspaceKey(sequence, controller, () => {})
    assert.equal(route("\u001bz").handled, true)
    assert.equal(controller.getState().editor?.wrapMode, "none")
    assert.equal(route("\u001b[H").handled, true)
    for (let index = 0; index < 18; index += 1) {
      assert.equal(route("\u001b[C").handled, true)
    }
    assert.equal(controller.getState().editor?.cursorOffset, 18)
    assert.equal(route("\u001b[D").handled, true)
    assert.equal(controller.getState().editor?.cursorOffset, 17)
    assert.equal(route("\u001b[F").handled, true)
    assert.equal(controller.getState().editor?.cursorOffset, Array.from(longLine).length)
    assert.equal(route("\u001bz").handled, true)
    assert.equal(controller.getState().editor?.wrapMode, "word")

    assert.deepEqual(await controller.saveEditor(), { blocked: false })
    assert.equal(await readFile(path.join(rootPath, note.relativePath), "utf8"), longLine)
    assert.equal(showNote({ override: rootPath, selector: note.key }).body, longLine)
  })

  test("edit-save-switch-quit workflow persists both edited files", async () => {
    const alphaSummary = createNote({
      override: rootPath,
      title: "Alpha Summary",
      body: "summary",
      clock: fixedClock("2026-05-26T10:00:00.000Z"),
    })
    const alphaSource = createNote({
      override: rootPath,
      title: "Alpha Source",
      body: "source",
      clock: fixedClock("2026-05-26T10:01:00.000Z"),
    })
    const beta = createNote({
      override: rootPath,
      title: "Beta",
      body: "beta",
      clock: fixedClock("2026-05-26T10:02:00.000Z"),
    })
    rebuildIndexes({ override: rootPath })
    const controller = createDefaultWorkspaceController({ rootPath })

    openManagerFolderPath(controller, path.dirname(alphaSummary.relativePath))
    controller.openManagerFilter()
    controller.updateManagerFilter("Alpha Summary")
    assert.equal(controller.getState().manager.items.some((item) => item.type === "note" && item.key === alphaSummary.key), true)
    assert.equal(controller.openFocusedManagerItem().blocked, false)
    assert.equal(controller.getState().editor?.note.key, alphaSummary.key)
    controller.insertEditorText(" saved")
    assert.deepEqual(await controller.saveEditor(), { blocked: false })

    assert.equal(controller.goBack().blocked, false)
    assert.equal(controller.getState().screen, "manager")
    controller.openManagerFilter()
    controller.updateManagerFilter("Alpha Source")
    assert.equal(controller.openFocusedManagerItem().blocked, false)
    assert.equal(controller.getState().editor?.note.key, alphaSource.key)
    assert.equal(controller.getState().editor?.body, "source")

    assert.equal(controller.goBack().blocked, false)
    controller.openManagerFilter()
    controller.updateManagerFilter("Beta")
    assert.equal(controller.openFocusedManagerItem().blocked, false)
    assert.equal(controller.getState().editor?.note.key, beta.key)
    controller.insertEditorText(" saved")
    assert.deepEqual(await controller.saveEditor(), { blocked: false })

    assert.equal(controller.requestQuit().blocked, false)
    assert.equal(await readFile(path.join(rootPath, alphaSummary.relativePath), "utf8"), "summary saved")
    assert.equal(await readFile(path.join(rootPath, alphaSource.relativePath), "utf8"), "source")
    assert.equal(await readFile(path.join(rootPath, beta.relativePath), "utf8"), "beta saved")
    assert.equal(showNote({ override: rootPath, selector: alphaSummary.key }).body, "summary saved")
    assert.equal(showNote({ override: rootPath, selector: beta.key }).body, "beta saved")
  })

  test("editor Mode A clipboard uses terminal paste plus /copy-all and /replace-all", async () => {
    const note = createNote({
      override: rootPath,
      title: "Clipboard Flow",
      body: "Alpha Beta Gamma",
      clock: fixedClock("2026-05-26T10:00:00.000Z"),
    })
    rebuildIndexes({ override: rootPath })
    let clipboardText = ""
    const controller = createDefaultWorkspaceController({
      rootPath,
      clipboard: {
        name: "test desktop clipboard",
        canRead: true,
        canWrite: true,
        readText: () => clipboardText,
        writeText: (text) => {
          clipboardText = text
        },
      },
    })

    openManagerNoteByKey(controller, note.key)
    const editorShortcuts = buildEditorViewModel(controller.getState()).bottombar.row2.shortcuts
    assert.equal(editorShortcuts.some((shortcut) => /copy|paste|copy-all|replace-all|select all|Ctrl\+A|Alt\+A/iu.test(shortcut)), false)
    assert.equal(editorShortcuts.some((shortcut) => /Alt\+[CX]|\[F[6-9]\]/u.test(shortcut)), false)

    assert.equal(clipboardText, "")

    assert.deepEqual(controller.runCommand("/copy-all"), { blocked: false })
    assert.equal(clipboardText, "Alpha Beta Gamma")
    assert.match(controller.getState().editor?.statusMessage ?? "", /Copied 16 chars/)

    clipboardText = "Replacement from clipboard"
    assert.deepEqual(controller.runCommand("/replace-all"), { blocked: false })
    assert.equal(controller.getState().editor?.body, "Replacement from clipboard")
    assert.equal(controller.getState().editor?.statusMessage, "Replaced note body with 26 chars from test desktop clipboard")

    assert.deepEqual(routeWorkspaceKey("\u001b[200~ via terminal paste\u001b[201~", controller, () => {}), { handled: true })
    assert.equal(controller.getState().editor?.body, "Replacement from via terminal paste clipboard")

    await waitForAutosave()
    assert.equal(await readFile(path.join(rootPath, note.relativePath), "utf8"), "Replacement from via terminal paste clipboard")
  })

  test("desktop clipboard adapter reads CLI paste data and falls back to OSC52 writes", () => {
    const commands: Array<{ command: string; input?: string }> = []
    const clipboard = createDesktopClipboardModel({
      platform: "linux",
      env: { WAYLAND_DISPLAY: "wayland-0" },
      stdout: { write: (text: string) => {
        commands.push({ command: "stdout", input: text })
        return true
      }, isTTY: true },
      commandExists: (command) => command === "wl-paste",
      run: (run) => {
        commands.push({ command: [run.command, ...run.args].join(" "), input: run.input })
        return run.command === "wl-paste" ? { ok: true, stdout: "External text" } : { ok: false, stdout: "" }
      },
    })

    assert.equal(clipboard.canRead, true)
    assert.equal(clipboard.canWrite, true)
    assert.equal(clipboard.readText(), "External text")
    const write = clipboard.writeText("BlueNote text")
    assert.equal(write.category, "terminal")
    assert.equal(commands.some((entry) => entry.command === "stdout" && entry.input?.includes("\u001b]52;c;")), true)
  })

  test("desktop clipboard adapter reports internal-only paste when no desktop CLI exists", () => {
    const clipboard = createDesktopClipboardModel({
      platform: "linux",
      env: { WAYLAND_DISPLAY: "wayland-0" },
      stdout: { write: () => true, isTTY: false },
      enableOsc52: false,
      commandExists: () => false,
      run: () => ({ ok: false, stdout: "" }),
    })

    assert.equal(clipboard.canRead, true)
    assert.equal(clipboard.canWrite, true)
    assert.equal(clipboard.clipboardStatus().desktopReadAvailable, false)
    assert.equal(clipboard.readText(), "")
  })

  test("desktop clipboard adapter selects cross-platform command providers without GTK fallback", () => {
    const commands: string[] = []
    const clipboard = createDesktopClipboardModel({
      platform: "darwin",
      stdout: { write: () => true },
      commandExists: (command) => command === "python3" || command === "pbpaste" || command === "pbcopy",
      run: (run) => {
        commands.push([run.command, ...run.args, run.input ?? ""].join(" "))
        if (run.command === "pbpaste") return { ok: true, stdout: "mac paste" }
        if (run.command === "pbcopy") return { ok: true, stdout: "" }
        return { ok: false, stdout: "" }
      },
    })

    assert.equal(clipboard.canRead, true)
    assert.equal(clipboard.readText(), "mac paste")
    clipboard.writeText("mac copy")
    assert.equal(commands.some((command) => command.startsWith("python3 ")), false)
    assert.equal(commands.some((command) => command.startsWith("pbpaste")), true)
    assert.equal(commands.some((command) => command.startsWith("pbcopy") && command.endsWith("mac copy")), true)
  })

  test("default TUI controller wires a desktop-capable clipboard adapter", () => {
    const note = createNote({
      override: rootPath,
      title: "Default Desktop Clipboard",
      body: "Alpha Beta Gamma",
      clock: fixedClock("2026-05-26T10:00:00.000Z"),
    })
    rebuildIndexes({ override: rootPath })
    const controller = createDefaultWorkspaceController({
      rootPath,
      createClipboard: () => ({
        name: "factory desktop clipboard",
        canRead: true,
        canWrite: true,
        readText: () => "Factory paste",
        writeText: () => undefined,
      }),
    })
    openManagerNoteByKey(controller, note.key)

    assert.deepEqual(controller.runCommand("/paste"), { blocked: false })
    assert.equal(controller.getState().editor?.body, "Alpha Beta GammaFactory paste")
    assert.equal(controller.getState().editor?.statusMessage, "Pasted 13 chars from factory desktop clipboard")
  })

  test("editor undo redo shortcuts restore body and shortcut labels are honest", () => {
    const note = createNote({
      override: rootPath,
      title: "Undo Shortcut Flow",
      body: "start",
      clock: fixedClock("2026-05-26T10:00:00.000Z"),
    })
    rebuildIndexes({ override: rootPath })
    const controller = createDefaultWorkspaceController({ rootPath })

    openManagerNoteByKey(controller, note.key)
    const shortcutLabels = buildEditorViewModel(controller.getState()).bottombar.row2.shortcuts
    assert.ok(shortcutLabels.includes("[Ctrl+Z] Undo"))
    assert.ok(shortcutLabels.includes("[Ctrl+Y] Redo"))

    controller.insertEditorText(" one")
    assert.equal(controller.getState().editor?.body, "start one")

    assert.deepEqual(routeWorkspaceKey("\u001a", controller, () => {}), { handled: true })
    assert.equal(controller.getState().editor?.body, "start")
    assert.equal(controller.getState().editor?.dirty, false)

    assert.deepEqual(routeWorkspaceKey("\u0019", controller, () => {}), { handled: true })
    assert.equal(controller.getState().editor?.body, "start one")
    assert.equal(controller.getState().editor?.dirty, true)

    assert.deepEqual(routeWorkspaceKey("\u001a", controller, () => {}), { handled: true })
    assert.deepEqual(routeWorkspaceKey("\u001a", controller, () => {}), { handled: true })
    assert.equal(controller.getState().editor?.body, "start")
  })

  test("editor replace shortcut highlights the active match and replacement flow autosaves to disk", async () => {
    const note = createNote({
      override: rootPath,
      title: "Replace Flow",
      body: "alpha beta alpha",
      clock: fixedClock("2026-05-26T10:00:00.000Z"),
    })
    rebuildIndexes({ override: rootPath })
    const controller = createDefaultWorkspaceController({ rootPath })

    openManagerNoteByKey(controller, note.key)
    controller.openEditorFind()
    controller.updateEditorFindQuery("alpha")
    controller.goBack()
    assert.equal(controller.getState().mode, "editor.body")

    assert.deepEqual(routeWorkspaceKey("\u001b[104;5u", controller, () => {}), { handled: true })
    assert.equal(controller.getState().editor?.findQuery, "")
    assert.equal(controller.getState().editor?.replaceField, "find")
    controller.updateEditorFindQuery("alpha")
    controller.setEditorReplaceField("replacement")
    controller.updateEditorReplacement("omega")

    let state = controller.getState()
    assert.equal(state.mode, "editor.replace")
    assert.equal(state.editor?.findMatchCount, 2)
    assert.deepEqual(buildEditorViewModel(state).body.activeFindRange, { start: 0, end: 5, intent: "activeItem" })

    controller.replaceCurrentEditorMatch()
    state = controller.getState()
    assert.equal(state.editor?.body, "omega beta alpha")
    assert.equal(state.editor?.dirty, true)
    assert.equal(state.editor?.autosaveStatus, "pending")
    assert.deepEqual(buildEditorViewModel(state).body.activeFindRange, { start: 11, end: 16, intent: "activeItem" })

    controller.updateEditorReplacement("done")
    controller.replaceAllEditorMatches()
    assert.equal(controller.getState().editor?.body, "omega beta done")
    await waitForAutosave()
    assert.equal(await readFile(path.join(rootPath, note.relativePath), "utf8"), "omega beta done")
  })

  test("editor replace shortcut starts on find field, accepts needle Tab thread Enter, and autosaves to disk", async () => {
    const note = createNote({
      override: rootPath,
      title: "Replace Focus Flow",
      body: "alpha needle alpha",
      clock: fixedClock("2026-05-26T10:00:00.000Z"),
    })
    rebuildIndexes({ override: rootPath })
    const controller = createDefaultWorkspaceController({ rootPath })
    const route = (sequence: string) => routeWorkspaceKey(sequence, controller, () => {})

    openManagerNoteByKey(controller, note.key)
    controller.openEditorFind()
    controller.updateEditorFindQuery("alpha")
    controller.goBack()
    assert.equal(controller.getState().editor?.findQuery, "alpha")

    assert.deepEqual(route("\u0012"), { handled: true })
    assert.equal(controller.getState().mode, "editor.replace")
    assert.equal(controller.getState().editor?.findQuery, "")
    assert.equal(controller.getState().editor?.replaceField, "find")

    for (const key of "needle") {
      assert.deepEqual(route(key), { handled: false })
      controller.updateEditorFindQuery(`${controller.getState().editor?.findQuery ?? ""}${key}`)
    }
    assert.equal(controller.getState().editor?.findQuery, "needle")
    assert.equal(controller.getState().editor?.replacementText, "")
    assert.equal(controller.getState().editor?.findMatchCount, 1)

    assert.deepEqual(route("\t"), { handled: true })
    assert.equal(controller.getState().editor?.replaceField, "replacement")
    for (const key of "thread") {
      assert.deepEqual(route(key), { handled: false })
      controller.updateEditorReplacement(`${controller.getState().editor?.replacementText ?? ""}${key}`)
    }
    assert.equal(controller.getState().editor?.replacementText, "thread")

    const replaceVm = buildEditorViewModel(controller.getState())
    assert.equal(replaceVm.find?.activeField, "replacement")
    assert.equal(replaceVm.find?.findFocused, false)
    assert.equal(replaceVm.find?.replacementFocused, true)
    assert.deepEqual(replaceVm.find?.shortcutHints, [
      { text: "1/1 matches" },
      { key: "Tab", action: "Find field" },
      { key: "Enter", action: "Replace" },
      { key: "Alt+Enter", action: "All" },
      { key: "Esc", action: "Close" },
    ])

    assert.deepEqual(route("\r"), { handled: true })
    assert.equal(controller.getState().editor?.body, "alpha thread alpha")
    await waitForAutosave()
    assert.equal(await readFile(path.join(rootPath, note.relativePath), "utf8"), "alpha thread alpha")
  }, 10_000)

  test("autosave after editor input persists and manager can switch notes without blocking", async () => {
    const first = createNote({
      override: rootPath,
      title: "Autosave Source",
      body: "Source body",
      clock: fixedClock("2026-05-26T10:00:00.000Z"),
    })
    const second = createNote({
      override: rootPath,
      title: "Autosave Switch Target",
      body: "Target body",
      clock: fixedClock("2026-05-26T10:01:00.000Z"),
    })
    rebuildIndexes({ override: rootPath })
    const controller = createDefaultWorkspaceController({ rootPath })

    openManagerNoteByKey(controller, first.key)
    assert.equal(controller.getState().screen, "editor")
    assert.equal(controller.getState().editor?.note.key, first.key)

    controller.insertEditorText(" + autosaved through controller")
    assert.equal(controller.getState().editor?.dirty, true)
    assert.equal(controller.getState().editor?.autosaveStatus, "pending")

    await waitForAutosave()

    assert.equal(controller.getState().editor?.note.key, first.key)
    assert.equal(controller.getState().editor?.note.relativePath, first.relativePath)
    assert.equal(controller.getState().editor?.body, "Source body + autosaved through controller")
    assert.equal(controller.getState().editor?.savedBody, "Source body + autosaved through controller")
    assert.equal(controller.getState().editor?.dirty, false)
    assert.equal(controller.getState().editor?.autosaveStatus, "saved")
    assert.notEqual(controller.getState().editor?.autosaveStatus, "error")
    assert.equal(await readFile(path.join(rootPath, first.relativePath), "utf8"), "Source body + autosaved through controller")

    assert.equal(controller.goBack().blocked, false)
    assert.equal(controller.getState().screen, "manager")
    assert.equal(controller.requestQuit().blocked, false)

    const secondIndex = controller.getState().manager.items.findIndex((item) => item.type === "note" && item.key === second.key)
    assert.notEqual(secondIndex, -1)
    controller.focusManagerItem(secondIndex)
    assert.equal(controller.openFocusedManagerItem().blocked, false)

    assert.equal(controller.getState().screen, "editor")
    assert.equal(controller.getState().editor?.note.key, second.key)
    assert.equal(controller.getState().editor?.body, "Target body")

    assert.equal(controller.goBack().blocked, false)
    assert.equal(controller.getState().screen, "manager")
    const firstIndexForArrow = controller.getState().manager.items.findIndex((item) => item.type === "note" && item.key === first.key)
    assert.notEqual(firstIndexForArrow, -1)
    controller.focusManagerItem(firstIndexForArrow)
    assert.equal(controller.openFocusedManagerItem().blocked, false)
    controller.insertEditorText(" again")
    await waitForAutosave()
    assert.equal(controller.goBack().blocked, false)
    const secondIndexForArrow = controller.getState().manager.items.findIndex((item) => item.type === "note" && item.key === second.key)
    assert.notEqual(secondIndexForArrow, -1)
    controller.focusManagerItem(secondIndexForArrow)
    assert.equal(routeManagerKey("\u001b[C", controller), true)
    assert.equal(controller.getState().screen, "editor")
    assert.equal(controller.getState().editor?.note.key, second.key)
  })

  test("autosave keeps saved state when derived-index rebuild fails after note persistence", async () => {
    const first = createNote({
      override: rootPath,
      title: "Post Write Rebuild Failure",
      body: "Original body",
      clock: fixedClock("2026-05-26T10:00:00.000Z"),
    })
    rebuildIndexes({ override: rootPath })
    const controller = createDefaultWorkspaceController({ rootPath })
    openManagerNoteByKey(controller, first.key)

    await rm(path.join(rootPath, ".data", "metadata.sqlite"), { force: true })
    await mkdir(path.join(rootPath, ".data", "metadata.sqlite"))

    controller.insertEditorText(" autosaved despite rebuild failure")
    await waitForAutosave()

    const expectedBody = "Original body autosaved despite rebuild failure"
    assert.equal(await readFile(path.join(rootPath, first.relativePath), "utf8"), expectedBody)
    assert.equal(showNote({ override: rootPath, selector: first.key }).body, expectedBody)
    assert.equal(controller.getState().editor?.body, expectedBody)
    assert.equal(controller.getState().editor?.savedBody, expectedBody)
    assert.equal(controller.getState().editor?.dirty, false)
    assert.equal(controller.getState().editor?.autosaveStatus, "saved")
  })

  test("dirty editor state still routes Esc, q, and Ctrl+C from manager", () => {
    const first = createNote({
      override: rootPath,
      title: "Dirty Routing Source",
      body: "Source body",
      clock: fixedClock("2026-05-26T10:00:00.000Z"),
    })
    rebuildIndexes({ override: rootPath })
    const controller = createDefaultWorkspaceController({ rootPath })
    openManagerNoteByKey(controller, first.key)
    controller.insertEditorText(" unsaved")

    assert.deepEqual(routeWorkspaceKey("\u001b", controller, () => assert.fail("Esc must not exit")), { handled: true })
    assert.equal(controller.getState().screen, "manager")
    assert.equal(controller.getState().editor?.dirty, true)

    let exitCount = 0
    assert.deepEqual(routeWorkspaceKey("q", controller, () => { exitCount += 1 }), { handled: true, exit: undefined })
    assert.equal(exitCount, 0)
    assert.equal(controller.getState().screen, "manager")

    assert.deepEqual(routeWorkspaceKey("\u0003", controller, () => { exitCount += 1 }), { handled: true, exit: undefined })
    assert.equal(exitCount, 0)
    assert.equal(controller.getState().screen, "manager")
  })

  test("dirty manager note switch is blocked with a visible status instead of reopening only the same note", () => {
    const first = createNote({
      override: rootPath,
      title: "Dirty Switch Source",
      body: "Source body",
      clock: fixedClock("2026-05-26T10:00:00.000Z"),
    })
    const second = createNote({
      override: rootPath,
      title: "Dirty Switch Target",
      body: "Target body",
      clock: fixedClock("2026-05-26T10:01:00.000Z"),
    })
    rebuildIndexes({ override: rootPath })
    const controller = createDefaultWorkspaceController({ rootPath })

    openManagerNoteByKey(controller, first.key)
    controller.insertEditorText(" unsaved")
    assert.equal(controller.goBack().blocked, false)

    const sameIndex = controller.getState().manager.items.findIndex((item) => item.type === "note" && item.key === first.key)
    assert.notEqual(sameIndex, -1)
    controller.focusManagerItem(sameIndex)
    assert.equal(routeManagerKey("\r", controller), true)
    assert.equal(controller.getState().screen, "editor")
    assert.equal(controller.getState().editor?.note.key, first.key)

    assert.equal(controller.goBack().blocked, false)
    const secondIndex = controller.getState().manager.items.findIndex((item) => item.type === "note" && item.key === second.key)
    assert.notEqual(secondIndex, -1)
    controller.focusManagerItem(secondIndex)
    assert.equal(routeManagerKey("\r", controller), true)
    assert.equal(controller.getState().screen, "manager")
    assert.equal(controller.getState().editor?.note.key, first.key)
    assert.equal(controller.getState().manager.status, "Save or discard current note first")

    assert.equal(controller.openFocusedManagerItem({ confirmed: true }).blocked, false)
    assert.equal(controller.getState().screen, "editor")
    assert.equal(controller.getState().editor?.note.key, second.key)
  })

  test("manual save after cursor-aware editor input persists through core services", async () => {
    const first = createNote({
      override: rootPath,
      title: "Cursor Save",
      body: "Alpha omega",
      clock: fixedClock("2026-05-26T10:00:00.000Z"),
    })
    rebuildIndexes({ override: rootPath })
    const controller = createDefaultWorkspaceController({ rootPath })

    openManagerNoteByKey(controller, first.key)
    controller.moveEditorCursor("left")
    controller.moveEditorCursor("left")
    controller.moveEditorCursor("left")
    controller.moveEditorCursor("left")
    controller.moveEditorCursor("left")
    controller.insertEditorText("β ")
    controller.insertEditorText("line\n")

    const changedBody = "Alpha β line\nomega"
    assert.equal(controller.getState().editor?.body, changedBody)
    assert.equal(controller.getState().editor?.dirty, true)

    const saveResult = await controller.saveEditor()
    assert.equal(saveResult.blocked, false)
    assert.equal(controller.getState().editor?.dirty, false)
    assert.equal(showNote({ override: rootPath, selector: first.key }).body, changedBody)
    assert.equal(await readFile(path.join(rootPath, first.relativePath), "utf8"), changedBody)
  })

  test("manual save refreshes search indexes for the saved note without requiring a full rebuild", async () => {
    const first = createNote({
      override: rootPath,
      title: "Incremental Save Source",
      body: "Original searchable body",
      clock: fixedClock("2026-05-26T10:00:00.000Z"),
    })
    rebuildIndexes({ override: rootPath })
    await writeFile(path.join(rootPath, ".data", "notes", "dangling-save-validation.json"), JSON.stringify({
      key: "dangling-save-validation",
      title: "Dangling validation sidecar",
      description: "This sidecar deliberately points at a missing note.",
      relativePath: "notes/missing/dangling-save-validation.md",
      createdAt: "2026-05-26T10:01:00.000Z",
      updatedAt: "2026-05-26T10:01:00.000Z",
      archivedAt: null,
      namingVersion: 1,
    }), "utf8")
    createLatestOpenedNoteRepository(rootPath).write({
      relativePath: first.relativePath,
      openedAt: "2026-05-26T10:02:00.000Z",
    })
    const controller = createDefaultWorkspaceController({ rootPath, clock: fixedClock("2026-05-26T10:02:30.000Z") })

    openManagerNoteByKey(controller, first.key)
    controller.updateEditorBody("Summary line without token\nSaved body contains lag regression token")
    assert.deepEqual(await controller.saveEditor(), { blocked: false })

    controller.openSearch("lag")
    const savedResult = controller.getSearchResults().find((result) => (result.kind === "content" || result.kind === "note") && result.key === first.key)

    assert.ok(savedResult)
    assert.equal(showNote({ override: rootPath, selector: first.key }).body, "Summary line without token\nSaved body contains lag regression token")
  })

  test("manual save atomic pre-write failure keeps TUI editor dirty and leaves note file unchanged", async () => {
    const first = createNote({
      override: rootPath,
      title: "Atomic Failure Save",
      body: "Original body before writer failure",
      clock: fixedClock("2026-05-26T10:00:00.000Z"),
    })
    rebuildIndexes({ override: rootPath })
    const controller = createDefaultWorkspaceController({ rootPath })

    openManagerNoteByKey(controller, first.key)
    controller.updateEditorBody("Unsaved body after atomic failure")

    const tempPath = getStateTmpPath(rootPath)
    await rm(tempPath, { recursive: true, force: true })
    await writeFile(tempPath, "not a temp directory", "utf8")

    const saveResult = await controller.saveEditor()

    assert.deepEqual(saveResult, { blocked: true, reason: "dirty-editor" })
    assert.equal(controller.getState().editor?.body, "Unsaved body after atomic failure")
    assert.equal(controller.getState().editor?.savedBody, "Original body before writer failure")
    assert.equal(controller.getState().editor?.dirty, true)
    assert.equal(controller.getState().editor?.autosaveStatus, "error")
    assert.equal(showNote({ override: rootPath, selector: first.key }).body, "Original body before writer failure")
    assert.equal(await readFile(path.join(rootPath, first.relativePath), "utf8"), "Original body before writer failure")
  })

  test("manager create prompt creates a real plain Markdown note through core services", async () => {
    const controller = createDefaultWorkspaceController({ rootPath, clock: fixedClock("2026-05-26T10:02:00.000Z") })

    controller.openManagerCreate()
    controller.updateManagerCreateTitle("TUI Created Note")
    const result = await controller.submitManagerCreate()

    assert.equal(result.blocked, false)
    assert.equal(controller.getState().screen, "editor")
    assert.equal(controller.getState().editor?.note.title, "TUI Created Note")
    assert.equal(controller.getState().editor?.body, "")

    const created = controller.getState().editor!.note
    const noteText = await readFile(path.join(rootPath, created.relativePath), "utf8")
    assert.equal(noteText, "")
    assert.doesNotMatch(noteText, /^---/)
    await access(path.join(rootPath, ".data", "notes", `${created.key}.json`))
    assert.equal(showNote({ override: rootPath, selector: created.key }).title, "TUI Created Note")
    assert.equal(showNote({ override: rootPath, selector: created.key }).body, "")
  })

  test("manager create prompt stays recoverable and creates no note when hidden preview dirty guard blocks", async () => {
    const existing = createNote({
      override: rootPath,
      title: "Dirty Guard Existing",
      body: "Original guard body",
      clock: fixedClock("2026-05-26T10:02:30.000Z"),
    })
    rebuildIndexes({ override: rootPath })
    const controller = createDefaultWorkspaceController({ rootPath, clock: fixedClock("2026-05-26T10:02:31.000Z") })
    const sidecarCountBefore = await countNoteSidecars(rootPath)

    openManagerNoteByKey(controller, existing.key)
    controller.updateEditorBody("Unsaved guard body")
    controller.showManager()
    controller.setManagerPreviewVisible(false)
    controller.openManagerCreate()
    controller.updateManagerCreateTitle("Blocked Dirty Create")

    const result = await controller.submitManagerCreate()

    assert.deepEqual(result, { blocked: true, reason: "dirty-editor" })
    assert.equal(controller.getState().mode, "manager.create")
    assert.equal(controller.getState().manager.previewVisible, false)
    assert.equal(controller.getState().manager.createDraft?.title, "Blocked Dirty Create")
    assert.equal(controller.getState().manager.createDraft?.status, "Save or discard current note first")
    assert.equal(controller.getState().editor?.body, "Unsaved guard body")
    assert.equal(await countNoteSidecars(rootPath), sidecarCountBefore)
  })

  test("manager delete confirmation removes a real note file and sidecar through core services", async () => {
    const created = createNote({
      override: rootPath,
      title: "TUI Delete Target",
      body: "Delete me",
      clock: fixedClock("2026-05-26T10:03:00.000Z"),
    })
    rebuildIndexes({ override: rootPath })
    const controller = createDefaultWorkspaceController({ rootPath })
    const notePath = path.join(rootPath, created.relativePath)
    const sidecarPath = path.join(rootPath, ".data", "notes", `${created.key}.json`)

    assert.equal(await readFile(notePath, "utf8"), "Delete me")
    await access(sidecarPath)

    openManagerNoteByKey(controller, created.key)
    controller.showManager()
    controller.openManagerDeleteConfirmation()
    assert.equal(controller.getState().mode, "manager.deleteConfirm")

    const result = await controller.confirmManagerDelete()

    assert.equal(result.blocked, false)
    assert.equal(controller.getState().screen, "manager")
    assert.equal(controller.getState().editor, null)
    assert.equal(controller.getState().manager.items.some((item) => item.key === created.key), false)
    await assert.rejects(() => access(notePath))
    await assert.rejects(() => access(sidecarPath))
  })

  test("opens Search Everything from editor, selects a content match, and returns to editor", () => {
    const first = createNote({
      override: rootPath,
      title: "Daily Ideas",
      body: "Needle phrase lives here",
      clock: fixedClock("2026-05-26T10:00:00.000Z"),
    })
    const second = createNote({
      override: rootPath,
      title: "Research Log",
      body: "Alpha beta gamma delta epsilon quokka zeta eta theta iota",
      clock: fixedClock("2026-05-26T10:01:00.000Z"),
    })
    rebuildIndexes({ override: rootPath })

    const controller = createDefaultWorkspaceController({ rootPath })

    openManagerNoteByKey(controller, first.key)
    assert.equal(controller.getState().screen, "editor")

    controller.openSearch("quokka")

    assert.equal(controller.getState().screen, "search")
    assert.equal(controller.getState().search?.previousScreen, "editor")

    const contentResult = controller.getSearchResults().find((result) => result.kind === "content" && result.key === second.key)
    assert.ok(contentResult)
    assert.match(buildSearchEverythingPreview(contentResult)?.lines.join("\n") ?? "", /quokka/i)

    assert.equal(controller.selectSearchResult(contentResult).blocked, false)
    assert.equal(controller.getState().screen, "editor")
    assert.equal(controller.getState().editor?.note.key, second.key)
    assert.equal(controller.getState().editor?.body, "Alpha beta gamma delta epsilon quokka zeta eta theta iota")
  })

  test("Search Everything exposes and selects every content occurrence for the same note", () => {
    const first = createNote({
      override: rootPath,
      title: "Current Note",
      body: "current body",
      clock: fixedClock("2026-05-26T10:00:00.000Z"),
    })
    const repeated = createNote({
      override: rootPath,
      title: "Repeated Occurrences",
      body: "needle on line one\nneedle on line two",
      clock: fixedClock("2026-05-26T10:01:00.000Z"),
    })
    rebuildIndexes({ override: rootPath })

    const controller = createWorkspaceController({
      listNotes: () => listNotes({ override: rootPath, visibility: "drafts" }),
      showNote: (selector) => showNote({ override: rootPath, selector }),
      searchNotes: () => [
        {
          key: repeated.key,
          title: repeated.title,
          relativePath: repeated.relativePath,
          match: { source: "content", label: "content line 1", excerpt: "...needle on line one..." },
        },
        {
          key: repeated.key,
          title: repeated.title,
          relativePath: repeated.relativePath,
          match: { source: "content", label: "content line 2", excerpt: "...needle on line two..." },
        },
      ],
    })

    openManagerNoteByKey(controller, first.key)
    controller.openSearch("needle")

    const contentResults = controller.getSearchResults().filter((result): result is SearchEverythingContentResult => result.kind === "content" && result.key === repeated.key)
    assert.equal(contentResults.length, 2)
    assert.deepEqual(contentResults.map((result) => result.id), [
      `content:${repeated.key}:content%20line%201:0`,
      `content:${repeated.key}:content%20line%202:1`,
    ])
    assert.deepEqual(contentResults.map((result) => result.matchIndex), [0, 1])
    assert.match(buildSearchEverythingPreview(contentResults[0])?.lines.join("\n") ?? "", /line one/)
    assert.match(buildSearchEverythingPreview(contentResults[1])?.lines.join("\n") ?? "", /line two/)

    assert.equal(controller.selectSearchResult(contentResults[0]).blocked, false)
    assert.equal(controller.getState().screen, "editor")
    assert.equal(controller.getState().editor?.note.key, repeated.key)

    controller.openSearch("needle")
    const secondResult = controller.getSearchResults().filter((result) => result.kind === "content" && result.key === repeated.key)[1]
    assert.ok(secondResult)
    assert.equal(controller.selectSearchResult(secondResult).blocked, false)
    assert.equal(controller.getState().screen, "editor")
    assert.equal(controller.getState().editor?.note.key, repeated.key)
  })

  test("Search Everything navigates deeply through many matches and Enter opens the selected visible result", () => {
    const created = Array.from({ length: 16 }, (_, index) => createNote({
      override: rootPath,
      title: `Many Match ${index.toString().padStart(2, "0")}`,
      body: `sharedtoken body ${index}`,
      clock: fixedClock(`2026-05-26T10:${index.toString().padStart(2, "0")}:00.000Z`),
    }))
    rebuildIndexes({ override: rootPath })

    const controller = createDefaultWorkspaceController({ rootPath })
    controller.openSearch("sharedtoken")
    for (let index = 0; index < 11; index += 1) {
      routeWorkspaceKey("\u001b[B", controller, () => {})
    }

    const selected = controller.getSearchResults()[controller.getState().search?.selectedIndex ?? 0]
    assert.ok(selected)
    assert.equal(controller.getState().search?.selectedIndex, 11)
    routeWorkspaceKey("\r", controller, () => {})

    assert.equal(controller.getState().screen, "editor")
    assert.equal(controller.getState().editor?.note.key, (selected as { key?: string }).key)
    assert.equal(created.some((note) => note.key === controller.getState().editor?.note.key), true)
  })

  test("Search Everything can select summary results and cancel when content search index is unavailable", () => {
    const first = createNote({
      override: rootPath,
      title: "Fallback Daily",
      body: "Body text that should not be needed for summary fallback",
      clock: fixedClock("2026-05-26T10:00:00.000Z"),
    })
    mkdirSync(path.join(rootPath, "note", "inbox"), { recursive: true })
    createNote({
      override: rootPath,
      type: "normal",
      title: "Folder Target",
      body: "Another body",
      destinationFolder: "note/inbox",
      clock: fixedClock("2026-05-26T10:01:00.000Z"),
    })
    rebuildIndexes({ override: rootPath })

    const controller = createWorkspaceController({
      listNotes: () => listNotes({ override: rootPath, visibility: "drafts" }),
      showNote: (selector) => showNote({ override: rootPath, selector }),
      searchNotes: () => {
        throw new Error("simulated index failure")
      },
    })

    controller.openSearch("")
    controller.updateSearchQuery("fallback")
    assert.equal(controller.getState().screen, "search")
    assert.equal(controller.getState().search?.status, "Search index unavailable; showing notes, folders, and commands only")

    const noteResult = controller.getSearchResults().find((result) => result.kind === "note" && result.key === first.key)
    assert.ok(noteResult)
    assert.equal(controller.selectSearchResult(noteResult).blocked, false)
    assert.equal(controller.getState().screen, "editor")
    assert.equal(controller.getState().editor?.note.key, first.key)

    controller.openSearch("")
    controller.updateSearchQuery("inbox")
    assert.equal(controller.getSearchResults().some((result) => result.kind === "folder" && result.path === "note/inbox"), true)
    controller.cancelSearch()
    assert.equal(controller.getState().screen, "editor")
  })

  test("default Search Everything hides unusable commands and runs shown editor commands", () => {
    createNote({
      override: rootPath,
      title: "Default Command Note",
      body: "Command body",
      clock: fixedClock("2026-05-26T10:00:00.000Z"),
    })
    rebuildIndexes({ override: rootPath })

    const controller = createDefaultWorkspaceController({ rootPath })

    controller.openSearch("/archive")
    assert.equal(controller.getSearchResults().some((result) => result.kind === "command"), false)

    controller.openSearch("Default Command")
    const noteResult = controller.getSearchResults().find((result) => result.kind === "note")
    assert.ok(noteResult)
    assert.equal(controller.selectSearchResult(noteResult).blocked, false)

    controller.openSearch("/find Command")
    const commandResult = controller.getSearchResults().find((result) => result.kind === "command" && result.name === "/find")

    assert.ok(commandResult)
    assert.equal(controller.selectSearchResult(commandResult).blocked, false)
    assert.equal(controller.getState().screen, "editor")
    assert.equal(controller.getState().mode, "editor.find")
    assert.equal(controller.getState().editor?.findQuery, "Command")
  })

  test("default TUI controller wires /ai-describe to the description service asynchronously", async () => {
    const note = createNote({
      override: rootPath,
      title: "Default AI Describe",
      body: "Body that the mock provider summarizes.",
      clock: fixedClock("2026-05-26T10:00:00.000Z"),
    })
    configureAiForTui(rootPath)
    rebuildIndexes({ override: rootPath })
    const controller = createDefaultWorkspaceController({
      rootPath,
      aiClient: {
        createChatCompletion: async () => ({ text: "Mock generated summary." }),
      },
    })

    openManagerNoteByKey(controller, note.key)
    controller.showManager()
    controller.openSearch("/ai-describe")

    assert.deepEqual(controller.runCommand("/ai-describe"), { blocked: false })
    assert.equal(controller.getState().screen, "manager")
    assert.deepEqual(controller.getState().ai, { kind: "running", key: note.key, queue: { queued: 0, failed: 0 } })
    controller.moveManagerSelection("down")

    await waitForCondition(() => controller.getState().ai?.kind === "updated")

    assert.deepEqual(controller.getState().ai, { kind: "updated", key: note.key, queue: { queued: 0, failed: 0 } })
    assert.equal(showNote({ override: rootPath, selector: note.key }).description, "Mock generated summary.")
    assert.equal(listNotes({ override: rootPath, visibility: "drafts" }).some((summary) => summary.key === note.key && summary.description === "Mock generated summary."), true)
    assert.equal(controller.getState().manager.items.some((item) => item.type === "note" && item.key === note.key && item.description === "Mock generated summary."), true)
  })

  test("manager Search Everything shows applicable manager commands and runs new/delete prompts", async () => {
    createNote({
      override: rootPath,
      title: "Command Note",
      body: "Command body",
      clock: fixedClock("2026-05-26T10:00:00.000Z"),
    })
    rebuildIndexes({ override: rootPath })
    const controller = createDefaultWorkspaceController({ rootPath })

    assert.deepEqual(controller.showManager(), { blocked: false })
    if (controller.getState().manager.currentFolderPath !== "") controller.goBack()
    controller.openSearch("/")
    assert.deepEqual(controller.getSearchResults().filter((result) => result.kind === "command").map((result) => result.name), ["/new", "/delete", "/ai-describe", "/ai-process-queue", "/ai-status"])

    const newResult = controller.getSearchResults().find((result) => result.kind === "command" && result.name === "/new")
    assert.ok(newResult)
    assert.equal(controller.selectSearchResult(newResult).blocked, false)
    assert.equal(controller.getState().screen, "manager")
    assert.equal(controller.getState().mode, "manager.create")

    controller.updateManagerCreateTitle("Created From Search")
    assert.equal((await controller.submitManagerCreate()).blocked, false)
    assert.equal(controller.getState().editor?.note.title, "Created From Search")

    controller.showManager()
    if (controller.getState().manager.currentFolderPath !== "") controller.goBack()
    controller.openSearch("/")
    assert.deepEqual(controller.getSearchResults().filter((result) => result.kind === "command").map((result) => result.name), ["/new", "/delete", "/ai-describe", "/ai-process-queue", "/ai-status"])
    const deleteResult = controller.getSearchResults().find((result) => result.kind === "command" && result.name === "/delete")

    assert.ok(deleteResult)
    assert.match(buildSearchEverythingPreview(deleteResult)?.lines.join("\n") ?? "", /^\/delete/m)
    assert.equal(controller.selectSearchResult(deleteResult).blocked, false)
    assert.equal(controller.getState().screen, "manager")
    assert.equal(controller.getState().mode, "manager.deleteConfirm")
    assert.equal((await controller.confirmManagerDelete()).blocked, false)
    assert.equal(listNotes({ override: rootPath, visibility: "drafts" }).some((note) => note.title === "Created From Search"), false)
  })
})
