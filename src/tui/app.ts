import { createCliRenderer, type BoxRenderable, type CliRenderer } from "@opentui/core"

import { listNotes } from "../core/list-notes"
import { searchNotes } from "../core/search-notes"
import { showNote } from "../core/show-note"
import type { CliResult } from "../core/types"
import { renderEditorScreen, routeEditorKey } from "./render-editor"
import { renderManagerScreen, routeManagerKey } from "./render-manager"
import { renderSearchEverythingScreen, routeSearchEverythingKey } from "./render-search-everything"
import { createWorkspaceController, type WorkspaceController } from "./workspace-controller"

export interface TuiBootstrapInfo {
  appName: string
  status: string
  nextPhase: string
}

export interface StartTuiWorkspaceOptions {
  controller?: WorkspaceController
  renderer?: CliRenderer
}

export interface RunningTuiWorkspace {
  renderer: CliRenderer
  controller: WorkspaceController
  destroy: () => void
}

export function getTuiBootstrapInfo(): TuiBootstrapInfo {
  return {
    appName: "BlueNote",
    status: "phase-3-workspace-bootstrap",
    nextPhase: "phase-3-render-screens",
  }
}

export function formatTuiBootstrapMessage(info: TuiBootstrapInfo = getTuiBootstrapInfo()): string {
  return `${info.appName} TUI workspace bootstrap ready (${info.status}). Next: ${info.nextPhase}.\n`
}

function createDefaultWorkspaceController(): WorkspaceController {
  return createWorkspaceController({
    listNotes: () => listNotes(),
    showNote: (selector) => showNote({ selector }),
    searchNotes: (query) => searchNotes(query),
    commandHandlers: {
      "/rebuild": () => {},
      "/migrate": () => {},
      "/new": () => {},
      "/archive": () => {},
      "/delete": () => {},
      "/find": () => {},
      "/replace": () => {},
      "/save": () => {},
    },
  })
}

export interface RoutedWorkspaceKey {
  handled: boolean
  exit?: boolean
}

export function routeWorkspaceKey(sequence: string, controller: WorkspaceController, onExit: () => void): RoutedWorkspaceKey {
  const state = controller.getState()

  if (sequence === "\u0003") {
    onExit()
    return { handled: true, exit: true }
  }

  if (state.screen === "search") {
    return { handled: routeSearchEverythingKey(sequence, controller) }
  }

  if (sequence === "\u0010") {
    controller.openSearch()
    return { handled: true }
  }

  if (state.screen === "editor") {
    return { handled: routeEditorKey(sequence, controller, onExit) }
  }

  return { handled: routeManagerKey(sequence, controller, onExit), exit: sequence === "q" || undefined }
}

function renderWorkspace(renderer: CliRenderer, controller: WorkspaceController, onExit: () => void, onInvalidate: () => void): BoxRenderable {
  const state = controller.getState()
  if (state.screen === "search") {
    return renderSearchEverythingScreen({ renderer, controller, onInvalidate })
  }

  if (state.screen === "editor") {
    return renderEditorScreen({ renderer, controller, onExit })
  }

  return renderManagerScreen({ renderer, controller, onExit })
}

export async function startTuiWorkspace(options: StartTuiWorkspaceOptions = {}): Promise<RunningTuiWorkspace> {
  const renderer = options.renderer ?? (await createCliRenderer({ screenMode: "alternate-screen", exitOnCtrlC: true }))
  const controller = options.controller ?? createDefaultWorkspaceController()
  let currentScreen: BoxRenderable | null = null
  let destroyed = false

  const destroy = (): void => {
    if (destroyed) {
      return
    }
    destroyed = true
    currentScreen?.destroyRecursively()
    currentScreen = null
    renderer.destroy()
  }

  const rerender = (): void => {
    if (destroyed || renderer.isDestroyed) {
      return
    }
    if (currentScreen) {
      renderer.root.remove(currentScreen.id)
      currentScreen.destroyRecursively()
    }
    currentScreen = renderWorkspace(renderer, controller, destroy, rerender)
    renderer.root.add(currentScreen)
  }

  renderer.addInputHandler((sequence) => {
    if (destroyed || renderer.isDestroyed) {
      return false
    }

    const routed = routeWorkspaceKey(sequence, controller, destroy)
    if (routed.handled && !routed.exit) {
      rerender()
    }
    return routed.handled
  })

  rerender()
  renderer.start()

  return { renderer, controller, destroy }
}

export function runTuiCli(): CliResult {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: "BlueNote TUI requires an interactive terminal. Run `bn tui` from a TTY.\n",
    }
  }

  void startTuiWorkspace()

  return {
    exitCode: 0,
    stdout: formatTuiBootstrapMessage(),
    stderr: "",
  }
}

const invokedPath = process.argv[1]
const isMainModule = invokedPath
  ? import.meta.url === new URL(invokedPath, "file://").href
  : false

if (isMainModule) {
  process.stdout.write(formatTuiBootstrapMessage())
}
