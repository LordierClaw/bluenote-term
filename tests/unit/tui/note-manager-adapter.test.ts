import { describe, test } from "bun:test"
import assert from "node:assert/strict"

import {
  buildManagerBrowserModel,
  buildManagerItems,
  buildManagerViewModel,
  goToManagerParent,
  moveManagerSelection,
  openManagerBrowserItem,
  openManagerSelection,
  type NoteManagerSummary,
} from "../../../src/tui/adapters/note-manager-adapter"
import type { ManagerState } from "../../../src/tui/state"

const summaries: NoteManagerSummary[] = [
  {
    key: "daily-plan",
    title: "Daily Plan",
    description: "Today priorities.",
    relativePath: "notes/inbox/daily-plan.md",
  },
  {
    key: "archive-review",
    title: "Archive Review",
    description: "Old ideas to revisit.",
    relativePath: "notes/archive/archive-review.md",
  },
  {
    key: "root-note",
    title: "Root Note",
    description: "A top-level note.",
    relativePath: "notes/root-note.md",
  },
]

const browserSummaries: NoteManagerSummary[] = [
  {
    key: "root-note",
    title: "Root Note",
    description: "A top-level note.",
    relativePath: "notes/root-note.md",
    body: "# Root Note\n\nThis is the real note body.\n- Preview this content.\n",
  },
  {
    key: "daily-plan",
    title: "Daily Plan",
    description: "Today priorities.",
    relativePath: "notes/inbox/daily-plan.md",
  },
  {
    key: "api-roadmap",
    title: "API Roadmap",
    description: "Ship API work.",
    relativePath: "notes/projects/api-roadmap.md",
  },
  {
    key: "client-brief",
    title: "Client Brief",
    description: "Client notes.",
    relativePath: "notes/projects/client/client-brief.md",
  },
  {
    key: "scratch-text",
    title: "Scratch Text",
    description: "Not a note file.",
    relativePath: "notes/scratch.txt",
  },
  {
    key: "sidecar",
    title: "Sidecar",
    description: "Hidden state sidecar.",
    relativePath: ".state/notes/root-note.json",
  },
  {
    key: "hidden-note",
    title: "Hidden Note",
    description: "Hidden app state.",
    relativePath: "notes/.state/hidden-note.md",
  },
]

