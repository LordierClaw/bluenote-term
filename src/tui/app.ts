import type { ResolveBlueNoteRootOptions } from "../config/root"
import { bootstrapTuiApp, loadTuiAppState } from "./bootstrap"
import { loadNoteDetail } from "./data/note-detail-adapter"
import { renderShellLayout } from "./shell/shell-layout"
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

function createRenderState(shellState: Partial<ShellState> | undefined, noteBrowser: TuiNoteBrowserState): ShellState {
  const initialState = createInitialShellState()
  const selectedNoteSelector =
    shellState?.selectedNoteSelector ??
    (noteBrowser.status === "ready" ? noteBrowser.selectedNote?.selector ?? null : null)

  return {
    ...initialState,
    ...shellState,
    selectedNoteSelector,
  }
}

function renderMainRegion(
  state: TuiAppState,
  shellState: ShellState,
  options: ResolveBlueNoteRootOptions,
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

  const selectedNote = shellState.selectedNoteSelector
    ? (() => {
        const detail = loadNoteDetail({
          ...options,
          selector: shellState.selectedNoteSelector,
        })

        return detail.ok ? detail.note : noteBrowser.selectedNote
      })()
    : noteBrowser.selectedNote

  return renderNotePane({
    selectedNote,
    focusRegion: shellState.focusRegion,
    emptyMessage: "No notes available.",
  })
}

export function getTuiAppState(options: ResolveBlueNoteRootOptions = {}): TuiAppState {
  return loadTuiAppState(options)
}

export function getTuiBootstrapInfo(options: ResolveBlueNoteRootOptions = {}): TuiBootstrapInfo {
  return bootstrapTuiApp(options)
}

export function renderTuiApp(
  options: ResolveBlueNoteRootOptions = {},
  shellState?: Partial<ShellState>,
): TuiRenderResult {
  const appState = getTuiAppState(options)
  const renderState = createRenderState(shellState, appState.noteBrowser)
  const sidebar = renderSidebar({
    notes: appState.noteBrowser.notes,
    selectedNoteSelector: renderState.selectedNoteSelector,
    focusRegion: renderState.focusRegion,
  })
  const main = renderMainRegion(appState, renderState, options)
  const statusBar = renderStatusBar({
    mode: renderState.mode,
    focusRegion: renderState.focusRegion,
    editorDirty: renderState.editorDirty,
    transientMessage: renderState.transientMessage,
  })

  return {
    bootstrap: appState.bootstrap,
    frame: renderShellLayout({
      sidebar,
      main,
      statusBar,
    }),
    regions: {
      sidebar,
      main,
      statusBar,
    },
  }
}

const invokedPath = process.argv[1]
const isMainModule = invokedPath
  ? import.meta.url === new URL(invokedPath, "file://").href
  : false

if (isMainModule) {
  console.log(renderTuiApp().frame)
}
