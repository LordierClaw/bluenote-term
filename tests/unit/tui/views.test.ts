import { test } from "bun:test"
import assert from "node:assert/strict"

import { renderShellLayout } from "../../../src/tui/shell/shell-layout"
import { renderEmptyState } from "../../../src/tui/views/empty-state"
import { renderNotePane } from "../../../src/tui/views/note-pane"
import { renderSidebar } from "../../../src/tui/views/sidebar"
import { renderStatusBar } from "../../../src/tui/views/status-bar"

test("renderEmptyState includes the helpful init instruction for missing-root screens", () => {
  const rendered = renderEmptyState({
    title: "BlueNote root missing",
    message: "BlueNote root is not initialized.",
    hint: "Run 'bn init' first.",
  })

  assert.match(rendered, /BlueNote root missing/u)
  assert.match(rendered, /Run 'bn init' first\./u)
})

test("renderSidebar marks the selected note and remains stable for empty note collections", () => {
  const selectedSidebar = renderSidebar({
    notes: [
      {
        key: "alpha-note",
        selector: "alpha-note",
        title: "Alpha Note",
        description: "First note",
        relativePath: "notes/alpha-note.md",
      },
      {
        key: "beta-note",
        selector: "beta-note",
        title: "Beta Note",
        description: "Second note",
        relativePath: "notes/beta-note.md",
      },
    ],
    selectedNoteSelector: "beta-note",
    focusRegion: "sidebar",
  })

  const emptySidebar = renderSidebar({
    notes: [],
    selectedNoteSelector: null,
    focusRegion: "sidebar",
  })

  assert.match(selectedSidebar, /> Beta Note/u)
  assert.match(selectedSidebar, /  Alpha Note/u)
  assert.match(emptySidebar, /No notes yet\./u)
})

test("renderNotePane shows selected note details and a stable no-notes state", () => {
  const notePane = renderNotePane({
    selectedNote: {
      key: "alpha-note",
      selector: "alpha-note",
      title: "Alpha Note",
      description: "First note summary",
      relativePath: "notes/alpha-note.md",
      body: "# Alpha Note\n\nBody line.",
    },
    focusRegion: "main",
    emptyMessage: "No notes available.",
  })

  const emptyPane = renderNotePane({
    selectedNote: null,
    focusRegion: "main",
    emptyMessage: "No notes available.",
  })

  assert.match(notePane, /Alpha Note/u)
  assert.match(notePane, /notes\/alpha-note\.md/u)
  assert.match(notePane, /Body line\./u)
  assert.match(emptyPane, /No notes available\./u)
})

test("renderStatusBar summarizes mode, focus, and dirty state", () => {
  const rendered = renderStatusBar({
    mode: "editor",
    focusRegion: "main",
    editorDirty: true,
    transientMessage: {
      level: "status",
      text: "Editing Alpha Note",
    },
  })

  assert.match(rendered, /MODE: editor/u)
  assert.match(rendered, /FOCUS: main/u)
  assert.match(rendered, /DIRTY: yes/u)
  assert.match(rendered, /Editing Alpha Note/u)
})

test("renderShellLayout composes sidebar, main pane, and status bar regions in a predictable frame", () => {
  const rendered = renderShellLayout({
    sidebar: "[Sidebar]",
    main: "[Main Pane]",
    statusBar: "[Status Bar]",
  })

  assert.match(rendered, /SIDEBAR/u)
  assert.match(rendered, /MAIN/u)
  assert.match(rendered, /STATUS/u)
  assert.match(rendered, /\[Sidebar\]/u)
  assert.match(rendered, /\[Main Pane\]/u)
  assert.match(rendered, /\[Status Bar\]/u)
})
