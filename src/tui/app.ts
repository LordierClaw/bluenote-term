import path from "node:path"
import { createCliRenderer, type BoxRenderable, type CliRenderer } from "@opentui/core"

import { resolveBlueNoteRoot } from "../config/root"
import { IndexUnavailableError } from "../core/errors"
import { listNotes } from "../core/list-notes"
import { rebuildIndexes } from "../core/rebuild-indexes"
import { searchNotes } from "../core/search-notes"
import { showNote } from "../core/show-note"
import type { CliResult } from "../core/types"
import { systemClock, type Clock } from "../platform/clock"
import { createNoteRepository } from "../storage/note-repository"
import { renderEditorScreen, routeEditorKey } from "./render-editor"
import { renderManagerScreen, routeManagerKey } from "./render-manager"
import { renderSearchEverythingScreen, routeSearchEverythingKey } from "./render-search-everything"
import type { TuiNote } from "./state"
import { createWorkspaceController, type WorkspaceCommandHandler, type WorkspaceController } from "./workspace-controller"

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

export interface DefaultWorkspaceControllerOptions {
  rootPath?: string
  clock?: Clock
  commandHandlers?: Partial<Record<string, WorkspaceCommandHandler>>
}

export function getTuiBootstrapInfo(): TuiBootstrapInfo {
  return {
    appName: "BlueNote",
    status: "phase-3-tui-workspace",
    nextPhase: "phase-4-search-editing-and-recovery",
  }
}

export function formatTuiBootstrapMessage(info: TuiBootstrapInfo = getTuiBootstrapInfo()): string {
  return `${info.appName} TUI workspace bootstrap ready (${info.status}). Next: ${info.nextPhase}.\n`
}

function persistTuiEditorBody(rootPath: string, note: TuiNote, body: string, clock: Clock): TuiNote {
  const repository = createNoteRepository(rootPath)
  repository.syncEditedNote(path.join(rootPath, note.relativePath), {
    title: note.title,
    body,
    updatedAt: clock.now().toISOString(),
  })
  rebuildIndexes({ override: rootPath })

  return showNote({ override: rootPath, selector: note.key })
}

function ensureTuiIndexes(rootPath: string): void {
  try {
    listNotes({ override: rootPath })
  } catch (error) {
    if (!(error instanceof IndexUnavailableError)) {
      throw error
    }

    rebuildIndexes({ override: rootPath })
  }
}

export function createDefaultWorkspaceController(options: DefaultWorkspaceControllerOptions = {}): WorkspaceController {
  const rootPath = resolveBlueNoteRoot({ override: options.rootPath })
  const clock = options.clock ?? systemClock

  ensureTuiIndexes(rootPath)

  return createWorkspaceController({
    listNotes: () => listNotes({ override: rootPath }),
    showNote: (selector) => showNote({ override: rootPath, selector }),
    searchNotes: (query) => searchNotes(query, { override: rootPath }),
    persistEditorBody: (note, body) => persistTuiEditorBody(rootPath, note, body, clock),
    commandHandlers: {
      "/rebuild": () => {},
      "/migrate": () => {},
      "/new": () => {},
      "/archive": () => {},
      "/delete": () => {},
      "/find": () => {},
      "/replace": () => {},
      "/save": () => {},
      ...options.commandHandlers,
    },
  })
}

export interface RoutedWorkspaceKey {
  handled: boolean
  exit?: boolean
}

export function routeWorkspaceKey(
  sequence: string,
  controller: WorkspaceController,
  onExit: () => void,
  onInvalidate: () => void = () => {},
): RoutedWorkspaceKey {
  const state = controller.getState()

  if (sequence === "\u0003") {
    onExit()
    return { handled: true, exit: true }
  }

  if (sequence === "\u0010") {
    if (state.screen === "search") {
      controller.toggleSearch()
    } else {
      controller.openSearch()
    }
    return { handled: true }
  }

  if (state.screen === "search") {
    return { handled: routeSearchEverythingKey(sequence, controller) }
  }

  if (state.screen === "editor") {
    return { handled: routeEditorKey(sequence, controller, onExit, onInvalidate) }
  }

  return { handled: routeManagerKey(sequence, controller, onExit), exit: sequence === "q" || undefined }
}

function renderWorkspace(renderer: CliRenderer, controller: WorkspaceController, onExit: () => void, onInvalidate: () => void): BoxRenderable {
  const state = controller.getState()
  if (state.screen === "search") {
    return renderSearchEverythingScreen({ renderer, controller, onInvalidate })
  }

  if (state.screen === "editor") {
    return renderEditorScreen({ renderer, controller, onExit, onInvalidate })
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
    controller.dispose()
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

  controller.setAutosaveStateChangeHandler(rerender)

  renderer.addInputHandler((sequence) => {
    if (destroyed || renderer.isDestroyed) {
      return false
    }

    const routed = routeWorkspaceKey(sequence, controller, destroy, rerender)
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
    stdout: "",
    stderr: "",
  }
}

export async function runTuiCliInteractive(): Promise<CliResult> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: "BlueNote TUI requires an interactive terminal. Run `bn tui` from a TTY.\n",
    }
  }

  const running = await startTuiWorkspace()
  await new Promise<void>((resolve) => {
    running.renderer.on("destroy", resolve)
  })

  return {
    exitCode: 0,
    stdout: "",
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
