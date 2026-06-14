import { describe, test } from "bun:test"
import assert from "node:assert/strict"
import { createCliRenderer } from "@opentui/core"

import { buildEditorViewModel, renderEditorScreen } from "../../../src/tui/render-editor"
import { tuiTheme } from "../../../src/tui/theme"
import type { TuiState } from "../../../src/tui/state"

function descendants(node: { getChildren: () => any[] }): any[] {
  return node.getChildren().flatMap((child) => [child, ...descendants(child)])
}

function findById(node: { getChildren: () => any[] }, id: string): any | undefined {
  return descendants(node).find((child) => child.id === id)
}

function renderedText(node: any): string | undefined {
  if (typeof node?.content === "string") return node.content
  const chunks = node?.content?.chunks
  if (Array.isArray(chunks)) return chunks.map((chunk) => chunk.text ?? "").join("")
  return undefined
}

function styledTextChunks(node: any): any[] {
  return Array.isArray(node?.content?.chunks) ? node.content.chunks : []
}

function colorInts(value: unknown): number[] | undefined {
  return (value as { toInts?: () => number[] } | undefined)?.toInts?.()
}

function hexToRgba(hex: `#${string}`): number[] {
  const normalized = hex.slice(1)
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
    255,
  ]
}

function editorState(): TuiState {
  return {
    screen: "editor",
    mode: "editor.body",
    manager: { items: [], focusedIndex: 0, selectedNoteKey: "alpha" },
    editor: {
      note: {
        key: "alpha",
        title: "Alpha",
        description: "",
        relativePath: "note/work/alpha.md",
        body: "Alpha body",
      },
      body: "Alpha body",
      savedBody: "Alpha body",
      dirty: false,
      noteSwitchIndicator: { label: "03/10" },
    },
    search: null,
  }
}

describe("editor rendering", () => {
  test("topbar view model exposes active same-folder switch indicator before the note title", () => {
    const vm = buildEditorViewModel(editorState())

    assert.deepEqual(vm.topbar.noteSwitchIndicator, { label: "03/10", intent: "info" })
    assert.equal(vm.topbar.noteName, "Alpha")
  })

  test("editor shortcut hints advertise same-folder quick switching", () => {
    const vm = buildEditorViewModel(editorState(), { width: 0 })

    assert.ok(vm.bottombar.row2.visibleShortcuts.includes("[Ctrl+PageUp/Down] Switch Note"))
  })

  test("rendered topbar shows active same-folder switch indicator in blue left of title", async () => {
    const renderer = await createCliRenderer({ testing: true, consoleMode: "disabled", exitOnCtrlC: false })
    try {
      const state = editorState()
      const controller = { getState: () => state } as any
      const screen = renderEditorScreen({ renderer, controller })
      renderer.root.add(screen)

      const topbarChildren = findById(screen, "bluenote-editor-topbar")?.getChildren?.() ?? []
      const indicator = findById(screen, "bluenote-editor-topbar-note-index")
      const title = findById(screen, "bluenote-editor-topbar-title")

      assert.equal(renderedText(indicator), "03/10 ")
      assert.deepEqual(colorInts(indicator?.fg), hexToRgba(tuiTheme.info))
      assert.ok(topbarChildren.indexOf(indicator) > -1)
      assert.ok(topbarChildren.indexOf(title) > topbarChildren.indexOf(indicator))
    } finally {
      renderer.destroy()
    }
  })

  test("long editor body renders a vertical position indicator", async () => {
    const renderer = await createCliRenderer({ testing: true, consoleMode: "disabled", exitOnCtrlC: false })
    try {
      const longBody = Array.from({ length: 80 }, (_, index) => `Line ${String(index + 1).padStart(2, "0")}`).join("\n")
      const state: TuiState = {
        ...editorState(),
        editor: {
          ...editorState().editor!,
          body: longBody,
          savedBody: longBody,
          note: { ...editorState().editor!.note, body: longBody },
          cursorOffset: Array.from(longBody).length,
        },
      }
      const controller = { getState: () => state } as any
      const screen = renderEditorScreen({ renderer, controller })
      renderer.root.add(screen)

      const scrollbar = findById(screen, "bluenote-editor-body-vertical-scrollbar")

      assert.equal(scrollbar?.id, "bluenote-editor-body-vertical-scrollbar")
      assert.match(renderedText(scrollbar) ?? "", /█/u)
    } finally {
      renderer.destroy()
    }
  })

  test("cursor at end of note renders as a non-trimmable styled cell on first open", async () => {
    const renderer = await createCliRenderer({ testing: true, consoleMode: "disabled", exitOnCtrlC: false })
    try {
      const state = editorState()
      const controller = { getState: () => state } as any
      const screen = renderEditorScreen({ renderer, controller })
      renderer.root.add(screen)
      const body = findById(screen, "bluenote-editor-body")
      const chunks = styledTextChunks(body)

      assert.equal(renderedText(body), "Alpha body\u00A0")
      assert.equal(chunks.at(-1)?.text, "\u00A0")
      assert.deepEqual(colorInts(chunks.at(-1)?.bg), hexToRgba(tuiTheme.primaryAccent))
    } finally {
      renderer.destroy()
    }
  })
})
