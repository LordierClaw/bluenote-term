import { describe, test } from "bun:test"
import assert from "node:assert/strict"

import {
  advanceEditorFindState,
  copySelection,
  cutSelection,
  findInEditorBody,
  pasteText,
  replaceAllMatches,
  replaceCurrentMatch,
  replaceEditorBody,
  saveEditorBuffer,
  selectAllEditorBody,
  type ClipboardModel,
  type EditorSelection,
} from "../../../src/tui/adapters/editor-buffer-adapter"
import type { EditorBufferState } from "../../../src/tui/state"

function createEditor(body = "Hello world"): EditorBufferState {
  return {
    note: {
      key: "unicode-note",
      title: "Unicode Note",
      description: "Exercise editor commands.",
      relativePath: "notes/unicode-note.md",
      body,
    },
    body,
    savedBody: body,
    dirty: false,
  }
}

function createClipboard(initialText = ""): ClipboardModel {
  let text = initialText

  return {
    readText: () => text,
    writeText: (nextText) => {
      text = nextText
    },
  }
}

function selection(start: number, end: number): EditorSelection {
  return {
    start,
    end,
    text: "",
    collapsed: start === end,
  }
}

describe("TUI editor buffer adapter", () => {
  test("preserves Unicode text when replacing editor body content", () => {
    const unicodeBody = "Hello 🌊\n今日は世界\nemoji: 🧠✨\n中文段落"
    const original = createEditor("plain")

    const changed = replaceEditorBody(original, unicodeBody)

    assert.equal(changed.body, unicodeBody)
    assert.equal(changed.note.body, unicodeBody)
    assert.equal(changed.savedBody, "plain")
    assert.equal(changed.dirty, true)
    assert.equal(original.body, "plain")
  })

  test("selects all text using Unicode code-point offsets", () => {
    const editor = createEditor("Alpha 🌍\nBeta 日本語")

    const selected = selectAllEditorBody(editor)

    assert.deepEqual(selected, {
      start: 0,
      end: Array.from(editor.body).length,
      text: editor.body,
      collapsed: false,
    })
  })

  test("cuts, copies, and pastes through an injectable clipboard model", () => {
    const clipboard = createClipboard()
    const editor = createEditor("Alpha 🌍\nBeta 日本語")
    const all = selectAllEditorBody(editor)

    const copied = copySelection(editor, all, clipboard)
    assert.equal(copied, editor.body)
    assert.equal(clipboard.readText(), editor.body)
    assert.equal(editor.dirty, false)

    const cut = cutSelection(editor, all, clipboard)
    assert.equal(cut.editor.body, "")
    assert.equal(cut.editor.note.body, "")
    assert.equal(cut.editor.dirty, true)
    assert.equal(cut.selection.start, 0)
    assert.equal(cut.selection.end, 0)
    assert.equal(clipboard.readText(), "Alpha 🌍\nBeta 日本語")

    clipboard.writeText("Pasted 📝 text")
    const pasted = pasteText(cut.editor, cut.selection, clipboard)
    assert.equal(pasted.editor.body, "Pasted 📝 text")
    assert.equal(pasted.editor.dirty, true)
    assert.deepEqual(pasted.selection, {
      start: Array.from("Pasted 📝 text").length,
      end: Array.from("Pasted 📝 text").length,
      text: "",
      collapsed: true,
    })
  })

  test("does not split surrogate-pair emoji during selection edits", () => {
    const clipboard = createClipboard("🌊")
    const editor = createEditor("A🌊B日本")

    const copied = copySelection(editor, selection(1, 2), clipboard)
    assert.equal(copied, "🌊")
    assert.equal(clipboard.readText(), "🌊")

    const cut = cutSelection(editor, selection(1, 2), clipboard)
    assert.equal(cut.editor.body, "AB日本")
    assert.equal(cut.selection.start, 1)
    assert.equal(cut.selection.end, 1)

    const pasted = pasteText(cut.editor, selection(2, 2), clipboard)
    assert.equal(pasted.editor.body, "AB🌊日本")
    assert.equal(pasted.selection.start, 3)
    assert.equal(pasted.selection.end, 3)
  })

  test("normalizes reversed, out-of-range, and fractional selections", () => {
    const clipboard = createClipboard()
    const editor = createEditor("A🌊B")

    const copied = copySelection(editor, selection(99.8, 1.2), clipboard)

    assert.equal(copied, "🌊B")
    assert.equal(clipboard.readText(), "🌊B")
  })

  test("finds a query and navigates find results with Unicode code-point offsets", () => {
    const editor = createEditor("one 🌊 two 🌊 red 🌊")

    const found = findInEditorBody(editor, "🌊")
    assert.equal(found.query, "🌊")
    assert.equal(found.matches.length, 3)
    assert.deepEqual(
      found.matches.map((match) => match.text),
      ["🌊", "🌊", "🌊"],
    )
    assert.equal(found.currentIndex, 0)
    assert.equal(found.currentMatch?.start, 4)

    const second = findInEditorBody(editor, "🌊", { fromIndex: 5 })
    assert.equal(second.currentIndex, 1)
    assert.equal(second.currentMatch?.start, 10)

    const wrapped = findInEditorBody(editor, "🌊", { fromIndex: Array.from(editor.body).length })
    assert.equal(wrapped.currentIndex, 0)
  })

  test("advances to the next editor find match and wraps", () => {
    const editor = createEditor("alpha beta alpha gamma alpha")
    const found = findInEditorBody(editor, "alpha")

    const second = advanceEditorFindState(editor, found)
    assert.equal(second.query, "alpha")
    assert.equal(second.matches.length, 3)
    assert.equal(second.currentIndex, 1)
    assert.equal(second.currentMatch?.start, 11)

    const third = advanceEditorFindState(editor, second)
    assert.equal(third.currentIndex, 2)
    assert.equal(third.currentMatch?.start, 23)

    const wrapped = advanceEditorFindState(editor, third)
    assert.equal(wrapped.currentIndex, 0)
    assert.equal(wrapped.currentMatch?.start, 0)
  })

  test("replaces the current find match and all matches on current buffer text", () => {
    const editor = createEditor("one fish two fish red fish")
    const found = findInEditorBody(editor, "fish", { fromIndex: 5 })

    const current = replaceCurrentMatch(editor, found, "cat")
    assert.equal(current.editor.body, "one fish two cat red fish")
    assert.equal(current.editor.dirty, true)
    assert.equal(current.findState.query, "fish")
    assert.deepEqual(
      current.findState.matches.map((match) => match.text),
      ["fish", "fish"],
    )
    assert.equal(current.findState.currentIndex, 1)

    const all = replaceAllMatches(current.editor, "fish", "bird")
    assert.equal(all.editor.body, "one bird two cat red bird")
    assert.equal(all.replacementCount, 2)
    assert.equal(all.editor.dirty, true)
  })

  test("does not replace stale find-state ranges from a different editor body", () => {
    const staleFind = findInEditorBody(createEditor("alpha beta"), "beta")
    const currentEditor = createEditor("alpha gamma")

    const result = replaceCurrentMatch(currentEditor, staleFind, "delta")

    assert.equal(result.editor.body, "alpha gamma")
    assert.equal(result.editor.dirty, false)
    assert.equal(result.findState.currentMatch, null)
  })

  test("handles empty query replacements as no-ops", () => {
    const editor = createEditor("same body")

    const all = replaceAllMatches(editor, "", "x")

    assert.equal(all.editor.body, "same body")
    assert.equal(all.editor.dirty, false)
    assert.equal(all.replacementCount, 0)
  })

  test("clears dirty status when replacing body back to saved content", () => {
    const editor = replaceEditorBody(createEditor("saved"), "draft")

    const reverted = replaceEditorBody(editor, "saved")

    assert.equal(reverted.body, "saved")
    assert.equal(reverted.dirty, false)
  })

  test("saves dirty editor content through an injectable persistence function and trusts persisted canonical body", async () => {
    const dirty = replaceEditorBody(createEditor("draft"), "Saved 日本語 🧾")
    const calls: Array<{ key: string; body: string }> = []

    const saved = await saveEditorBuffer(dirty, {
      persist: async (note, body) => {
        calls.push({ key: note.key, body })
        return {
          ...note,
          body: `${body}\n`,
          title: "Persisted title",
        }
      },
    })

    assert.deepEqual(calls, [{ key: "unicode-note", body: "Saved 日本語 🧾" }])
    assert.equal(saved.body, "Saved 日本語 🧾\n")
    assert.equal(saved.savedBody, "Saved 日本語 🧾\n")
    assert.equal(saved.note.body, "Saved 日本語 🧾\n")
    assert.equal(saved.note.title, "Persisted title")
    assert.equal(saved.dirty, false)
  })

  test("propagates persistence failures", async () => {
    const dirty = replaceEditorBody(createEditor("draft"), "unsaved")

    await assert.rejects(
      () =>
        saveEditorBuffer(dirty, {
          persist: () => {
            throw new Error("disk full")
          },
        }),
      /disk full/u,
    )
  })
})
