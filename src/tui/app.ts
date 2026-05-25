import { createCliRenderer, TextRenderable } from "@opentui/core"
import type { ResolveBlueNoteRootOptions } from "../config/root"
import {
  createEditorSession,
  discardEditorSession,
  saveEditorSession,
  type EditorSession,
} from "./adapters/editor-session"
import { bootstrapTuiApp, loadTuiAppState } from "./bootstrap"
import { applyEditorIntent } from "./editor/editor-input"
import { getEditorText } from "./editor/editor-buffer"
import { loadNoteDetail, type TuiNoteDetail } from "./data/note-detail-adapter"
import { renderShellLayout } from "./shell/shell-layout"
import { dispatchShellKey, type ShellKeyInput } from "./shell/shell-keymap"
import { createInitialShellState, type ShellState } from "./shell/shell-state"
import type { TuiNoteBrowserState, TuiAppState, TuiBootstrapInfo } from "./types"
import { renderEmptyState } from "./views/empty-state"
import { renderNotePane } from "./views/note-pane"
import { renderSidebar } from "./views/sidebar"
import { renderStatusBar } from "./views/status-bar"

export type { TuiAppState, TuiBootstrapInfo } from "./types"

export interface TuiRenderResult {
  bootstrap: TuiBootstrapInfo
  frame: string
  regions: {
    sidebar: string
    main: string
    statusBar: string
  }
}

export interface TuiRuntime {
  options: ResolveBlueNoteRootOptions
  appState: TuiAppState
  shellState: ShellState
  editorSession: EditorSession | null
  quitRequested: boolean
}

const CTRL_C = "\u0003"

function mapInputSequenceToShellKey(sequence: string): ShellKeyInput | null {
  switch (sequence) {
    case "\u001b":
      return "Escape"
    case "\u007f":
      return "Backspace"
    case "\r":
    case "\n":
      return "Enter"
    case "\t":
      return "Tab"
    case "\u0013":
      return "Ctrl+S"
    case "\u0004":
      return "Ctrl+D"
    case "\u001b[A":
      return "ArrowUp"
    case "\u001b[B":
      return "ArrowDown"
    case "\u001b[C":
      return "ArrowRight"
    case "\u001b[D":
      return "ArrowLeft"
    case "\u001b[3~":
      return "Delete"
    default:
      if (sequence.length === 1 && sequence >= " ") {
        return sequence
      }

      return null
  }
}

function mapInputChunkToShellKeys(chunk: string): ShellKeyInput[] {
  const directMatch = mapInputSequenceToShellKey(chunk)

  if (directMatch !== null) {
    return [directMatch]
  }

  if (chunk.startsWith("\u001b")) {
    return []
  }

  return [...chunk]
    .map((sequence) => mapInputSequenceToShellKey(sequence))
    .filter((key): key is ShellKeyInput => key !== null)
}

function renderRuntimeFrame(runtime: TuiRuntime): string {
  return `${renderTuiRuntime(runtime).frame}\n`
}

function advanceRuntimeWithKey(runtime: TuiRuntime, key: ShellKeyInput): TuiRuntime {
  return dispatchTuiKey(runtime, key)
}

async function launchStreamTuiApp(options: ResolveBlueNoteRootOptions = {}): Promise<number> {
  let runtime = createTuiRuntime(options)
  const stdin = process.stdin
  const restoreRawMode = stdin.isTTY && typeof stdin.setRawMode === "function"
  let finished = false

  process.stdout.write(renderRuntimeFrame(runtime))

  return await new Promise<number>((resolve) => {
    const cleanup = () => {
      stdin.off("data", onData)
      stdin.off("end", onEnd)
      stdin.off("close", onEnd)

      if (restoreRawMode) {
        stdin.setRawMode(false)
      }

      stdin.pause()
    }

    const finish = (exitCode: number) => {
      if (finished) {
        return
      }

      finished = true
      cleanup()
      resolve(exitCode)
    }

    const onEnd = () => {
      finish(0)
    }

    const onData = (chunk: Buffer | string) => {
      const text = chunk.toString()

      if (text.includes(CTRL_C)) {
        finish(0)
        return
      }

      for (const key of mapInputChunkToShellKeys(text)) {
        runtime = advanceRuntimeWithKey(runtime, key)

        if (runtime.quitRequested) {
          finish(0)
          return
        }

        process.stdout.write(renderRuntimeFrame(runtime))
      }
    }

    if (restoreRawMode) {
      stdin.setRawMode(true)
    }

    stdin.resume()
    stdin.on("data", onData)
    stdin.on("end", onEnd)
    stdin.on("close", onEnd)
  })
}

