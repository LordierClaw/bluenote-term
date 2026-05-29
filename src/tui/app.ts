import path from "node:path"
import { existsSync } from "node:fs"
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
import { createSidecarRepository } from "../storage/sidecar-repository"
import { cleanupStaleAtomicNoteWriterTemps } from "../storage/atomic-note-writer"
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

type WorkspaceInputRenderer = CliRenderer & {
  prependInputHandler?: (handler: (sequence: string) => boolean) => void
  removeInputHandler?: (handler: (sequence: string) => boolean) => void
}

export interface DefaultWorkspaceControllerOptions {
  rootPath?: string
  clock?: Clock
  commandHandlers?: Partial<Record<string, WorkspaceCommandHandler>>
  cleanupStaleAtomicTemps?: (rootPath: string) => void
}

export function getTuiBootstrapInfo(): TuiBootstrapInfo {
  return {
    appName: "BlueNote",
    status: "phase-4f-tui-cleanup-navigation-save-bugs",
    nextPhase: "phase-4-next-hardening-subplan",
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

  try {
    rebuildIndexes({ override: rootPath })
  } catch {
    return showTuiNote(rootPath, note.key)
  }

  return showTuiNote(rootPath, note.key)
}

function showTuiNote(rootPath: string, selector: string): TuiNote {
  const note = showNote({ override: rootPath, selector })
  const sidecars = createSidecarRepository(rootPath)

  if (!existsSync(sidecars.getSidecarPath(note.key))) {
    return note
  }

  const sidecar = sidecars.read(note.key)
  return {
    ...note,
    createdAt: sidecar.createdAt,
    updatedAt: sidecar.updatedAt,
  }
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
  const cleanupStaleAtomicTemps = options.cleanupStaleAtomicTemps ?? cleanupStaleAtomicNoteWriterTemps

  cleanupStaleAtomicTemps(rootPath)
  ensureTuiIndexes(rootPath)

  return createWorkspaceController({
    listNotes: () => listNotes({ override: rootPath }),
    showNote: (selector) => showTuiNote(rootPath, selector),
    searchNotes: (query) => searchNotes(query, { override: rootPath }),
    createNote: (title, body) => createNote({ override: rootPath, title, body, clock }),
    deleteNote: (selector) => {
      deleteNote({ override: rootPath, selector, force: true })
    },
    persistEditorBody: (note, body) => persistTuiEditorBody(rootPath, note, body, clock),
    commandHandlers: options.commandHandlers,
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
    const handled = routeEditorKey(sequence, controller, onExit, onInvalidate)
    if (handled) return { handled: true }
    return { handled: routeControlledEditorBodyInput(controller, sequence) }
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

function effectiveWorkspaceWidth(renderer: CliRenderer): number | undefined {
  const rendererSize = renderer as CliRenderer & { width?: number; terminalWidth?: number }
  return (process.stdout.isTTY ? process.stdout.columns : undefined) ?? rendererSize.width ?? rendererSize.terminalWidth
}

function effectiveWorkspaceHeight(renderer: CliRenderer): number | undefined {
  const rendererSize = renderer as CliRenderer & { height?: number; terminalHeight?: number }
  return (process.stdout.isTTY ? process.stdout.rows : undefined) ?? rendererSize.height ?? rendererSize.terminalHeight
}

function renderWorkspace(renderer: CliRenderer, controller: WorkspaceController, onExit: () => void, onInvalidate: () => void): BoxRenderable {
  const state = controller.getState()
  if (state.screen === "search") {
    return renderSearchEverythingScreen({ renderer, controller, onInvalidate, height: effectiveWorkspaceHeight(renderer) })
  }

  if (state.screen === "editor") {
    return renderEditorScreen({ renderer, controller, onExit, onInvalidate })
  }

  return renderManagerScreen({ renderer, controller, onExit, onInvalidate, width: effectiveWorkspaceWidth(renderer) })
}

function renderableDescendants(node: Renderable): Renderable[] {
  return [node, ...node.getChildren().flatMap((child) => renderableDescendants(child))]
}

function stripAnsiControlSequences(text: string): string {
  return text
    .replace(/\u001b\][\s\S]*?(?:\u0007|\u001b\\)/gu, "")
    .replace(/\u009d[\s\S]*?(?:\u0007|\u009c|\u001b\\)/gu, "")
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/gu, "")
    .replace(/\u009b[0-?]*[ -/]*[@-~]/gu, "")
    .replace(/\u001b[PX^_][\s\S]*?\u001b\\/gu, "")
    .replace(/[\u0090\u0098\u009e\u009f][\s\S]*?(?:\u009c|\u001b\\)/gu, "")
    .replace(/\u001b[@-_]/gu, "")
}

function sanitizePastedEditorText(text: string): string {
  return Array.from(stripAnsiControlSequences(text)).filter((char) => {
    const code = char.codePointAt(0) ?? 0
    return char === "\n" || char === "\r" || char === "\t" || (code >= 32 && code < 127) || code >= 160
  }).join("").replace(/\r\n?/gu, "\n")
}

function routeControlledEditorBodyInput(controller: WorkspaceController, sequence: string): boolean {
  const state = controller.getState()
  if (state.screen !== "editor" || state.mode !== "editor.body" || !state.editor) return false

  const bracketedPasteStart = "\u001b[200~"
  const bracketedPasteEnd = "\u001b[201~"
  if (sequence.startsWith(bracketedPasteStart) && sequence.endsWith(bracketedPasteEnd)) {
    const pasted = sequence.slice(bracketedPasteStart.length, -bracketedPasteEnd.length)
    const sanitized = sanitizePastedEditorText(pasted)
    if (sanitized.length > 0) {
      controller.insertEditorText(sanitized)
    }
    return true
  }

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
      if (sequence.length > 1) {
        const sanitized = sanitizePastedEditorText(sequence)
        if (sanitized.length > 0) {
          controller.insertEditorText(sanitized)
        }
        return true
      }
      if (sequence.length > 0 && ((firstCode >= 32 && firstCode < 127) || firstCode >= 160)) {
        controller.insertEditorText(sequence)
        return true
      }
      return false
    }
  }
}

