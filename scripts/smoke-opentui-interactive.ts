import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"

import { createNote } from "../src/core/create-note"

const SMOKE_TIMEOUT_MS = 45_000
const TMUX_COMMAND_TIMEOUT_MS = 5_000
const smokeStartedAt = Date.now()

function assertWithinSmokeDeadline(context: string): void {
  const elapsed = Date.now() - smokeStartedAt
  if (elapsed > SMOKE_TIMEOUT_MS) {
    throw new Error(`${context}: interactive smoke exceeded ${SMOKE_TIMEOUT_MS}ms safety deadline`)
  }
}

function run(command: string, args: string[], options: { env?: NodeJS.ProcessEnv; timeout?: number } = {}) {
  return spawnSync(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...options.env },
    encoding: "utf8",
    timeout: options.timeout ?? TMUX_COMMAND_TIMEOUT_MS,
    maxBuffer: 1024 * 1024,
  })
}

function wait(milliseconds: number, context = "wait"): void {
  assertWithinSmokeDeadline(context)
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)
  assertWithinSmokeDeadline(context)
}

function expectPaneContains(pane: string, expected: string, context: string): void {
  if (!pane.includes(expected)) {
    throw new Error(`${context}: expected pane to include ${JSON.stringify(expected)}. Captured:\n${pane}`)
  }
}

function expectPaneExcludes(pane: string, unexpected: string, context: string): void {
  if (pane.includes(unexpected)) {
    throw new Error(`${context}: expected pane not to include ${JSON.stringify(unexpected)}. Captured:\n${pane}`)
  }
}

function countVisibleOccurrences(pane: string, text: string): number {
  return pane.split(text).length - 1
}

function expectLatestScreen(pane: string, latest: string, previous: string, context: string): void {
  const latestIndex = pane.lastIndexOf(latest)
  const previousIndex = pane.lastIndexOf(previous)
  if (latestIndex === -1 || latestIndex <= previousIndex) {
    throw new Error(`${context}: expected latest visible screen marker ${JSON.stringify(latest)} after ${JSON.stringify(previous)}. Captured:\n${pane}`)
  }
}

interface NoteArtifacts {
  key: string
  notePath: string
  relativePath: string
  sidecarPath: string
}

function findNoteArtifactsByTitle(rootPath: string, title: string): NoteArtifacts | null {
  const stateNotesPath = path.join(rootPath, ".state", "notes")
  if (!existsSync(stateNotesPath)) {
    return null
  }

  for (const entry of readdirSync(stateNotesPath, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue
    }

    const sidecarPath = path.join(stateNotesPath, entry.name)
    const sidecar = JSON.parse(readFileSync(sidecarPath, "utf8")) as { key?: string; title?: string; relativePath?: string }
    if (sidecar.title !== title || !sidecar.key || !sidecar.relativePath) {
      continue
    }

    return {
      key: sidecar.key,
      notePath: path.join(rootPath, sidecar.relativePath),
      relativePath: sidecar.relativePath,
      sidecarPath,
    }
  }

  return null
}

function expectNoteArtifactsExist(rootPath: string, title: string, context: string): NoteArtifacts {
  const artifacts = findNoteArtifactsByTitle(rootPath, title)
  if (!artifacts) {
    throw new Error(`${context}: expected sidecar metadata for created note ${JSON.stringify(title)}`)
  }
  if (!existsSync(artifacts.notePath)) {
    throw new Error(`${context}: expected note file to exist at ${artifacts.notePath}`)
  }
  if (!existsSync(artifacts.sidecarPath)) {
    throw new Error(`${context}: expected sidecar file to exist at ${artifacts.sidecarPath}`)
  }

  return artifacts
}

function expectNoteArtifactsDeleted(artifacts: NoteArtifacts, context: string): void {
  if (existsSync(artifacts.notePath)) {
    throw new Error(`${context}: expected note file to be deleted at ${artifacts.notePath}`)
  }
  if (existsSync(artifacts.sidecarPath)) {
    throw new Error(`${context}: expected sidecar file to be deleted at ${artifacts.sidecarPath}`)
  }
}

function sendKeys(sessionName: string, ...keys: string[]): void {
  assertWithinSmokeDeadline(`send keys ${keys.join(" ")}`)
  const result = run("tmux", ["send-keys", "-t", sessionName, ...keys])
  if (result.status !== 0) {
    throw new Error(`Failed to send keys ${keys.join(" ")}: ${result.stderr || result.stdout}`)
  }
}

