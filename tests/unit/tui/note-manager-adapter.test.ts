import { describe, test } from "bun:test"
import assert from "node:assert/strict"

import {
  buildManagerItems,
  buildManagerViewModel,
  moveManagerSelection,
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
})
