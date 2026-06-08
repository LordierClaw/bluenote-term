import clipboard from "clipboardy"

export interface ClipboardRuntime {
  readText(): string
}

export const desktopClipboard: ClipboardRuntime = {
  readText() {
    return clipboard.readSync()
  },
}