async function launchOpenTuiApp(options: ResolveBlueNoteRootOptions = {}): Promise<number> {
  const screenMode = process.env.BLUENOTE_TUI_TEST_SCREEN_MODE === "main-screen"
    ? "main-screen"
    : "alternate-screen"
  const emitStartupFrame = process.env.BLUENOTE_TUI_TEST_EMIT_FRAME === "1"
  const renderer = await createCliRenderer({
    clearOnShutdown: true,
    exitOnCtrlC: false,
    screenMode,
    useMouse: false,
  })
  const frame = new TextRenderable(renderer, {
    content: "",
    height: "100%",
    width: "100%",
  })

  renderer.root.add(frame)

  let runtime = createTuiRuntime(options)

  return await new Promise<number>((resolve) => {
    let emittedStartupFrame = false

    const draw = () => {
      frame.content = renderTuiRuntime(runtime).frame

      if (emitStartupFrame && !emittedStartupFrame) {
        process.stdout.write(renderRuntimeFrame(runtime))
        emittedStartupFrame = true
      }

      renderer.requestRender()
    }

    const cleanup = () => {
      renderer.removeInputHandler(onInput)
      renderer.destroy()
    }

    const finish = (exitCode: number) => {
      cleanup()
      resolve(exitCode)
    }

    const onInput = (sequence: string) => {
      if (sequence === CTRL_C) {
        finish(0)
        return true
      }

      const keys = mapInputChunkToShellKeys(sequence)

      if (keys.length === 0) {
        return false
      }

      for (const key of keys) {
        runtime = advanceRuntimeWithKey(runtime, key)
      }

      if (runtime.quitRequested) {
        finish(0)
        return true
      }

      draw()
      return true
    }

    renderer.addInputHandler(onInput)
    renderer.start()
    draw()
  })
}

export async function launchTuiApp(options: ResolveBlueNoteRootOptions = {}): Promise<number> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return launchStreamTuiApp(options)
  }

  return launchOpenTuiApp(options)
}

function createRenderState(
  shellState: Partial<ShellState> | undefined,
  noteBrowser: TuiNoteBrowserState,
  editorSession?: EditorSession | null,
): ShellState {
  const initialState = createInitialShellState()
  const selectedNoteSelector =
    shellState?.selectedNoteSelector ??
    (noteBrowser.status === "ready" ? noteBrowser.selectedNote?.selector ?? noteBrowser.notes[0]?.selector ?? null : null)

  return {
    ...initialState,
    ...shellState,
    selectedNoteSelector,
    editorDirty: editorSession?.buffer.dirty ?? shellState?.editorDirty ?? initialState.editorDirty,
  }
}

function loadSelectedNoteDetail(
  noteBrowser: TuiNoteBrowserState,
  selector: string | null,
  options: ResolveBlueNoteRootOptions,
): TuiNoteDetail | null {
  if (noteBrowser.status !== "ready") {
    return null
  }

  if (selector === null) {
    return noteBrowser.selectedNote
  }

  if (noteBrowser.selectedNote?.selector === selector) {
    return noteBrowser.selectedNote
  }

  const detail = loadNoteDetail({
    ...options,
    selector,
  })

  return detail.ok ? detail.note : noteBrowser.selectedNote
}

function resolveSelectedNote(
  state: TuiAppState,
  shellState: ShellState,
  options: ResolveBlueNoteRootOptions,
  editorSession?: EditorSession | null,
): TuiNoteDetail | null {
  const noteBrowser = state.noteBrowser

  if (noteBrowser.status !== "ready") {
    return null
  }

  const selectedSelector = shellState.selectedNoteSelector ?? noteBrowser.selectedNote?.selector ?? null
  const selectedNote = loadSelectedNoteDetail(noteBrowser, selectedSelector, options)

  if (selectedNote === null || editorSession === null || editorSession === undefined) {
    return selectedNote
  }

  if (editorSession.selector !== selectedNote.selector) {
    return selectedNote
  }

  return {
    ...selectedNote,
    body: getEditorText(editorSession.buffer),
  }
}