describe("TUI note manager adapter", () => {
  test("converts note summaries into note rows with filename/key, title, description, and path", () => {
    const items = buildManagerItems(summaries)

    assert.deepEqual(
      items.filter((item) => item.type === "note"),
      [
        {
          type: "note",
          key: "archive-review",
          filename: "archive-review.md",
          title: "Archive Review",
          description: "Old ideas to revisit.",
          relativePath: "notes/archive/archive-review.md",
        },
        {
          type: "note",
          key: "daily-plan",
          filename: "daily-plan.md",
          title: "Daily Plan",
          description: "Today priorities.",
          relativePath: "notes/inbox/daily-plan.md",
        },
        {
          type: "note",
          key: "root-note",
          filename: "root-note.md",
          title: "Root Note",
          description: "A top-level note.",
          relativePath: "notes/root-note.md",
        },
      ],
    )
  })

  test("includes folder rows derived from note paths", () => {
    const items = buildManagerItems(summaries)

    assert.deepEqual(
      items.filter((item) => item.type === "folder"),
      [
        {
          type: "folder",
          key: "notes/archive",
          filename: "archive",
          title: "Archive",
          description: "1 note",
          relativePath: "notes/archive",
        },
        {
          type: "folder",
          key: "notes/inbox",
          filename: "inbox",
          title: "Inbox",
          description: "1 note",
          relativePath: "notes/inbox",
        },
      ],
    )
  })

  test("normalizes platform-specific separators and includes ancestor folders for nested paths", () => {
    const items = buildManagerItems([
      {
        key: "win-note",
        title: "Windows Note",
        description: "Backslash path.",
        relativePath: "notes\\projects\\client\\win-note.md",
      },
    ])

    assert.deepEqual(items, [
      {
        type: "folder",
        key: "notes/projects",
        filename: "projects",
        title: "Projects",
        description: "1 note",
        relativePath: "notes/projects",
      },
      {
        type: "folder",
        key: "notes/projects/client",
        filename: "client",
        title: "Client",
        description: "1 note",
        relativePath: "notes/projects/client",
      },
      {
        type: "note",
        key: "win-note",
        filename: "win-note.md",
        title: "Windows Note",
        description: "Backslash path.",
        relativePath: "notes/projects/client/win-note.md",
      },
    ])
  })

  test("keeps mixed manager rows in deterministic file-explorer order", () => {
    const items = buildManagerItems(summaries)

    assert.deepEqual(
      items.map((item) => `${item.type}:${item.relativePath}`),
      [
        "folder:notes/archive",
        "note:notes/archive/archive-review.md",
        "folder:notes/inbox",
        "note:notes/inbox/daily-plan.md",
        "note:notes/root-note.md",
      ],
    )
  })

  test("builds manager view model rows with focus, selection, display name, and detail fields", () => {
    const items = buildManagerItems(summaries)
    const viewModel = buildManagerViewModel({
      items,
      focusedIndex: 999,
      selectedNoteKey: "daily-plan",
    })

    assert.equal(viewModel.empty, false)
    assert.equal(viewModel.focusedIndex, items.length - 1)
    assert.equal(viewModel.selectedNoteKey, "daily-plan")
    assert.equal(viewModel.rows[0]?.displayName, "archive/")
    assert.equal(viewModel.rows[0]?.detail, "Archive — 1 note")
    assert.equal(viewModel.rows.at(-1)?.focused, true)
    assert.equal(viewModel.rows.find((row) => row.key === "daily-plan")?.selected, true)
  })

  test("supports arrow-style movement with clamped and wrapped selection behavior", () => {
    const items = buildManagerItems(summaries)
    const state: ManagerState = {
      items,
      focusedIndex: 0,
      selectedNoteKey: null,
    }

    const clampedAtTop = moveManagerSelection(state, "up")
    assert.equal(clampedAtTop.focusedIndex, 0)
    assert.equal(clampedAtTop.selectedNoteKey, null)

    const downToNote = moveManagerSelection(clampedAtTop, "down")
    assert.equal(downToNote.focusedIndex, 1)
    assert.equal(downToNote.selectedNoteKey, "archive-review")

    const bottom = moveManagerSelection(downToNote, "last")
    assert.equal(bottom.focusedIndex, items.length - 1)
    assert.equal(bottom.selectedNoteKey, "root-note")

    const clampedAtBottom = moveManagerSelection(bottom, "down")
    assert.equal(clampedAtBottom.focusedIndex, items.length - 1)
    assert.equal(clampedAtBottom.selectedNoteKey, "root-note")

    const wrappedToTop = moveManagerSelection(clampedAtBottom, "down", { wrap: true })
    assert.equal(wrappedToTop.focusedIndex, 0)
    assert.equal(wrappedToTop.selectedNoteKey, null)

    const wrappedToBottom = moveManagerSelection(wrappedToTop, "up", { wrap: true })
    assert.equal(wrappedToBottom.focusedIndex, items.length - 1)
    assert.equal(wrappedToBottom.selectedNoteKey, "root-note")
  })

  test("opens the focused note through an injected showNote dependency and returns editor-ready note data", () => {
    const items = buildManagerItems(summaries)
    const state: ManagerState = {
      items,
      focusedIndex: items.findIndex((item) => item.key === "daily-plan"),
      selectedNoteKey: "daily-plan",
    }
    const calls: string[] = []

    const note = openManagerSelection(state, {
      showNote: (selector) => {
        calls.push(selector)
        return {
          key: "daily-plan",
          title: "Daily Plan",
          description: "Today priorities.",
          relativePath: "notes/inbox/daily-plan.md",
          body: "- Write tests\n- Ship adapter\n",
        }
      },
    })

    assert.deepEqual(calls, ["daily-plan"])
    assert.deepEqual(note, {
      key: "daily-plan",
      title: "Daily Plan",
      description: "Today priorities.",
      relativePath: "notes/inbox/daily-plan.md",
      body: "- Write tests\n- Ship adapter\n",
    })
  })

  test("does not call showNote when a folder row is focused", () => {
    const items = buildManagerItems(summaries)
    const state: ManagerState = {
      items,
      focusedIndex: 0,
      selectedNoteKey: null,
    }
    let calls = 0

    assert.equal(
      openManagerSelection(state, {
        showNote: () => {
          calls += 1
          throw new Error("showNote should not be called for folders")
        },
      }),
      null,
    )
    assert.equal(calls, 0)
  })

  test("builds a current-folder browser model with only immediate folders and BlueNote note files", () => {
    const model = buildManagerBrowserModel(browserSummaries, {
      items: [],
      focusedIndex: 0,
      selectedNoteKey: null,
      currentFolderPath: "",
      hoveredPath: null,
      filterQuery: "",
    })

    assert.deepEqual(
      model.layout1Rows.map((row) => `${row.type}:${row.relativePath}`),
      ["folder:notes/inbox", "folder:notes/projects", "note:notes/root-note.md"],
    )
    assert.deepEqual(model.layout1Rows[0], {
      type: "folder",
      key: "notes/inbox",
      relativePath: "notes/inbox",
      filename: "inbox",
      title: "",
      description: "",
      columns: { filename: "inbox", title: "", description: "" },
      rowStyleIntent: "folder",
      focused: true,
      selected: false,
      index: 0,
    })
    assert.deepEqual(model.layout1Rows[2], {
      type: "note",
      key: "root-note",
      relativePath: "notes/root-note.md",
      filename: "root-note.md",
      title: "Root Note",
      description: "A top-level note.",
      columns: { filename: "root-note.md", title: "Root Note", description: "A top-level note." },
      rowStyleIntent: "note",
      focused: false,
      selected: false,
      index: 2,
    })
  })

  test("previews hovered folders with the same browser row style and hovered notes with note content", () => {
    const folderPreview = buildManagerBrowserModel(browserSummaries, {
      items: [],
      focusedIndex: 0,
      selectedNoteKey: null,
      currentFolderPath: "",
      hoveredPath: "notes/projects",
      filterQuery: "",
    }).preview

    assert.equal(folderPreview.type, "folder")
    assert.equal(folderPreview.path, "notes/projects")
    assert.deepEqual(
      folderPreview.rows?.map((row) => ({
        type: row.type,
        key: row.key,
        filename: row.filename,
        title: row.title,
        description: row.description,
        rowStyleIntent: row.rowStyleIntent,
      })),
      [
        { type: "folder", key: "notes/projects/client", filename: "client", title: "", description: "", rowStyleIntent: "folder" },
        { type: "note", key: "api-roadmap", filename: "api-roadmap.md", title: "API Roadmap", description: "Ship API work.", rowStyleIntent: "note" },
      ],
    )

    const notePreview = buildManagerBrowserModel(browserSummaries, {
      items: [],
      focusedIndex: 2,
      selectedNoteKey: null,
      currentFolderPath: "",
      hoveredPath: "notes/root-note.md",
      filterQuery: "",
    }).preview

    assert.deepEqual(notePreview, {
      type: "note-content",
      path: "notes/root-note.md",
      noteKey: "root-note",
      title: "Root Note",
      description: "A top-level note.",
      contentLines: ["# Root Note", "", "This is the real note body.", "- Preview this content."],
    })
  })

  test("opens folders by updating current folder and opens notes as editor-ready data", () => {
    const rootModel = buildManagerBrowserModel(browserSummaries, {
      items: [],
      focusedIndex: 0,
      selectedNoteKey: null,
      currentFolderPath: "",
      hoveredPath: "notes/projects",
      filterQuery: "",
    })
    const openedFolder = openManagerBrowserItem(rootModel.state, {
      showNote: () => {
        throw new Error("showNote should not be called for folders")
      },
    })

    assert.equal(openedFolder.type, "folder")
    assert.equal(openedFolder.state.currentFolderPath, "notes/projects")
    assert.equal(openedFolder.state.hoveredPath, null)
    assert.equal(openedFolder.state.focusedIndex, 0)
    assert.equal(openedFolder.state.filterQuery, "")

    const projectModel = buildManagerBrowserModel(browserSummaries, {
      ...openedFolder.state,
      hoveredPath: "notes/projects/api-roadmap.md",
    })
    const openedNote = openManagerBrowserItem(projectModel.state, {
      showNote: (selector) => {
        assert.equal(selector, "api-roadmap")
        return {
          key: "api-roadmap",
          title: "API Roadmap",
          description: "Ship API work.",
          relativePath: "notes/projects/api-roadmap.md",
          body: "# API Roadmap\n\nShip it.\n",
        }
      },
    })

    assert.deepEqual(openedNote, {
      type: "note",
      note: {
        key: "api-roadmap",
        title: "API Roadmap",
        description: "Ship API work.",
        relativePath: "notes/projects/api-roadmap.md",
        body: "# API Roadmap\n\nShip it.\n",
      },
    })
  })

  test("moves to the parent folder and calmly no-ops at the manager root", () => {
    const nested: ManagerState = {
      items: [],
      focusedIndex: 3,
      selectedNoteKey: null,
      currentFolderPath: "notes/projects/client",
      hoveredPath: "notes/projects/client/client-brief.md",
      filterQuery: "client",
    }

    assert.deepEqual(goToManagerParent(nested), {
      items: [],
      focusedIndex: 0,
      selectedNoteKey: null,
      currentFolderPath: "notes/projects",
      hoveredPath: null,
      filterQuery: "client",
    })

    const root: ManagerState = { ...nested, currentFolderPath: "", focusedIndex: 1, hoveredPath: "notes/projects" }
    assert.equal(goToManagerParent(root), root)
  })

  test("filters Layout 1 and updates Layout 2 from the hovered filtered item", () => {
    const model = buildManagerBrowserModel(browserSummaries, {
      items: [],
      focusedIndex: 0,
      selectedNoteKey: null,
      currentFolderPath: "",
      hoveredPath: "notes/root-note.md",
      filterQuery: "project",
    })

    assert.deepEqual(model.layout1Rows.map((row) => row.relativePath), ["notes/projects"])
    assert.equal(model.hoveredPath, "notes/projects")
    assert.equal(model.preview.type, "folder")
    assert.deepEqual(model.preview.rows?.map((row) => row.relativePath), ["notes/projects/client", "notes/projects/api-roadmap.md"])
  })
})
