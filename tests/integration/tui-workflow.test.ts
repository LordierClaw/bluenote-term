import { describe, test, beforeEach, afterEach } from "bun:test"
import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import { mkdtemp, rm, readFile, access, readdir } from "node:fs/promises"

import { createNote } from "../../src/core/create-note"
import { initRoot } from "../../src/core/init-root"
import { listNotes } from "../../src/core/list-notes"
import { rebuildIndexes } from "../../src/core/rebuild-indexes"
import { showNote } from "../../src/core/show-note"
import { buildSearchEverythingPreview } from "../../src/tui/adapters/search-everything-adapter"
import { createDefaultWorkspaceController } from "../../src/tui/app"
import { createWorkspaceController, type WorkspaceCommandContext } from "../../src/tui/workspace-controller"

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
