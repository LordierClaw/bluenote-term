import { describe, test } from "bun:test"
import assert from "node:assert/strict"

import {
  buildManagerBrowserModel,
  buildManagerBrowserItems,
  buildManagerFolderPreviewLinesFromItems,
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
    relativePath: "note/inbox/daily-plan.md",
  },
  {
    key: "archive-review",
    title: "Archive Review",
    description: "Old ideas to revisit.",
    relativePath: "note/archive/archive-review.md",
  },
  {
    key: "root-note",
    title: "Root Note",
    description: "A top-level note.",
    relativePath: "note/root-note.md",
  },
]

const browserSummaries: NoteManagerSummary[] = [
  {
    key: "root-note",
    title: "Root Note",
    description: "A top-level note.",
    relativePath: "note/root-note.md",
    body: "# Root Note\n\nThis is the real note body.\n- Preview this content.\n",
  },
  {
    key: "daily-plan",
    title: "Daily Plan",
    description: "Today priorities.",
    relativePath: "note/inbox/daily-plan.md",
  },
  {
    key: "api-roadmap",
    title: "API Roadmap",
    description: "Ship API work.",
    relativePath: "note/projects/api-roadmap.md",
  },
  {
    key: "client-brief",
    title: "Client Brief",
    description: "Client notes.",
    relativePath: "note/projects/client/client-brief.md",
  },
  {
    key: "scratch-text",
    title: "Scratch Text",
    description: "Not a note file.",
    relativePath: "note/scratch.txt",
  },
  {
    key: "case-123-key",
    title: "Key Only Match",
    description: "Visible summary without the digits.",
    relativePath: "note/case-key-only.md",
  },
  {
    key: "title-match",
    title: "Receipt 123",
    description: "Visible title contains the digits.",
    relativePath: "note/receipt-title.md",
  },
  {
    key: "description-match",
    title: "Description Match",
    description: "Invoice number 123 is visible.",
    relativePath: "note/description-match.md",
  },
  {
    key: "filename-match",
    title: "Filename Match",
    description: "Visible summary without the digits.",
    relativePath: "note/meeting-123.md",
  },
  {
    key: "folder-path-match",
    title: "Folder Path Match",
    description: "Visible summary without the digits.",
    relativePath: "note/client-123/project.md",
  },
  {
    key: "a-big-cat",
    title: "A Big Cat",
    description: "Body summary is not a manager filter field.",
    relativePath: "note/a-big-cat.md",
    body: "a-big-cat has letters that form a non-contiguous subsequence for abc.",
  },
  {
    key: "abc-visible",
    title: "ABC Visible",
    description: "Visible abc appears contiguously.",
    relativePath: "note/abc-visible.md",
    body: "This body is not needed for filtering.",
  },
  {
    key: "sidecar",
    title: "Sidecar",
    description: "Hidden data sidecar.",
    relativePath: ".data/notes/root-note.json",
  },
  {
    key: "hidden-note",
    title: "Hidden Note",
    description: "Hidden app data.",
    relativePath: "note/.data/hidden-note.md",
  },
]

