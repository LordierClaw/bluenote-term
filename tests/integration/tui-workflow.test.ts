import { describe, test, beforeEach, afterEach } from "bun:test"
import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import { mkdtemp, rm, readFile, access } from "node:fs/promises"

import { createNote } from "../../src/core/create-note"
import { initRoot } from "../../src/core/init-root"
import { rebuildIndexes } from "../../src/core/rebuild-indexes"
import { showNote } from "../../src/core/show-note"
import { buildSearchEverythingPreview } from "../../src/tui/adapters/search-everything-adapter"
import { createDefaultWorkspaceController } from "../../src/tui/app"
import type { WorkspaceCommandContext } from "../../src/tui/workspace-controller"

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
