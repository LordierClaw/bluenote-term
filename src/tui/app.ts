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
  console.log(renderTuiApp().frame)
}
