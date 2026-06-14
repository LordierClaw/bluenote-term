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

  test("wrapped long lines scroll vertically to keep the cursor visible", async () => {
    const renderer = await createCliRenderer({ testing: true, consoleMode: "disabled", exitOnCtrlC: false })
    try {
      ;(renderer as typeof renderer & { width?: number; height?: number }).width = 40
      ;(renderer as typeof renderer & { width?: number; height?: number }).height = 12
      const before = Array.from({ length: 14 }, (_, index) => `Line ${index + 1}`).join("\n")
      const longLine = `${"wrapped ".repeat(26)}cursor-here ${"tail ".repeat(12)}`
      const body = `${before}\n${longLine}\nlast line`
      const cursorOffset = Array.from(`${before}\n${"wrapped ".repeat(24)}`).length
      const state: TuiState = {
        ...editorState(),
        editor: {
          ...editorState().editor!,
          body,
          savedBody: body,
          note: { ...editorState().editor!.note, body },
          cursorOffset,
          selectionStart: cursorOffset,
          selectionEnd: cursorOffset,
          wrapMode: "word",
        },
      }
      const controller = { getState: () => state } as any
      const screen = renderEditorScreen({ renderer, controller })
      renderer.root.add(screen)
      const bodyDisplay = findById(screen, "bluenote-editor-body") as { scrollY?: number; content?: unknown } | undefined

      assert.equal(bodyDisplay?.scrollY ?? 0, 0)
      const text = renderedText(bodyDisplay) ?? ""
      assert.doesNotMatch(text, /Line 1\n/u)
      assert.match(text, /\u00A0|cursor-here/u)
    } finally {
      renderer.destroy()
    }
  })

  test("wrapped long line exposes vertical overflow even with few logical lines", () => {
    const longLine = "word ".repeat(160)
    const body = `Short\n${longLine}`
    const cursorOffset = Array.from(body).length
    const vm = buildEditorViewModel({
      ...editorState(),
      editor: {
        ...editorState().editor!,
        body,
        savedBody: body,
        note: { ...editorState().editor!.note, body },
        cursorOffset,
        selectionStart: cursorOffset,
        selectionEnd: cursorOffset,
        wrapMode: "word",
      },
    }, { bodyViewportColumns: 24, bodyViewportLines: 8 })

    assert.ok((vm.body.overflow.vertical?.lineCount ?? 0) > 8)
    assert.equal(vm.body.overflow.below, false)
    assert.equal(vm.body.overflow.above, true)
  })

  test("long editor body renders only the visible text window near the cursor", async () => {
    const renderer = await createCliRenderer({ testing: true, consoleMode: "disabled", exitOnCtrlC: false })
    try {
      ;(renderer as typeof renderer & { width?: number; height?: number }).width = 80
      ;(renderer as typeof renderer & { width?: number; height?: number }).height = 10
      const longBody = Array.from({ length: 80 }, (_, index) => `Line ${String(index + 1).padStart(2, "0")}`).join("\n")
      const state: TuiState = {
        ...editorState(),
        editor: {
          ...editorState().editor!,
          body: longBody,
          savedBody: longBody,
          note: { ...editorState().editor!.note, body: longBody },
          cursorOffset: Array.from(longBody).length,
          selectionStart: Array.from(longBody).length,
          selectionEnd: Array.from(longBody).length,
          wrapMode: "none",
        },
      }
      const controller = { getState: () => state } as any
      const screen = renderEditorScreen({ renderer, controller })
      renderer.root.add(screen)
      const body = findById(screen, "bluenote-editor-body")
      const text = renderedText(body) ?? ""

      assert.doesNotMatch(text, /Line 01/u)
      assert.match(text, /Line 80/u)
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
