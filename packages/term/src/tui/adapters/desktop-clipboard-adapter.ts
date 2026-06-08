import { spawnSync } from "node:child_process"
import clipboard from "clipboardy"

import type { ClipboardOperationResult, ClipboardStatus } from "./editor-buffer-adapter"

export interface ClipboardCommandRun {
  command: string
  args: string[]
  input?: string
}

export interface ClipboardCommandResult {
  ok: boolean
  stdout: string
}

export interface DesktopClipboardLibraryProvider {
  name: string
  available: () => boolean
  writeText: (text: string) => void
  readText: () => string
}

export interface DesktopClipboardModelDependencies {
  platform?: NodeJS.Platform
  env?: Record<string, string | undefined>
  commandExists?: (command: string) => boolean
  run?: (run: ClipboardCommandRun) => ClipboardCommandResult
  stdout?: Pick<NodeJS.WriteStream, "write"> & Partial<Pick<NodeJS.WriteStream, "isTTY">>
  enableOsc52?: boolean
  library?: DesktopClipboardLibraryProvider | false
}

interface ClipboardProviderCommand {
  command: string
  args: string[]
}

interface ClipboardProvider {
  name: string
  category: "desktop" | "terminal"
  copy?: ClipboardProviderCommand
  paste?: ClipboardProviderCommand
}

const clipboardCommandTimeoutMs = 1_500

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

function defaultCommandExists(command: string): boolean {
  const result = spawnSync("sh", ["-lc", `command -v ${shellQuote(command)}`], { encoding: "utf8", timeout: clipboardCommandTimeoutMs })
  return result.status === 0 && !result.error
}

function defaultRun(run: ClipboardCommandRun): ClipboardCommandResult {
  const result = spawnSync(run.command, run.args, { input: run.input, encoding: "utf8", timeout: clipboardCommandTimeoutMs })
  return {
    ok: result.status === 0 && !result.error,
    stdout: result.stdout ?? "",
  }
}

const defaultClipboardLibrary: DesktopClipboardLibraryProvider = {
  name: "clipboardy",
  available: () => typeof clipboard.writeSync === "function" && typeof clipboard.readSync === "function",
  writeText: (text) => clipboard.writeSync(text),
  readText: () => clipboard.readSync(),
}

function shouldUseDefaultLibrary(deps: DesktopClipboardModelDependencies): boolean {
  if (deps.library !== undefined || deps.platform !== undefined || deps.env !== undefined || deps.commandExists !== undefined || deps.run !== undefined) {
    return false
  }
  if (process.platform === "linux") {
    return Boolean(process.env.WAYLAND_DISPLAY || process.env.DISPLAY || process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP)
  }
  return process.platform === "darwin" || process.platform === "win32" || process.platform === "openbsd" || process.platform === "freebsd" || process.platform === "android"
}

function resolveLibrary(deps: DesktopClipboardModelDependencies): DesktopClipboardLibraryProvider | undefined {
  if (deps.library === false) return undefined
  const library = deps.library ?? (shouldUseDefaultLibrary(deps) ? defaultClipboardLibrary : undefined)
  if (!library) return undefined
  try {
    return library.available() ? library : undefined
  } catch {
    return undefined
  }
}

function osc52Sequence(text: string): string {
  return `\u001b]52;c;${Buffer.from(text, "utf8").toString("base64")}\u0007`
}

function providersFor(platform: NodeJS.Platform, env: Record<string, string | undefined>): ClipboardProvider[] {
  if (platform === "darwin") {
    return [
      { name: "pbcopy/pbpaste", category: "desktop", copy: { command: "pbcopy", args: [] }, paste: { command: "pbpaste", args: [] } },
    ]
  }

  if (platform === "win32") {
    return [
      { name: "PowerShell clipboard", category: "desktop", copy: { command: "powershell.exe", args: ["-NoProfile", "-Command", "Set-Clipboard"] }, paste: { command: "powershell.exe", args: ["-NoProfile", "-Command", "Get-Clipboard", "-Raw"] } },
      { name: "PowerShell clipboard", category: "desktop", copy: { command: "powershell", args: ["-NoProfile", "-Command", "Set-Clipboard"] }, paste: { command: "powershell", args: ["-NoProfile", "-Command", "Get-Clipboard", "-Raw"] } },
    ]
  }

  const providers: ClipboardProvider[] = []
  const isWsl = Boolean(env.WSL_DISTRO_NAME || env.WSL_INTEROP)
  if (isWsl) {
    providers.push({
      name: "WSL clipboard",
      category: "desktop",
      copy: { command: "clip.exe", args: [] },
      paste: { command: "powershell.exe", args: ["-NoProfile", "-Command", "Get-Clipboard", "-Raw"] },
    })
  }

  if (platform === "linux") {
    if (env.WAYLAND_DISPLAY) {
      providers.push({ name: "wl-clipboard", category: "desktop", copy: { command: "wl-copy", args: [] }, paste: { command: "wl-paste", args: ["--no-newline"] } })
    }
    if (env.DISPLAY) {
      providers.push(
        { name: "xclip", category: "desktop", copy: { command: "xclip", args: ["-selection", "clipboard"] }, paste: { command: "xclip", args: ["-selection", "clipboard", "-o"] } },
        { name: "xsel", category: "desktop", copy: { command: "xsel", args: ["--clipboard", "--input"] }, paste: { command: "xsel", args: ["--clipboard", "--output"] } },
      )
    }
  }

  return providers
}