function renderMainRegion(
  state: TuiAppState,
  shellState: ShellState,
  options: ResolveBlueNoteRootOptions,
  editorSession?: EditorSession | null,
): string {
  const noteBrowser = state.noteBrowser

  if (noteBrowser.status === "empty") {
    if (state.bootstrap.status === "ready" && noteBrowser.notes.length === 0) {
      return renderNotePane({
        selectedNote: null,
        focusRegion: shellState.focusRegion,
        emptyMessage: "No notes available.",
      })
    }

    return renderEmptyState({
      title: state.bootstrap.status === "missing-root" ? "BlueNote root missing" : "No notes available",
      message: noteBrowser.emptyState.message,
      hint: noteBrowser.emptyState.hint,
    })
  }

  return renderNotePane({
    selectedNote: resolveSelectedNote(state, shellState, options, editorSession),
    focusRegion: shellState.focusRegion,
    emptyMessage: "No notes available.",
  })
}

function renderHelpOverlay(): string {
  return [
    "HELP",
    "- j/k or ArrowUp/ArrowDown: move selection",
    "- Tab: cycle focus",
    "- Enter: open selected note",
    "- Escape: return from note view to browsing",
    "- i/e: enter editor mode",
    "- Ctrl+S: save dirty editor buffer",
    "- Ctrl+D: discard dirty editor buffer",
    "- r: refresh notes",
    "- ?: toggle help",
    "- q: quit",
  ].join("\n")
}

function renderFromState(
  appState: TuiAppState,
  options: ResolveBlueNoteRootOptions,
  shellState?: Partial<ShellState>,
  editorSession?: EditorSession | null,
): TuiRenderResult {
  const renderState = createRenderState(shellState, appState.noteBrowser, editorSession)
  const sidebar = renderSidebar({
    notes: appState.noteBrowser.notes,
    selectedNoteSelector: renderState.selectedNoteSelector,
    focusRegion: renderState.focusRegion,
  })
  const main = renderMainRegion(appState, renderState, options, editorSession)
  const statusBar = renderStatusBar({
    mode: renderState.mode,
    focusRegion: renderState.focusRegion,
    editorDirty: renderState.editorDirty,
    transientMessage: renderState.transientMessage,
  })
  const frame = renderShellLayout({
    sidebar,
    main,
    statusBar,
  })

  return {
    bootstrap: appState.bootstrap,
    frame: renderState.helpVisible ? `${frame}\n\n${renderHelpOverlay()}` : frame,
    regions: {
      sidebar,
      main,
      statusBar,
    },
  }
}

function initialSelectedSelector(appState: TuiAppState): string | null {
  return appState.noteBrowser.status === "ready"
    ? appState.noteBrowser.selectedNote?.selector ?? appState.noteBrowser.notes[0]?.selector ?? null
    : null
}

function setSelectedDetail(appState: TuiAppState, selector: string | null, options: ResolveBlueNoteRootOptions): TuiAppState {
  if (appState.noteBrowser.status !== "ready") {
    return appState
  }

  const resolvedSelector = selector ?? appState.noteBrowser.selectedNote?.selector ?? appState.noteBrowser.notes[0]?.selector ?? null
  const selectedNote = loadSelectedNoteDetail(appState.noteBrowser, resolvedSelector, options)

  return {
    ...appState,
    noteBrowser: {
      ...appState.noteBrowser,
      selectedNote,
    },
  }
}

function reloadRuntimeAppState(runtime: TuiRuntime, preferredSelector = runtime.shellState.selectedNoteSelector): TuiRuntime {
  const appState = setSelectedDetail(getTuiAppState(runtime.options), preferredSelector, runtime.options)
  return {
    ...runtime,
    appState,
  }
}

function createEditorSessionForSelection(runtime: TuiRuntime): EditorSession | null {
  const selectedNote = resolveSelectedNote(runtime.appState, runtime.shellState, runtime.options)
  if (selectedNote === null) {
    return null
  }

  return createEditorSession(selectedNote.selector, selectedNote.body)
}

