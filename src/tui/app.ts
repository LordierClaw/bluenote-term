import path from "node:path"
import { createCliRenderer, BoxRenderable, type CliRenderer, type Renderable } from "@opentui/core"

import { resolveBlueNoteRoot } from "../config/root"
import { createNote } from "../core/create-note"
import { deleteNote } from "../core/delete-note"
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
    createNote: (title, body) => createNote({ override: rootPath, title, body, clock }),
    deleteNote: (selector) => {
      deleteNote({ override: rootPath, selector, force: true })
    },
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
    const quit = controller.requestQuit()
    if (!quit.blocked) {
      onExit()
    }
    return { handled: true, exit: !quit.blocked || undefined }
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

  if (sequence === "q" && state.mode !== "manager.filter" && state.mode !== "manager.create" && state.mode !== "manager.deleteConfirm") {
    const quit = controller.requestQuit()
    if (!quit.blocked) {
      onExit()
    }
    return { handled: true, exit: !quit.blocked || undefined }
  }

  return { handled: routeManagerKey(sequence, controller, onExit) }
}

function renderWorkspace(renderer: CliRenderer, controller: WorkspaceController, onExit: () => void, onInvalidate: () => void): BoxRenderable {
  const state = controller.getState()
  if (state.screen === "search") {
    return renderSearchEverythingScreen({ renderer, controller, onInvalidate })
  }

  if (state.screen === "editor") {
    return renderEditorScreen({ renderer, controller, onExit, onInvalidate })
  }

  return renderManagerScreen({ renderer, controller, onExit, onInvalidate })
}

function renderableDescendants(node: Renderable): Renderable[] {
  return [node, ...node.getChildren().flatMap((child) => renderableDescendants(child))]
}

function routeControlledEditorBodyInput(controller: WorkspaceController, sequence: string): boolean {
  const state = controller.getState()
  if (state.screen !== "editor" || state.mode !== "editor.body" || !state.editor) return false

  switch (sequence) {
    case "\r":
    case "\n":
      controller.insertEditorText("\n")
      return true
    case "\u007f":
    case "\b":
      controller.backspaceEditor()
      return true
    case "\u001b[3~":
      controller.deleteEditor()
      return true
    case "\u001b[D":
    case "\u001bOD":
      controller.moveEditorCursor("left")
      return true
    case "\u001b[C":
    case "\u001bOC":
      controller.moveEditorCursor("right")
      return true
    case "\u001b[A":
    case "\u001bOA":
      controller.moveEditorCursor("up")
      return true
    case "\u001b[B":
    case "\u001bOB":
      controller.moveEditorCursor("down")
      return true
    case "\u001b[H":
    case "\u001b[1~":
      controller.moveEditorCursor("home")
      return true
    case "\u001b[F":
    case "\u001b[4~":
      controller.moveEditorCursor("end")
      return true
    default: {
      const firstCode = sequence.charCodeAt(0)
      if (sequence.length > 0 && firstCode >= 32 && firstCode !== 127) {
        controller.insertEditorText(sequence)
        return true
      }
      return false
    }
  }
}

export function focusActiveWorkspaceInput(screen: Renderable): void {
  const activeInput = renderableDescendants(screen).find((node) =>
    node.id === "bluenote-search-query" || node.id === "bluenote-editor-find-query" || node.id === "bluenote-manager-filter-query" || node.id === "bluenote-manager-create-title",
  )
  if (!activeInput) {
    return
  }
  // OpenTUI focus registration is tied to the live renderable tree. Renderers may
  // focus inputs while composing a screen, before that screen is attached to the
  // root, so re-register the active component after attach.
  if (activeInput.focused) {
    activeInput.blur()
  }
  activeInput.focus()
}

export function blurWorkspaceInputs(screen: Renderable): void {
  for (const node of renderableDescendants(screen)) {
    if (node.id === "bluenote-search-query" || node.id === "bluenote-editor-find-query" || node.id === "bluenote-editor-body-input" || node.id === "bluenote-editor-body" || node.id === "bluenote-manager-filter-query" || node.id === "bluenote-manager-create-title") {
      node.blur()
    }
  }
}

export async function startTuiWorkspace(options: StartTuiWorkspaceOptions = {}): Promise<RunningTuiWorkspace> {
  const renderer = options.renderer ?? (await createCliRenderer({ screenMode: "alternate-screen", exitOnCtrlC: true }))
  const controller = options.controller ?? createDefaultWorkspaceController()
  let currentScreen: BoxRenderable | null = null
  let destroyed = false
  let rerenderScheduled = false

  const destroy = (): void => {
    if (destroyed) {
      return
    }
    destroyed = true
    if (currentScreen) {
      blurWorkspaceInputs(currentScreen)
      currentScreen.destroyRecursively()
    }
    currentScreen = null
    controller.dispose()
    renderer.destroy()
  }

  const rerender = (): void => {
    if (destroyed || renderer.isDestroyed) {
      return
    }
    for (const child of renderer.root.getChildren()) {
      blurWorkspaceInputs(child)
      renderer.root.remove(child.id)
      child.destroyRecursively()
    }
    currentScreen = renderWorkspace(renderer, controller, destroy, rerender)
    renderer.root.add(currentScreen)
    focusActiveWorkspaceInput(currentScreen)
    currentScreen.requestRender()
    renderer.root.requestRender()
    const immediateRenderer = renderer as unknown as { intermediateRender?: () => void; requestRender?: () => void }
    immediateRenderer.requestRender?.()
    immediateRenderer.intermediateRender?.()
  }

  const scheduleRerender = (): void => {
    if (rerenderScheduled) {
      return
    }
    rerenderScheduled = true
    setTimeout(() => {
      rerenderScheduled = false
      rerender()
    }, 0)
  }

  controller.setAutosaveStateChangeHandler(rerender)

  const workspaceInputHandler = (sequence: string): boolean => {
    if (destroyed || renderer.isDestroyed) {
      return false
    }

    let routed = routeWorkspaceKey(sequence, controller, destroy, rerender)
    if (!routed.handled && routeControlledEditorBodyInput(controller, sequence)) {
      routed = { handled: true }
    }

    if (routed.handled && !routed.exit) {
      scheduleRerender()
    }
    return routed.handled
  }
  const inputRegistration = renderer as unknown as { prependInputHandler?: (handler: (sequence: string) => boolean) => void }
  if (inputRegistration.prependInputHandler) {
    inputRegistration.prependInputHandler(workspaceInputHandler)
  } else {
    renderer.addInputHandler(workspaceInputHandler)
  }

  renderer.start()
  rerender()

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