export function createDesktopClipboardModel(deps: DesktopClipboardModelDependencies = {}) {
  const platform = deps.platform ?? process.platform
  const env = deps.env ?? process.env
  const commandExists = deps.commandExists ?? defaultCommandExists
  const run = deps.run ?? defaultRun
  const stdout = deps.stdout ?? process.stdout
  const providerCandidates = providersFor(platform, env)
  const libraryProvider = resolveLibrary(deps)

  const commandAvailable = (command: ClipboardProviderCommand | undefined): boolean => Boolean(command && commandExists(command.command))
  const copyProvider = providerCandidates.find((provider) => commandAvailable(provider.copy))
  const pasteProvider = providerCandidates.find((provider) => commandAvailable(provider.paste))
  const osc52Available = deps.enableOsc52 ?? Boolean(stdout.isTTY && env.TERM !== "dumb")
  let internalText = ""
  let lastWrite: ClipboardOperationResult = {
    ok: true,
    providerName: "BlueNote internal clipboard",
    category: "internal",
    message: "Desktop clipboard unavailable; copied to BlueNote internal clipboard only",
  }

  const status = (): ClipboardStatus => ({
    name: libraryProvider?.name ?? copyProvider?.name ?? pasteProvider?.name ?? (osc52Available ? "terminal OSC52 clipboard" : "BlueNote internal clipboard"),
    desktopWriteAvailable: Boolean(libraryProvider) || copyProvider?.category === "desktop",
    desktopReadAvailable: Boolean(libraryProvider) || pasteProvider?.category === "desktop",
    terminalWriteAvailable: !libraryProvider && !copyProvider && osc52Available,
    copyCategory: libraryProvider ? "desktop" : (copyProvider?.category ?? (osc52Available ? "terminal" : "internal")),
    pasteCategory: libraryProvider ? "desktop" : (pasteProvider?.category ?? "internal"),
  })

  const readInternal = (message = "Desktop clipboard unavailable; pasted from BlueNote internal clipboard"): ClipboardOperationResult => ({
    ok: true,
    text: internalText,
    providerName: "BlueNote internal clipboard",
    category: "internal",
    message,
  })

  const readExternal = (): ClipboardOperationResult => {
    if (libraryProvider) {
      try {
        return {
          ok: true,
          text: libraryProvider.readText(),
          providerName: libraryProvider.name,
          category: "desktop",
          message: `Read from ${libraryProvider.name}`,
        }
      } catch {
        // Continue to command providers, then internal fallback.
      }
    }
    const paste = pasteProvider?.paste
    if (!paste) return readInternal()
    const result = run({ command: paste.command, args: paste.args })
    if (!result.ok) return readInternal("Desktop clipboard read failed; pasted from BlueNote internal clipboard")
    return {
      ok: true,
      text: result.stdout,
      providerName: pasteProvider.name,
      category: pasteProvider.category,
      message: `Read from ${pasteProvider.name}`,
    }
  }

  return {
    name: status().name,
    canRead: true,
    canWrite: true,
    clipboardStatus: status,
    lastWriteResult: () => lastWrite,
    readTextWithResult: readExternal,
    readText: () => readExternal().text ?? "",
    writeText: (text: string) => {
      internalText = text
      if (libraryProvider) {
        try {
          libraryProvider.writeText(text)
          lastWrite = { ok: true, text, providerName: libraryProvider.name, category: "desktop", message: `Copied to ${libraryProvider.name}` }
          return lastWrite
        } catch {
          // Continue to command providers, terminal fallback, then internal fallback.
        }
      }
      const copy = copyProvider?.copy
      if (copy) {
        const result = run({ command: copy.command, args: copy.args, input: text })
        if (result.ok) {
          lastWrite = { ok: true, text, providerName: copyProvider.name, category: copyProvider.category, message: `Copied to ${copyProvider.name}` }
          return lastWrite
        }
      }
      if (osc52Available) {
        stdout.write(osc52Sequence(text))
        lastWrite = { ok: true, text, providerName: "terminal OSC52 clipboard", category: "terminal", message: "Copied to BlueNote internal clipboard and emitted OSC52 terminal clipboard sequence" }
        return lastWrite
      }
      lastWrite = { ok: true, text, providerName: "BlueNote internal clipboard", category: "internal", message: copy ? "Desktop clipboard write failed; copied to BlueNote internal clipboard" : "Desktop clipboard unavailable; copied to BlueNote internal clipboard only" }
      return lastWrite
    },
  }
}