function sendText(sessionName: string, text: string): void {
  assertWithinSmokeDeadline(`send text ${text}`)
  const result = run("tmux", ["send-keys", "-l", "-t", sessionName, text])
  if (result.status !== 0) {
    throw new Error(`Failed to send literal text ${text}: ${result.stderr || result.stdout}`)
  }
  wait(250)
}

function capturePane(sessionName: string, context: string): string {
  assertWithinSmokeDeadline(context)
  const result = run("tmux", ["capture-pane", "-p", "-t", sessionName])
  if (result.status !== 0) {
    throw new Error(`${context}: failed to capture tmux TUI pane: ${result.stderr || result.stdout}`)
  }

  return result.stdout
}

function capturePaneUntil(sessionName: string, context: string, expected: string, attempts = 10): string {
  let pane = ""
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    assertWithinSmokeDeadline(context)
    pane = capturePane(sessionName, context)
    if (pane.includes(expected)) {
      return pane
    }
    wait(300, context)
  }

  return pane
}

function createSmokeNote(rootPath: string, title: string, body: string, moveToFolder?: string): ReturnType<typeof createNote> {
  const summary = createNote({
    override: rootPath,
    title,
    body,
    randomSource: () => 0.123456789,
    clock: { now: () => new Date("2026-05-26T12:00:00.000Z") },
  })

  if (!moveToFolder) {
    return summary
  }

  const nextRelativePath = path.join(moveToFolder, `${summary.key}.md`).replaceAll("\\", "/")
  const nextNotePath = path.join(rootPath, nextRelativePath)
  mkdirSync(path.dirname(nextNotePath), { recursive: true })
  renameSync(summary.notePath, nextNotePath)

  const sidecarPath = path.join(rootPath, ".state", "notes", `${summary.key}.json`)
  const sidecar = JSON.parse(readFileSync(sidecarPath, "utf8")) as { relativePath: string }
  sidecar.relativePath = nextRelativePath
  writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2) + "\n", "utf8")

  return {
    ...summary,
    notePath: nextNotePath,
    relativePath: nextRelativePath,
  }
}

const rootPath = mkdtempSync(path.join(tmpdir(), "bluenote-opentui-interactive-"))
const sessionName = `bluenote-opentui-${process.pid}`
let tuiPanePid: number | null = null
let cleanedUp = false

function killTuiProcess(): void {
  if (tuiPanePid === null) {
    return
  }

  for (const signal of ["SIGTERM", "SIGKILL"] as const) {
    try {
      process.kill(-tuiPanePid, signal)
    } catch {
      // The pane process may not be its own process group leader in all tmux builds.
    }
    try {
      process.kill(tuiPanePid, signal)
    } catch {
      // Already exited.
    }
    if (signal === "SIGTERM") {
      wait(100, "cleanup")
    }
  }
}

function cleanup(): void {
  if (cleanedUp) {
    return
  }
  cleanedUp = true
  killTuiProcess()
  run("tmux", ["kill-session", "-t", sessionName], { timeout: 2_000 })
  killTuiProcess()
  rmSync(rootPath, { recursive: true, force: true })
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    cleanup()
    process.exit(signal === "SIGINT" ? 130 : 143)
  })
}

