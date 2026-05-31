import { StyledText, fg, type TextChunk } from "@opentui/core"

import { tuiTheme, type TuiColorIntent } from "./theme"

export interface ShortcutHint {
  key: string
  action: string
  priority?: "primary" | "secondary" | "danger"
}

export interface ShortcutTextHint {
  text: string
  priority?: "primary" | "secondary" | "danger"
}

export type ShortcutRenderableHint = ShortcutHint | ShortcutTextHint

export const TUI_SHORTCUTS = {
  managerOpen: { key: "Enter", action: "Open" },
  managerFilter: { key: "/", action: "Filter" },
  managerNew: { key: "n", action: "New" },
  globalSearch: { key: "Ctrl+P", action: "Search" },
  managerBack: { key: "Esc", action: "Back" },
  editorBack: { key: "Esc", action: "Manager" },
  editorSave: { key: "Ctrl+S", action: "Save" },
  editorFind: { key: "Ctrl+F", action: "Find" },
  editorReplace: { key: "Ctrl+R", action: "Replace" },
  editorUndo: { key: "Ctrl+Z", action: "Undo" },
  editorRedo: { key: "Ctrl+Y", action: "Redo" },
  editorWrap: { key: "Alt+Z", action: "Wrap" },
  editorTerminalPaste: { key: "Ctrl+Shift+V", action: "Paste" },
} as const

export function shortcutHintLabel(hint: ShortcutHint): string {
  return `[${hint.key}] ${hint.action}`
}

export function shortcutHintLabels(hints: readonly ShortcutHint[]): string[] {
  return hints.map(shortcutHintLabel)
}

export function renderShortcutHints(hints: readonly string[] | readonly ShortcutRenderableHint[]): StyledText {
  const normalized = hints.map((hint) => (typeof hint === "string" ? parseShortcutHintLabel(hint) : hint))
  const chunks: TextChunk[] = []

  normalized.forEach((hint, index) => {
    if (index > 0) {
      chunks.push(fg(tuiTheme.textMuted)("  ") as TextChunk)
    }
    if ("text" in hint) {
      chunks.push(fg(tuiTheme.textMuted)(hint.text) as TextChunk)
      return
    }
    const keyColor = hint.priority === "danger" ? tuiTheme.danger : tuiTheme.borderFocus
    const actionColor = hint.priority === "danger" ? tuiTheme.danger : tuiTheme.textMuted
    chunks.push(fg(keyColor)(`[${hint.key}]`) as TextChunk)
    chunks.push(fg(actionColor)(` ${hint.action}`) as TextChunk)
  })

  return new StyledText(chunks)
}

export function topbarTextIntent(): TuiColorIntent {
  return "textPrimary"
}

function parseShortcutHintLabel(label: string): ShortcutHint {
  const match = /^\[([^\]]+)\]\s*(.*)$/u.exec(label)
  if (!match) {
    return { key: label, action: "" }
  }
  return { key: match[1] ?? "", action: match[2] ?? "" }
}