export function getTuiAppState(options: ResolveBlueNoteRootOptions = {}): TuiAppState {
  return loadTuiAppState(options)
}

export function getTuiBootstrapInfo(options: ResolveBlueNoteRootOptions = {}): TuiBootstrapInfo {
  return bootstrapTuiApp(options)
}

export function createTuiRuntime(options: ResolveBlueNoteRootOptions = {}): TuiRuntime {
  const appState = getTuiAppState(options)
  const shellState = createRenderState(
    {
      selectedNoteSelector: initialSelectedSelector(appState),
    },
    appState.noteBrowser,
  )

  return {
    options,
    appState: setSelectedDetail(appState, shellState.selectedNoteSelector, options),
    shellState,
    editorSession: null,
    quitRequested: false,
  }
}

export function dispatchTuiKey(runtime: TuiRuntime, key: ShellKeyInput): TuiRuntime {
  const dispatchResult = dispatchShellKey({
    key,
    shellState: runtime.shellState,
    noteSelectors: runtime.appState.noteBrowser.notes.map((note) => note.selector),
  })

  let nextRuntime: TuiRuntime = {
    ...runtime,
    shellState: dispatchResult.shellState,
    quitRequested: dispatchResult.effect.type === "quit",
  }

  switch (dispatchResult.effect.type) {
    case "none":
      return nextRuntime
    case "quit":
      return nextRuntime
    case "refresh":
      return reloadRuntimeAppState(nextRuntime)
    case "enter-editor":
      return {
        ...nextRuntime,
        editorSession: createEditorSessionForSelection(nextRuntime),
      }
    case "editor-intent": {
      if (nextRuntime.editorSession === null) {
        return nextRuntime
      }

      const buffer = applyEditorIntent(nextRuntime.shellState, nextRuntime.editorSession.buffer, dispatchResult.effect.intent)
      return {
        ...nextRuntime,
        editorSession: {
          ...nextRuntime.editorSession,
          buffer,
        },
        shellState: {
          ...nextRuntime.shellState,
          editorDirty: buffer.dirty,
          transientMessage: null,
        },
      }
    }
    case "discard": {
      if (nextRuntime.editorSession === null) {
        return nextRuntime
      }

      const editorSession = discardEditorSession(nextRuntime.editorSession)
      return {
        ...nextRuntime,
        editorSession,
        shellState: {
          ...nextRuntime.shellState,
          mode: "note",
          editorDirty: false,
          transientMessage: {
            level: "status",
            text: "Discarded unsaved changes.",
          },
        },
      }
    }
    case "save": {
      if (nextRuntime.editorSession === null) {
        return nextRuntime
      }

      const saveResult = saveEditorSession(nextRuntime.editorSession, nextRuntime.options)
      if (!saveResult.ok) {
        return {
          ...nextRuntime,
          editorSession: saveResult.session,
          shellState: {
            ...nextRuntime.shellState,
            transientMessage: {
              level: "error",
              text: saveResult.error.message,
            },
          },
        }
      }

      nextRuntime = reloadRuntimeAppState(
        {
          ...nextRuntime,
          editorSession: saveResult.session,
          shellState: {
            ...nextRuntime.shellState,
            selectedNoteSelector: saveResult.summary.key ?? nextRuntime.shellState.selectedNoteSelector,
            editorDirty: false,
            transientMessage: {
              level: "status",
              text: "Saved note.",
            },
          },
        },
        saveResult.summary.key ?? nextRuntime.shellState.selectedNoteSelector,
      )

      return nextRuntime
    }
  }
}

export function renderTuiRuntime(runtime: TuiRuntime): TuiRenderResult {
  return renderFromState(runtime.appState, runtime.options, runtime.shellState, runtime.editorSession)
}

export function renderTuiApp(
  options: ResolveBlueNoteRootOptions = {},
  shellState?: Partial<ShellState>,
): TuiRenderResult {
  const appState = getTuiAppState(options)
  return renderFromState(appState, options, shellState)
}

const invokedPath = process.argv[1]
const isMainModule = invokedPath
  ? import.meta.url === new URL(invokedPath, "file://").href
  : false

if (isMainModule) {
  process.exit(await launchTuiApp())
}