describe("TUI note manager adapter", () => {
  test("ignores legacy notes-area summaries and folders in Phase 7 manager rows", () => {
    const items = buildManagerBrowserItems([
      {
        key: "legacy-note",
        title: "Legacy Note",
        description: "Old imported note.",
        relativePath: "notes/inbox/legacy-note.md",
      },
      {
        key: "normal-note",
        title: "Normal Note",
        description: "Current note.",
        relativePath: "note/normal-note.md",
      },
    ], ["notes/inbox", "note/projects"])

    assert.deepEqual(items.map((item) => `${item.type}:${item.relativePath}`), [
      "folder:draft",
      "folder:note",
      "folder:note/projects",
      "note:note/normal-note.md",
    ])
  })

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
          relativePath: "note/archive/archive-review.md",
        },
        {
          type: "note",
          key: "daily-plan",
          filename: "daily-plan.md",
          title: "Daily Plan",
          description: "Today priorities.",
          relativePath: "note/inbox/daily-plan.md",
        },
        {
          type: "note",
          key: "root-note",
          filename: "root-note.md",
          title: "Root Note",
          description: "A top-level note.",
          relativePath: "note/root-note.md",
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
          key: "note/archive",
          filename: "archive",
          title: "Archive",
          description: "1 note",
          relativePath: "note/archive",
        },
        {
          type: "folder",
          key: "note/inbox",
          filename: "inbox",
          title: "Inbox",
          description: "1 note",
          relativePath: "note/inbox",
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
        relativePath: "note\\projects\\client\\win-note.md",
      },
    ])

    assert.deepEqual(items, [
      {
        type: "folder",
        key: "note/projects",
        filename: "projects",
        title: "Projects",
        description: "1 note",
        relativePath: "note/projects",
      },
      {
        type: "folder",
        key: "note/projects/client",
        filename: "client",
        title: "Client",
        description: "1 note",
        relativePath: "note/projects/client",
      },
      {
        type: "note",
        key: "win-note",
        filename: "win-note.md",
        title: "Windows Note",
        description: "Backslash path.",
        relativePath: "note/projects/client/win-note.md",
      },
    ])
  })

  test("includes empty user folders supplied by the note-directory discovery boundary", () => {
    const items = buildManagerBrowserItems([], ["note/projects/empty-client"])

    assert.deepEqual(
      items.map((item) => `${item.type}:${item.relativePath}`),
      ["folder:draft", "folder:note", "folder:note/projects", "folder:note/projects/empty-client"],
    )
  })

  test("shows nested empty folders when navigating into their parent", () => {
    const model = buildManagerBrowserModel(
      [],
      {
        items: [],
        focusedIndex: 0,
        selectedNoteKey: null,
        currentFolderPath: "note/projects",
      },
      { userFolderPaths: ["note/projects/empty-client"] },
    )

    assert.deepEqual(model.layout1Rows.map((row) => `${row.type}:${row.relativePath}`), ["folder:note/projects/empty-client"])
  })

  test("filters BlueNote internal and hidden folder paths from user folder discovery", () => {
    const items = buildManagerBrowserItems([], [
      "note/projects/visible-client",
      "note/.data",
      "note/.state",
      "note/.bluenote",
      "note/.cache/scratch",
      "note/.tmp/scratch",
      "note/projects/.hidden-child",
      ".data/notes/shadow",
      ".state/notes/shadow",
      ".bluenote/notes/shadow",
    ])

    assert.deepEqual(
      items.map((item) => `${item.type}:${item.relativePath}`),
      ["folder:draft", "folder:note", "folder:note/projects", "folder:note/projects/visible-client"],
    )
  })

  test("preserves note-derived folders and note navigation when empty folders are present", () => {
    const model = buildManagerBrowserModel(browserSummaries, {
      items: [],
      focusedIndex: 2,
      selectedNoteKey: null,
      currentFolderPath: "note/projects",
    }, { userFolderPaths: ["note/projects/empty-client"] })

    assert.deepEqual(model.layout1Rows.map((row) => `${row.type}:${row.relativePath}`), [
      "folder:note/projects/client",
      "folder:note/projects/empty-client",
      "note:note/projects/api-roadmap.md",
    ])

    const opened = openManagerBrowserItem(model.state, {
      showNote: (selector) => ({
        key: selector,
        title: "API Roadmap",
        description: "Ship API work.",
        relativePath: "note/projects/api-roadmap.md",
        body: "API body",
      }),
    })

    assert.equal(opened.type, "note")
    assert.equal(opened.type === "note" ? opened.note.key : null, "api-roadmap")
  })

  test("keeps mixed manager rows in deterministic file-explorer order", () => {
    const items = buildManagerItems(summaries)

    assert.deepEqual(
      items.map((item) => `${item.type}:${item.relativePath}`),
      [
        "folder:note/archive",
        "note:note/archive/archive-review.md",
        "folder:note/inbox",
        "note:note/inbox/daily-plan.md",
        "note:note/root-note.md",
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
          relativePath: "note/inbox/daily-plan.md",
          body: "- Write tests\n- Ship adapter\n",
          updatedAt: "2026-05-28T10:30:00.000Z",
        }
      },
    })

    assert.deepEqual(calls, ["daily-plan"])
    assert.deepEqual(note, {
      key: "daily-plan",
      title: "Daily Plan",
      description: "Today priorities.",
      relativePath: "note/inbox/daily-plan.md",
      body: "- Write tests\n- Ship adapter\n",
      updatedAt: "2026-05-28T10:30:00.000Z",
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
    const baseBrowserSummaries = browserSummaries.filter((summary) =>
      ["root-note", "daily-plan", "api-roadmap", "client-brief", "scratch-text", "sidecar", "hidden-note"].includes(summary.key),
    )
    const model = buildManagerBrowserModel(baseBrowserSummaries, {
      items: [],
      focusedIndex: 0,
      selectedNoteKey: null,
      currentFolderPath: "note",
      hoveredPath: null,
      filterQuery: "",
    })

    assert.deepEqual(
      model.layout1Rows.map((row) => `${row.type}:${row.relativePath}`),
      ["folder:note/inbox", "folder:note/projects", "note:note/root-note.md"],
    )
    assert.deepEqual(model.layout1Rows[0], {
      type: "folder",
      key: "note/inbox",
      relativePath: "note/inbox",
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
      relativePath: "note/root-note.md",
      filename: "root-note.md",
      title: "Root Note",
      description: "A top-level note.",
      createdAt: undefined,
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
      currentFolderPath: "note",
      hoveredPath: "note/projects",
      filterQuery: "",
    }).preview

    assert.equal(folderPreview.type, "folder")
    assert.equal(folderPreview.path, "note/projects")
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
        { type: "folder", key: "note/projects/client", filename: "client", title: "", description: "", rowStyleIntent: "folder" },
        { type: "note", key: "api-roadmap", filename: "api-roadmap.md", title: "API Roadmap", description: "Ship API work.", rowStyleIntent: "note" },
      ],
    )

    const notePreview = buildManagerBrowserModel(browserSummaries, {
      items: [],
      focusedIndex: 2,
      selectedNoteKey: null,
      currentFolderPath: "note",
      hoveredPath: "note/root-note.md",
      filterQuery: "",
    }).preview

    assert.deepEqual(notePreview, {
      type: "note-content",
      path: "note/root-note.md",
      noteKey: "root-note",
      title: "Root Note",
      contentLines: ["# Root Note", "", "This is the real note body.", "- Preview this content."],
    })
    assert.equal("description" in notePreview, false)
    assert.equal(notePreview.type === "note-content" && notePreview.contentLines.includes("note/root-note.md"), false)
    assert.equal(notePreview.type === "note-content" && notePreview.contentLines.includes("A top-level note."), false)
  })

  test("builds folder preview lines from precomputed browser items", () => {
    const items = buildManagerBrowserItems(browserSummaries)

    assert.equal(items.some((item) => item.relativePath === "note/.data"), false)
    assert.deepEqual(buildManagerFolderPreviewLinesFromItems(items, "note/projects"), ["client", "api-roadmap.md"])
    assert.deepEqual(buildManagerFolderPreviewLinesFromItems(items, "note/.data"), [])
  })

  test("returns an explicit hidden preview without resolving note content when preview is hidden", () => {
    let bodyLookups = 0
    const model = buildManagerBrowserModel(
      browserSummaries,
      {
        items: [],
        focusedIndex: 2,
        selectedNoteKey: null,
        currentFolderPath: "note",
        hoveredPath: "note/root-note.md",
        filterQuery: "",
      },
      {
        previewVisible: false,
        hiddenReason: "manual",
        getPreviewBody: () => {
          bodyLookups += 1
          throw new Error("hidden previews must not hydrate note bodies")
        },
      },
    )

    assert.equal(bodyLookups, 0)
    assert.deepEqual(model.preview, { type: "hidden", path: "note/root-note.md", reason: "manual" })
    assert.equal(model.layout1Rows.some((row) => row.relativePath === "note/root-note.md"), true)
  })

  test("does not resolve preview note content for folder previews", () => {
    let bodyLookups = 0
    const model = buildManagerBrowserModel(
      browserSummaries,
      {
        items: [],
        focusedIndex: 0,
        selectedNoteKey: null,
        currentFolderPath: "",
        hoveredPath: "note/projects",
        filterQuery: "",
      },
      {
        getPreviewBody: () => {
          bodyLookups += 1
          throw new Error("folder previews must not hydrate note bodies")
        },
      },
    )

    assert.equal(model.preview.type, "folder")
    assert.equal(bodyLookups, 0)
  })

  test("opens folders by updating current folder and opens notes as editor-ready data", () => {
    const rootModel = buildManagerBrowserModel(browserSummaries, {
      items: [],
      focusedIndex: 0,
      selectedNoteKey: null,
      currentFolderPath: "note",
      hoveredPath: "note/projects",
      filterQuery: "",
    })
    const openedFolder = openManagerBrowserItem(rootModel.state, {
      showNote: () => {
        throw new Error("showNote should not be called for folders")
      },
    })

    assert.equal(openedFolder.type, "folder")
    assert.equal(openedFolder.state.currentFolderPath, "note/projects")
    assert.equal(openedFolder.state.hoveredPath, null)
    assert.equal(openedFolder.state.focusedIndex, 0)
    assert.equal(openedFolder.state.filterQuery, "")

    const projectModel = buildManagerBrowserModel(browserSummaries, {
      ...openedFolder.state,
      hoveredPath: "note/projects/api-roadmap.md",
    })
    const openedNote = openManagerBrowserItem(projectModel.state, {
      showNote: (selector) => {
        assert.equal(selector, "api-roadmap")
        return {
          key: "api-roadmap",
          title: "API Roadmap",
          description: "Ship API work.",
          relativePath: "note/projects/api-roadmap.md",
          body: "# API Roadmap\n\nShip it.\n",
          updatedAt: "2026-05-28T10:30:00.000Z",
        }
      },
    })

    assert.deepEqual(openedNote, {
      type: "note",
      note: {
        key: "api-roadmap",
        title: "API Roadmap",
        description: "Ship API work.",
        relativePath: "note/projects/api-roadmap.md",
        body: "# API Roadmap\n\nShip it.\n",
        updatedAt: "2026-05-28T10:30:00.000Z",
      },
    })
  })

  test("opens the visible filtered row when filtered focus points at a different full-list item", () => {
    const unfilteredState = buildManagerBrowserModel(browserSummaries, {
      items: [],
      focusedIndex: 0,
      selectedNoteKey: null,
      currentFolderPath: "note",
      hoveredPath: null,
      filterQuery: "root",
    }).state
    const filteredState: ManagerState = {
      ...unfilteredState,
      focusedIndex: 0,
      hoveredPath: null,
      filterQuery: "root",
    }

    assert.notEqual(filteredState.items[0]?.relativePath, "note/root-note.md")
    assert.deepEqual(
      buildManagerBrowserModel(browserSummaries, filteredState).layout1Rows.map((row) => row.relativePath),
      ["note/root-note.md"],
    )

    const opened = openManagerBrowserItem(filteredState, {
      showNote: (selector) => {
        assert.equal(selector, "root-note")
        return {
          key: "root-note",
          title: "Root Note",
          description: "A top-level note.",
          relativePath: "note/root-note.md",
          body: "# Root Note\n\nThis is the real note body.\n",
        }
      },
    })

    assert.equal(opened.type, "note")
    assert.equal(opened.note.key, "root-note")
  })

  test("moves to the parent folder and calmly no-ops at the manager root", () => {
    const nested: ManagerState = {
      items: [],
      focusedIndex: 3,
      selectedNoteKey: null,
      currentFolderPath: "note/projects/client",
      hoveredPath: "note/projects/client/client-brief.md",
      filterQuery: "client",
    }

    assert.deepEqual(goToManagerParent(nested), {
      items: [],
      focusedIndex: 0,
      selectedNoteKey: null,
      currentFolderPath: "note/projects",
      hoveredPath: null,
      filterQuery: "client",
    })

    const root: ManagerState = { ...nested, currentFolderPath: "", focusedIndex: 1, hoveredPath: "note/projects" }
    assert.equal(goToManagerParent(root), root)
  })

  test("filters Layout 1 by visible item name and updates Layout 2 from the hovered filtered item", () => {
    const model = buildManagerBrowserModel(browserSummaries, {
      items: [],
      focusedIndex: 0,
      selectedNoteKey: null,
      currentFolderPath: "note",
      hoveredPath: "note/root-note.md",
      filterQuery: "project",
    })

    assert.deepEqual(model.layout1Rows.map((row) => row.relativePath), ["note/projects"])
    assert.equal(model.hoveredPath, "note/projects")
    assert.equal(model.preview.type, "folder")
    assert.deepEqual(model.preview.rows?.map((row) => row.relativePath), ["note/projects/client", "note/projects/api-roadmap.md"])
  })

  test("filters with contains semantics only against visible item filenames", () => {
    const model = buildManagerBrowserModel(browserSummaries, {
      items: [],
      focusedIndex: 0,
      selectedNoteKey: null,
      currentFolderPath: "note",
      hoveredPath: null,
      filterQuery: "123",
    })

    assert.deepEqual(model.layout1Rows.map((row) => row.relativePath), [
      "note/client-123",
      "note/meeting-123.md",
    ])
  })

  test("does not match manager filter queries against parent path, title, description, or key", () => {
    const pathOnlyModel = buildManagerBrowserModel(browserSummaries, {
      items: [],
      focusedIndex: 0,
      selectedNoteKey: null,
      currentFolderPath: "note/projects",
      hoveredPath: null,
      filterQuery: "projects",
    })
    assert.deepEqual(pathOnlyModel.layout1Rows.map((row) => row.relativePath), [])

    const titleDescriptionKeyModel = buildManagerBrowserModel(browserSummaries, {
      items: [],
      focusedIndex: 0,
      selectedNoteKey: null,
      currentFolderPath: "note",
      hoveredPath: null,
      filterQuery: "123",
    })
    assert.equal(titleDescriptionKeyModel.layout1Rows.some((row) => row.relativePath === "note/case-key-only.md"), false)
    assert.equal(titleDescriptionKeyModel.layout1Rows.some((row) => row.relativePath === "note/description-match.md"), false)
    assert.equal(titleDescriptionKeyModel.layout1Rows.some((row) => row.relativePath === "note/receipt-title.md"), false)
  })

  test("manager filter does not include nested descendants outside the current folder", () => {
    const model = buildManagerBrowserModel(browserSummaries, {
      items: [],
      focusedIndex: 0,
      selectedNoteKey: null,
      currentFolderPath: "",
      hoveredPath: null,
      filterQuery: "brief",
    })

    assert.deepEqual(model.layout1Rows.map((row) => row.relativePath), [])
  })

  test("does not include fuzzy subsequence-only or body-only manager filter matches", () => {
    const model = buildManagerBrowserModel(browserSummaries, {
      items: [],
      focusedIndex: 0,
      selectedNoteKey: null,
      currentFolderPath: "note",
      hoveredPath: null,
      filterQuery: "abc",
    })

    assert.deepEqual(model.layout1Rows.map((row) => row.relativePath), ["note/abc-visible.md"])
    assert.equal(model.layout1Rows.some((row) => row.relativePath === "note/a-big-cat.md"), false)
  })

  test("filters hidden BlueNote app data paths out of manager browser rows", () => {
    const model = buildManagerBrowserModel(browserSummaries, {
      items: [],
      focusedIndex: 0,
      selectedNoteKey: null,
      currentFolderPath: "",
      hoveredPath: null,
      filterQuery: "data",
    })

    assert.deepEqual(model.layout1Rows.map((row) => row.relativePath), [])
  })
})