try {
  const initResult = run("bun", ["run", "./bin/bn.ts", "init"], { env: { BLUENOTE_ROOT: rootPath } })
  if (initResult.status !== 0) {
    throw new Error(`Failed to initialize smoke root: ${initResult.stderr || initResult.stdout}`)
  }

  createSmokeNote(
    rootPath,
    "Folder Navigation Fixture",
    "Folder smoke note body for preview and navigation.\nContains the folder-query token.",
    "notes/projects",
  )
  createSmokeNote(
    rootPath,
    "Root Editor Fixture",
    "Root smoke note body.\nFindable alpha token for editor find smoke.",
    "notes",
  )

  const rebuildResult = run("bun", ["run", "./bin/bn.ts", "rebuild"], { env: { BLUENOTE_ROOT: rootPath } })
  if (rebuildResult.status !== 0) {
    throw new Error(`Failed to rebuild smoke root: ${rebuildResult.stderr || rebuildResult.stdout}`)
  }

  const launchResult = run("tmux", [
    "new-session",
    "-d",
    "-s",
    sessionName,
    "-x",
    "100",
    "-y",
    "30",
    `cd ${JSON.stringify(process.cwd())} && exec env BLUENOTE_ROOT=${JSON.stringify(rootPath)} TERM=xterm-256color bun run ./bin/bn.ts tui`,
  ])
  if (launchResult.status !== 0) {
    throw new Error(`Failed to launch tmux TUI smoke session: ${launchResult.stderr || launchResult.stdout}`)
  }

  const panePidResult = run("tmux", ["display-message", "-p", "-t", sessionName, "#{pane_pid}"])
  if (panePidResult.status === 0) {
    const parsedPanePid = Number.parseInt(panePidResult.stdout.trim(), 10)
    tuiPanePid = Number.isFinite(parsedPanePid) ? parsedPanePid : null
  }

  wait(1_500, "launch")

  const managerPane = capturePaneUntil(sessionName, "manager launch", "Layout 1: current folder", 30)
  if (managerPane.includes("BlueNote TUI workspace bootstrap ready")) {
    throw new Error("Interactive TUI printed the non-interactive bootstrap message instead of owning the terminal")
  }
  expectPaneContains(managerPane, "notes/", "manager launch")
  expectPaneExcludes(managerPane, "BlueNote", "manager launch")
  expectPaneContains(managerPane, "Layout 1: current folder", "manager launch")
  expectPaneContains(managerPane, "Layout 2: preview", "manager launch")
  expectPaneContains(managerPane, "projects", "manager launch")
  expectPaneContains(managerPane, "Root Editor", "manager launch")

  sendKeys(sessionName, "C-p")
  wait(500)
  const searchPromptPane = capturePane(sessionName, "search prompt")
  expectPaneContains(searchPromptPane, "Search Everything", "search prompt")
  const promptCount = countVisibleOccurrences(searchPromptPane, "Search notes, content, folders, or /commands")
  if (promptCount !== 1) {
    throw new Error(`Search Everything should show exactly one visible search prompt/input label, found ${promptCount}. Captured:\n${searchPromptPane}`)
  }

  sendText(sessionName, "folderquery")
  wait(500)
  const searchQueryPane = capturePaneUntil(sessionName, "search query", "folderquery", 20)
  expectPaneContains(searchQueryPane, "Search Everything", "search query")
  expectPaneContains(searchQueryPane, "folderquery", "search query")
  sendKeys(sessionName, "Escape")
  wait(500)
  const returnedManagerPane = capturePane(sessionName, "return from search")
  expectPaneContains(returnedManagerPane, "Layout 1: current folder", "return from search")
  expectPaneExcludes(returnedManagerPane, "BlueNote Manager", "return from search")
  expectLatestScreen(returnedManagerPane, "Layout 1: current folder", "Search Everything", "return from search")

  sendKeys(sessionName, "Right")
  wait(500)
  const folderPane = capturePane(sessionName, "manager folder enter")
  expectPaneContains(folderPane, "Layout 1: current folder", "manager folder enter")
  expectPaneExcludes(folderPane, "BlueNote Manager", "manager folder enter")
  expectPaneContains(folderPane, "notes/projects", "manager folder enter")
  expectPaneContains(folderPane, "Folder Navigation Fixture", "manager folder enter")

  sendKeys(sessionName, "Left")
  wait(500)
  const rootPane = capturePane(sessionName, "manager folder return")
  expectPaneContains(rootPane, "Layout 1: current folder", "manager folder return")
  expectPaneExcludes(rootPane, "BlueNote Manager", "manager folder return")
  expectPaneContains(rootPane, "notes/", "manager folder return")
  expectPaneContains(rootPane, "Root Editor", "manager folder return")

  sendKeys(sessionName, "Down")
  wait(250)
  sendKeys(sessionName, "o")
  const editorPane = capturePaneUntil(sessionName, "editor open", "Ctrl+F find", 30)
  expectPaneContains(editorPane, "Root Editor", "editor open")
  expectPaneContains(editorPane, "Ctrl+F find", "editor open")
  wait(500, "editor focus settle")

  const typedEditorText = "editor-input-regression-token"
  sendText(sessionName, typedEditorText)
  const editorTypedPane = capturePaneUntil(sessionName, "editor body typing", typedEditorText, 30)
  expectPaneContains(editorTypedPane, "Root Editor", "editor body typing")
  expectPaneContains(editorTypedPane, typedEditorText, "editor body typing")

  sendKeys(sessionName, "C-s")
  const editorSavedPane = capturePaneUntil(sessionName, "editor ctrl-s save", "Saved", 30)
  expectPaneContains(editorSavedPane, typedEditorText, "editor ctrl-s save")

  sendKeys(sessionName, "C-f")
  wait(500)
  const editorAfterFindShortcutPane = capturePane(sessionName, "editor ctrl-f shortcut")
  expectPaneContains(editorAfterFindShortcutPane, "Root Editor", "editor ctrl-f shortcut")
  expectPaneContains(editorAfterFindShortcutPane, "Find in note", "editor ctrl-f shortcut")

  sendKeys(sessionName, "Escape")
  wait(500)
  const editorBodyReturnPane = capturePane(sessionName, "editor find return to body")
  expectPaneContains(editorBodyReturnPane, typedEditorText, "editor find return to body")
  expectPaneExcludes(editorBodyReturnPane, "Find in note", "editor find return to body")

  sendKeys(sessionName, "Escape")
  const managerReturnPane = capturePaneUntil(sessionName, "editor return to manager", "Layout 1: current folder", 20)
  expectPaneContains(managerReturnPane, "Root Editor", "editor return to manager")

  const liveManagerTitle = `Live Smoke Manager Note ${process.pid}`
  sendKeys(sessionName, "n")
  const createPromptPane = capturePaneUntil(sessionName, "manager create prompt", "New note", 20)
  expectPaneContains(createPromptPane, "Note title", "manager create prompt")
  sendText(sessionName, liveManagerTitle)
  sendKeys(sessionName, "C-m")
  const createdEditorPane = capturePaneUntil(sessionName, "manager create opens editor", "Ctrl+F find", 30)
  expectPaneContains(createdEditorPane, liveManagerTitle, "manager create opens editor")
  const createdArtifacts = expectNoteArtifactsExist(rootPath, liveManagerTitle, "manager create filesystem")

  const createdNoteParent = path.dirname(createdArtifacts.relativePath).replaceAll("\\", "/")

  sendKeys(sessionName, "Escape")
  wait(500)
  const managerAfterCreatePane = capturePaneUntil(sessionName, "manager shows created note", createdArtifacts.key, 30)
  expectPaneContains(managerAfterCreatePane, `selected ${createdArtifacts.key}`, "manager shows created note")

  sendKeys(sessionName, "Up")
  wait(150)
  sendKeys(sessionName, "Up")
  wait(150)
  sendKeys(sessionName, "C-m")
  const createdFolderPane = capturePaneUntil(sessionName, "manager enters created note folder", createdNoteParent, 20)
  expectPaneContains(createdFolderPane, createdArtifacts.key, "manager enters created note folder")

  sendKeys(sessionName, "d")
  const deletePromptPane = capturePaneUntil(sessionName, "manager delete confirmation", "Confirm delete", 20)
  expectPaneContains(deletePromptPane, createdArtifacts.key, "manager delete confirmation")
  expectPaneContains(deletePromptPane, "Enter/y confirm", "manager delete confirmation")

  sendKeys(sessionName, "Escape")
  wait(500)
  const cancelledDeletePane = capturePane(sessionName, "manager delete cancellation")
  expectPaneContains(cancelledDeletePane, createdArtifacts.key, "manager delete cancellation")
  expectPaneExcludes(cancelledDeletePane, "Confirm delete", "manager delete cancellation")
  expectNoteArtifactsExist(rootPath, liveManagerTitle, "manager delete cancellation filesystem")

  sendKeys(sessionName, "d")
  const secondDeletePromptPane = capturePaneUntil(sessionName, "manager delete confirmation retry", "Confirm delete", 20)
  expectPaneContains(secondDeletePromptPane, createdArtifacts.key, "manager delete confirmation retry")
  sendKeys(sessionName, "y")
  const deletedManagerPane = capturePaneUntil(sessionName, "manager delete removes note", "No notes or folders", 30)
  expectPaneExcludes(deletedManagerPane, createdArtifacts.key, "manager delete removes note")
  expectNoteArtifactsDeleted(createdArtifacts, "manager delete filesystem")

  sendKeys(sessionName, "q")
  wait(500)

  console.log("Interactive OpenTUI smoke check passed.")
} finally {
  cleanup()
}