export function focusActiveWorkspaceInput(screen: Renderable): void {
  const activeInput = renderableDescendants(screen).find((node) =>
    node.id === "bluenote-search-query" || node.id === "bluenote-editor-find-query" || node.id === "bluenote-editor-body-input" || node.id === "bluenote-manager-filter-query" || node.id === "bluenote-manager-create-title",
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
  let rerenderTimer: ReturnType<typeof setTimeout> | null = null
  let cleanupTerminalResize = (): void => {}
  let cleanupWorkspaceInput = (): void => {}

  const destroy = (): void => {
    if (destroyed) {
      return
    }
    destroyed = true
    if (rerenderTimer) {
      clearTimeout(rerenderTimer)
      rerenderTimer = null
      rerenderScheduled = false
    }
    cleanupWorkspaceInput()
    cleanupWorkspaceInput = (): void => {}
    if (currentScreen) {
      blurWorkspaceInputs(currentScreen)
      currentScreen.destroyRecursively()
    }
    cleanupTerminalResize()
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
    rerenderTimer = setTimeout(() => {
      rerenderTimer = null
      rerenderScheduled = false
      rerender()
    }, 0)
  }

  if (process.stdout.isTTY) {
    const handleTerminalResize = (): void => {
      scheduleRerender()
    }
    process.stdout.on("resize", handleTerminalResize)
    process.on("SIGWINCH", handleTerminalResize)
    cleanupTerminalResize = () => {
      process.stdout.off("resize", handleTerminalResize)
      process.off("SIGWINCH", handleTerminalResize)
    }
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
  const inputRegistration = renderer as WorkspaceInputRenderer
  if (inputRegistration.prependInputHandler) {
    inputRegistration.prependInputHandler(workspaceInputHandler)
  } else {
    renderer.addInputHandler(workspaceInputHandler)
  }
  cleanupWorkspaceInput = () => {
    inputRegistration.removeInputHandler?.(workspaceInputHandler)
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
  let exitCode: CliResult["exitCode"] = 0
  const signals = ["SIGINT", "SIGTERM", "SIGHUP"] as const
  await new Promise<void>((resolve) => {
    let resolved = false
    const cleanupSignalHandlers = (): void => {
      for (const signal of signals) {
        process.off(signal, handleSignal)
      }
    }
    const finish = (): void => {
      if (resolved) {
        return
      }
      resolved = true
      cleanupSignalHandlers()
      resolve()
    }
    const handleSignal = (_signal: NodeJS.Signals): void => {
      exitCode = 1
      running.destroy()
      finish()
    }
    for (const signal of signals) {
      process.once(signal, handleSignal)
    }
    if (running.renderer.isDestroyed) {
      finish()
      return
    }
    running.renderer.once("destroy", finish)
  })

  return {
    exitCode,
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
