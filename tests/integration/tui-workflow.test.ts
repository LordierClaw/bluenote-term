import { describe, test, beforeEach, afterEach } from "bun:test"
import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import { mkdtemp, rm, readFile, access, readdir, writeFile } from "node:fs/promises"

import { createNote } from "../../src/core/create-note"
import { initRoot } from "../../src/core/init-root"
import { listNotes } from "../../src/core/list-notes"
import { rebuildIndexes } from "../../src/core/rebuild-indexes"
import { showNote } from "../../src/core/show-note"
import { buildSearchEverythingPreview } from "../../src/tui/adapters/search-everything-adapter"
import { createDefaultWorkspaceController, routeWorkspaceKey } from "../../src/tui/app"
import { routeManagerKey } from "../../src/tui/render-manager"
import { createWorkspaceController, type WorkspaceCommandContext } from "../../src/tui/workspace-controller"
import { ATOMIC_NOTE_WRITER_TEMP_PREFIX } from "../../src/storage/atomic-note-writer"
import { getStateTmpPath } from "../../src/storage/root-layout"

function fixedClock(iso: string) {
  return { now: () => new Date(iso) }
}

type DefaultWorkspaceController = ReturnType<typeof createDefaultWorkspaceController>

function openManagerNoteByKey(controller: DefaultWorkspaceController, key: string): void {
  const rootFolderIndex = controller
    .getState()
    .manager.items.findIndex((item) => item.type === "folder" && item.relativePath === "notes/inbox")

  assert.notEqual(rootFolderIndex, -1)
  controller.focusManagerItem(rootFolderIndex)
  assert.equal(controller.openFocusedManagerItem().blocked, false)
  assert.equal(controller.getState().screen, "manager")
  assert.equal(controller.getState().manager.currentFolderPath, "notes/inbox")

  const noteIndex = controller.getState().manager.items.findIndex((item) => item.type === "note" && item.key === key)
  assert.notEqual(noteIndex, -1)
  controller.focusManagerItem(noteIndex)
  assert.equal(controller.openFocusedManagerItem().blocked, false)
}

async function countNoteSidecars(rootPath: string): Promise<number> {
  const entries = await readdir(path.join(rootPath, ".data", "notes"), { withFileTypes: true })
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json")).length
}

async function waitForAutosave(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 900))
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

  test("loads manager rows after creating derived indexes for a freshly initialized root", async () => {
    const freshRootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-tui-fresh-root-"))

    try {
      initRoot({ override: freshRootPath })

      const controller = createDefaultWorkspaceController({ rootPath: freshRootPath })

      assert.equal(controller.getState().screen, "manager")
      assert.equal(controller.getState().manager.items.length, 0)
    } finally {
      await rm(freshRootPath, { recursive: true, force: true })
    }
  })

  test("manager filter navigation routes to filtered rows and opens the focused note", () => {
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
    for (const key of "Filter Target") {
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
    controller.updateManagerFilter("Beta")
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

    assert.equal(controller.getState().screen, "manager")
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

    openManagerNoteByKey(controller, created.key)
    controller.showManager()
    controller.openManagerDeleteConfirmation()
    assert.equal(controller.getState().mode, "manager.deleteConfirm")

    const result = await controller.confirmManagerDelete()

    assert.equal(result.blocked, false)
    assert.equal(controller.getState().screen, "manager")
    assert.equal(controller.getState().editor, null)
    assert.equal(controller.getState().manager.items.some((item) => item.key === created.key), false)
    await assert.rejects(() => access(path.join(rootPath, created.relativePath)))
    await assert.rejects(() => access(path.join(rootPath, ".data", "notes", `${created.key}.json`)))
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

  test("Search Everything can select summary results and cancel when content search index is unavailable", () => {
    const first = createNote({
      override: rootPath,
      title: "Fallback Daily",
      body: "Body text that should not be needed for summary fallback",
      clock: fixedClock("2026-05-26T10:00:00.000Z"),
    })
    createNote({
      override: rootPath,
      title: "Folder Target",
      body: "Another body",
      clock: fixedClock("2026-05-26T10:01:00.000Z"),
    })
    rebuildIndexes({ override: rootPath })

    const controller = createWorkspaceController({
      listNotes: () => listNotes({ override: rootPath }),
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
    assert.equal(controller.getSearchResults().some((result) => result.kind === "folder" && result.path === "notes/inbox"), true)
    controller.cancelSearch()
    assert.equal(controller.getState().screen, "editor")
  })

  test("default Search Everything commands without handlers stay visible as unavailable", () => {
    createNote({
      override: rootPath,
      title: "Default Command Note",
      body: "Command body",
      clock: fixedClock("2026-05-26T10:00:00.000Z"),
    })
    rebuildIndexes({ override: rootPath })

    const controller = createDefaultWorkspaceController({ rootPath })

    controller.openSearch("/archive")
    const commandResult = controller.getSearchResults().find((result) => result.kind === "command" && result.name === "/archive")

    assert.ok(commandResult)
    assert.equal(controller.selectSearchResult(commandResult).blocked, false)
    assert.equal(controller.getState().screen, "search")
    assert.equal(controller.getState().search?.query, "/archive")
    assert.equal(controller.getState().search?.status, "Command unavailable: /archive")
    controller.cancelSearch()
    assert.equal(controller.getState().screen, "manager")
  })

  test("runs a Search Everything slash command with parsed command context", () => {
    createNote({
      override: rootPath,
      title: "Command Note",
      body: "Command body",
      clock: fixedClock("2026-05-26T10:00:00.000Z"),
    })
    rebuildIndexes({ override: rootPath })
    const capturedContexts: WorkspaceCommandContext[] = []

    const controller = createDefaultWorkspaceController({
      rootPath,
      commandHandlers: {
        "/rebuild": (context) => {
          capturedContexts.push(context)
        },
      },
    })

    controller.openSearch("/rebuild --force")
    const commandResult = controller.getSearchResults().find((result) => result.kind === "command" && result.name === "/rebuild")

    assert.ok(commandResult)
    assert.match(buildSearchEverythingPreview(commandResult)?.lines.join("\n") ?? "", /Usage: \/rebuild/)
    assert.equal(controller.selectSearchResult(commandResult).blocked, false)

    assert.equal(capturedContexts.length, 1)
    const capturedContext = capturedContexts.at(0) as WorkspaceCommandContext | undefined
    assert.equal(capturedContext?.command, "/rebuild --force")
    assert.equal(capturedContext?.state.screen, "manager")
  })
})
