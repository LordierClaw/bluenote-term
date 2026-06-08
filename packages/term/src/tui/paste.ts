import type { PasteEvent } from "@opentui/core"

export function stripAnsiControlSequences(text: string): string {
  return text
    .replace(/\u001b\][\s\S]*?(?:\u0007|\u001b\\)/gu, "")
    .replace(/\u009d[\s\S]*?(?:\u0007|\u009c|\u001b\\)/gu, "")
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/gu, "")
    .replace(/\u009b[0-?]*[ -/]*[@-~]/gu, "")
    .replace(/\u001b[PX^_][\s\S]*?\u001b\\/gu, "")
    .replace(/[\u0090\u0098\u009e\u009f][\s\S]*?(?:\u009c|\u001b\\)/gu, "")
    .replace(/\u001b[@-_]/gu, "")
}

export function sanitizePastedEditorText(text: string): string {
  return Array.from(stripAnsiControlSequences(text)).filter((char) => {
    const code = char.codePointAt(0) ?? 0
    return char === "\n" || char === "\r" || char === "\t" || (code >= 32 && code < 127) || code >= 160
  }).join("").replace(/\r\n?/gu, "\n")
}

export function decodeEditorPasteEvent(event: PasteEvent): string {
  return sanitizePastedEditorText(new TextDecoder().decode(event.bytes))
}
