import { StyledText, fg, type TextChunk } from "@opentui/core"

import { tuiTheme, type TuiColorIntent } from "./theme"

export interface ShortcutHint {
  key: string
  action: string
  priority?: "primary" | "secondary"
}

export interface ShortcutTextHint {
  text: string
  priority?: "primary" | "secondary"
}

export type ShortcutRenderableHint = ShortcutHint | ShortcutTextHint

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
    chunks.push(fg(tuiTheme.borderFocus)(`[${hint.key}]`) as TextChunk)
    chunks.push(fg(tuiTheme.textMuted)(` ${hint.action}`) as TextChunk)
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
