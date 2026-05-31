import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"

import { createNote } from "../src/core/create-note"

const SMOKE_TIMEOUT_MS = 150_000
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

interface LiveBlueNoteTuiProcess {
  pid: number
  ppid: string
  stat: string
  command: string
}

function readProcFile(pid: string, name: string): string | null {
  try {
    return readFileSync(path.join("/proc", pid, name), "utf8")
  } catch {
    return null
  }
}

function listLiveBlueNoteTuiProcessesForRoot(targetRootPath: string): LiveBlueNoteTuiProcess[] {
  const processes: LiveBlueNoteTuiProcess[] = []
  for (const entry of readdirSync("/proc", { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^\d+$/u.test(entry.name)) {
      continue
    }

    const cmdline = readProcFile(entry.name, "cmdline")
    if (!cmdline || !cmdline.includes("bn.ts\u0000tui") && !cmdline.includes("bn.ts tui")) {
      continue
    }

    const environ = readProcFile(entry.name, "environ") ?? ""
    if (!environ.split("\u0000").includes(`BLUENOTE_ROOT=${targetRootPath}`)) {
      continue
    }

    const stat = readProcFile(entry.name, "stat") ?? ""
    const status = readProcFile(entry.name, "status") ?? ""
    const ppid = status.match(/^PPid:\s+(\d+)/mu)?.[1] ?? "?"
    processes.push({
      pid: Number.parseInt(entry.name, 10),
      ppid,
      stat: stat.match(/^\d+\s+\([^)]*\)\s+(\S+)/u)?.[1] ?? "?",
      command: cmdline.replaceAll("\u0000", " ").trim(),
    })
  }
  return processes.sort((left, right) => left.pid - right.pid)
}

function expectNoLiveBlueNoteTuiProcessesForRoot(targetRootPath: string, context: string): void {
  const deadline = Date.now() + 5_000
  let live: LiveBlueNoteTuiProcess[] = []
  while (Date.now() <= deadline) {
    live = listLiveBlueNoteTuiProcessesForRoot(targetRootPath)
    if (live.length === 0) {
      return
    }
    waitWithoutSmokeDeadline(100)
  }

  throw new Error(`${context}: expected no live BlueNote TUI processes for ${targetRootPath}; found ${JSON.stringify(live, null, 2)}`)
}

function ensureCommandAvailable(command: string, installHint: string): void {
  const result = spawnSync("bash", ["-lc", `command -v ${command}`], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    timeout: 2_000,
  })
  if (result.status !== 0) {
    throw new Error(`${command} is required for interactive OpenTUI smoke tests. ${installHint}`)
  }
}

function wait(milliseconds: number, context = "wait"): void {
  assertWithinSmokeDeadline(context)
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)
  assertWithinSmokeDeadline(context)
}

function waitWithoutSmokeDeadline(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)
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

function expectSingleVisibleOccurrence(pane: string, text: string, context: string): void {
  const count = countVisibleOccurrences(pane, text)
  if (count !== 1) {
    throw new Error(`${context}: expected exactly one visible occurrence of ${JSON.stringify(text)}, found ${count}. Captured:\n${pane}`)
  }
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
  const dataNotesPath = path.join(rootPath, ".data", "notes")
  if (!existsSync(dataNotesPath)) {
    return null
  }

  for (const entry of readdirSync(dataNotesPath, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue
    }

    const sidecarPath = path.join(dataNotesPath, entry.name)
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
    const dataNotesPath = path.join(rootPath, ".data", "notes")
    const available = existsSync(dataNotesPath)
      ? readdirSync(dataNotesPath)
        .filter((name) => name.endsWith(".json"))
        .map((name) => {
          const sidecarPath = path.join(dataNotesPath, name)
          try {
            const sidecar = JSON.parse(readFileSync(sidecarPath, "utf8")) as { title?: string; relativePath?: string }
            return `${sidecar.title ?? "<untitled>"} -> ${sidecar.relativePath ?? name}`
          } catch {
            return `${name} -> <unreadable>`
          }
        })
      : ["<no .data/notes directory>"]
    throw new Error(`${context}: expected sidecar metadata for created note ${JSON.stringify(title)}. Available sidecars: ${available.join("; ")}`)
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

function expectNoteFileContains(notePath: string, expected: string, context: string): void {
  const body = readFileSync(notePath, "utf8")
  if (!body.includes(expected)) {
    throw new Error(`${context}: expected actual note file ${notePath} to include ${JSON.stringify(expected)}. File contents:\n${body}`)
  }
}

function expectNoteFileExcludes(notePath: string, unexpected: string, context: string): void {
  const body = readFileSync(notePath, "utf8")
  if (body.includes(unexpected)) {
    throw new Error(`${context}: expected actual note file ${notePath} to exclude ${JSON.stringify(unexpected)} before manual save. File contents:\n${body}`)
  }
}

function expectNoteFileContainsWithin(notePath: string, expected: string, context: string, timeoutMs: number): void {
  const deadline = Date.now() + timeoutMs
  let body = ""
  while (Date.now() <= deadline) {
    body = readFileSync(notePath, "utf8")
    if (body.includes(expected)) {
      return
    }
    waitWithoutSmokeDeadline(25)
  }
  throw new Error(`${context}: expected actual note file ${notePath} to include ${JSON.stringify(expected)} within ${timeoutMs}ms, before autosave can mask manual save. File contents:\n${body}`)
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
  const result = run("tmux", ["send-keys", "-l", "-t", sessionName, "--", text])
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

function resizeSession(sessionName: string, width: number, height: number, context: string): void {
  assertWithinSmokeDeadline(context)
  const result = run("tmux", ["resize-window", "-t", sessionName, "-x", String(width), "-y", String(height)])
  if (result.status !== 0) {
    throw new Error(`${context}: failed to resize tmux TUI pane: ${result.stderr || result.stdout}`)
  }
  wait(500, context)
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

  const sidecarPath = path.join(rootPath, ".data", "notes", `${summary.key}.json`)
  const sidecar = JSON.parse(readFileSync(sidecarPath, "utf8")) as { relativePath: string }
  sidecar.relativePath = nextRelativePath
  writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2) + "\n", "utf8")

  return {
    ...summary,
    notePath: nextNotePath,
    relativePath: nextRelativePath,
  }
}

ensureCommandAvailable("tmux", "Install tmux or run the non-interactive smoke with `bun run smoke:opentui`.")

const rootPath = mkdtempSync(path.join(tmpdir(), "bluenote-opentui-interactive-"))
const sessionName = `bluenote-opentui-${process.pid}`
let cleanedUp = false

interface TrackedSmokeResource {
  rootPath: string
  sessionName: string
  panePid: number | null
}

const trackedSmokeResources = new Set<TrackedSmokeResource>()
const mainSmokeResource: TrackedSmokeResource = { rootPath, sessionName, panePid: null }
trackedSmokeResources.add(mainSmokeResource)

function tmuxSessionExists(targetSessionName: string): boolean {
  const result = run("tmux", ["has-session", "-t", targetSessionName], { timeout: 2_000 })
  return result.status === 0
}

function expectTmuxSessionExited(targetSessionName: string, context: string, timeoutMs = 5_000): void {
  const deadline = Date.now() + timeoutMs
  while (Date.now() <= deadline) {
    assertWithinSmokeDeadline(context)
    if (!tmuxSessionExists(targetSessionName)) {
      return
    }
    wait(100, context)
  }
  throw new Error(`${context}: expected tmux session ${targetSessionName} to exit within ${timeoutMs}ms`)
}

function assertPostAutosaveQuitRoute(route: "q" | "C-c"): void {
  const routeRootPath = mkdtempSync(path.join(tmpdir(), `bluenote-opentui-${route}-route-`))
  const routeSessionName = `bluenote-opentui-${route}-route-${process.pid}`
  const routeSmokeResource: TrackedSmokeResource = { rootPath: routeRootPath, sessionName: routeSessionName, panePid: null }
  trackedSmokeResources.add(routeSmokeResource)

  try {
    const initResult = run("bun", ["run", "./bin/bn.ts", "init"], { env: { BLUENOTE_ROOT: routeRootPath } })
    if (initResult.status !== 0) {
      throw new Error(`Failed to initialize ${route} route smoke root: ${initResult.stderr || initResult.stdout}`)
    }
    const title = `Post Autosave ${route} Route Fixture ${process.pid}`
    const summary = createSmokeNote(routeRootPath, title, `Post-autosave ${route} route body.`)
    const rebuildResult = run("bun", ["run", "./bin/bn.ts", "rebuild"], { env: { BLUENOTE_ROOT: routeRootPath } })
    if (rebuildResult.status !== 0) {
      throw new Error(`Failed to rebuild ${route} route smoke root: ${rebuildResult.stderr || rebuildResult.stdout}`)
    }

    const launchResult = run("tmux", [
      "new-session",
      "-d",
      "-s",
      routeSessionName,
      "-x",
      "100",
      "-y",
      "30",
      `cd ${JSON.stringify(process.cwd())} && exec env BLUENOTE_ROOT=${JSON.stringify(routeRootPath)} TERM=xterm-256color bun run ./bin/bn.ts tui`,
    ])
    if (launchResult.status !== 0) {
      throw new Error(`Failed to launch ${route} route tmux TUI smoke session: ${launchResult.stderr || launchResult.stdout}`)
    }

    const panePidResult = run("tmux", ["display-message", "-p", "-t", routeSessionName, "#{pane_pid}"])
    if (panePidResult.status === 0) {
      const parsedPanePid = Number.parseInt(panePidResult.stdout.trim(), 10)
      routeSmokeResource.panePid = Number.isFinite(parsedPanePid) ? parsedPanePid : null
    }

    capturePaneUntil(routeSessionName, `${route} route manager launch`, "[Enter] Open", 30)
    sendKeys(routeSessionName, "C-p")
    const searchPromptPane = capturePaneUntil(routeSessionName, `${route} route search prompt`, "Search Everything", 20)
    expectPaneContains(searchPromptPane, "Search Everything", `${route} route search prompt`)
    sendText(routeSessionName, title)
    const searchResultPane = capturePaneUntil(routeSessionName, `${route} route search result`, title, 30)
    expectPaneContains(searchResultPane, title, `${route} route search result`)
    sendKeys(routeSessionName, "Enter")
    const editorPane = capturePaneUntil(routeSessionName, `${route} route editor open`, title, 30)
    expectPaneContains(editorPane, title, `${route} route editor open`)

    const autosaveToken = `post-autosave-${route}-route-${process.pid}`
    sendText(routeSessionName, autosaveToken)
    const typedPane = capturePaneUntil(routeSessionName, `${route} route post-autosave typing`, autosaveToken, 30)
    expectPaneContains(typedPane, autosaveToken, `${route} route post-autosave typing`)
    wait(1_250, `${route} route autosave wait`)
    const postAutosavePane = capturePane(routeSessionName, `${route} route autosave status`)
    expectPaneExcludes(postAutosavePane, "Autosave failed", `${route} route autosave status`)
    expectNoteFileContains(summary.notePath, autosaveToken, `${route} route autosave filesystem`)

    sendKeys(routeSessionName, "Escape")
    const managerPane = capturePaneUntil(routeSessionName, `${route} route return to manager after autosave`, "[Enter] Open", 20)
    expectLatestScreen(managerPane, "[Enter] Open", autosaveToken, `${route} route return to manager latest screen`)
    sendKeys(routeSessionName, route)
    expectTmuxSessionExited(routeSessionName, `${route} route exits from manager after autosave`)
    routeSmokeResource.panePid = null
    expectNoLiveBlueNoteTuiProcessesForRoot(routeRootPath, `${route} route process lifecycle after quit`)
  } finally {
    cleanupTrackedSmokeResource(routeSmokeResource)
    trackedSmokeResources.delete(routeSmokeResource)
  }
}

function killTrackedTuiProcess(resource: TrackedSmokeResource): void {
  if (resource.panePid === null) {
    return
  }

  for (const signal of ["SIGTERM", "SIGKILL"] as const) {
    try {
      process.kill(-resource.panePid, signal)
    } catch {
      // The pane process may not be its own process group leader in all tmux builds.
    }
    try {
      process.kill(resource.panePid, signal)
    } catch {
      // Already exited.
    }
    if (signal === "SIGTERM") {
      waitWithoutSmokeDeadline(100)
    }
  }
}

function cleanupTrackedSmokeResource(resource: TrackedSmokeResource): void {
  killTrackedTuiProcess(resource)
  run("tmux", ["kill-session", "-t", resource.sessionName], { timeout: 2_000 })
  killTrackedTuiProcess(resource)
  rmSync(resource.rootPath, { recursive: true, force: true })
}

function cleanup(): void {
  if (cleanedUp) {
    return
  }
  cleanedUp = true
  for (const resource of [...trackedSmokeResources].reverse()) {
    cleanupTrackedSmokeResource(resource)
    trackedSmokeResources.delete(resource)
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    cleanup()
    process.exit(signal === "SIGINT" ? 130 : 143)
  })
}

try {
  assertPostAutosaveQuitRoute("q")
  assertPostAutosaveQuitRoute("C-c")

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
  const rootEditorSummary = createSmokeNote(
    rootPath,
    "Root Editor Fixture",
    "Root smoke note body.\nFindable alpha token for editor find smoke.",
    "notes",
  )
  createSmokeNote(
    rootPath,
    "Switch Target Fixture",
    "Switch target body.\nThis note proves manager navigation remains routable after editor autosave.",
    "notes",
  )
  const longSearchSummaries = Array.from({ length: 20 }, (_, index) => createSmokeNote(
    rootPath,
    `Long Scroll Fixture ${index.toString().padStart(2, "0")}`,
    `longscrolltoken body ${index}`,
    "notes/search-scroll",
  ))

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
    mainSmokeResource.panePid = Number.isFinite(parsedPanePid) ? parsedPanePid : null
  }

  wait(1_500, "launch")

  const managerPane = capturePaneUntil(sessionName, "manager launch", "[Enter] Open", 30)
  if (managerPane.includes("BlueNote TUI workspace bootstrap ready")) {
    throw new Error("Interactive TUI printed the non-interactive bootstrap message instead of owning the terminal")
  }
  expectPaneContains(managerPane, "BlueNote", "manager launch")
  expectPaneContains(managerPane, "[Enter] Open", "manager launch")
  expectPaneContains(managerPane, "items · Ready", "manager launch")
  expectPaneContains(managerPane, "notes/", "manager launch")
  expectPaneContains(managerPane, "projects", "manager launch")
  expectPaneContains(managerPane, "Root Editor", "manager launch")

  sendKeys(sessionName, "p")
  const previewOffPane = capturePaneUntil(sessionName, "manager preview toggle off", "[Enter] Open", 20)
  expectPaneContains(previewOffPane, "[Enter] Open", "manager preview toggle off")
  expectPaneContains(previewOffPane, "projects", "manager preview toggle off")

  sendKeys(sessionName, "p")
  const previewOnPane = capturePaneUntil(sessionName, "manager preview toggle on", "[Enter] Open", 20)
  expectPaneExcludes(previewOnPane, "Preview hidden (manual)", "manager preview toggle on")

  resizeSession(sessionName, 60, 24, "manager narrow responsive resize")
  const narrowManagerPane = capturePaneUntil(sessionName, "manager narrow responsive resize", "[Enter] Open", 20)
  expectPaneContains(narrowManagerPane, "projects", "manager narrow responsive resize")
  expectPaneContains(narrowManagerPane, "Root Editor", "manager narrow responsive resize")
  expectPaneContains(narrowManagerPane, "Preview hidden for narrow terminal · p show", "manager narrow responsive resize")
  resizeSession(sessionName, 100, 30, "manager wide responsive restore")
  const wideManagerPane = capturePaneUntil(sessionName, "manager wide responsive restore", "[Enter] Open", 20)
  expectPaneExcludes(wideManagerPane, "Preview hidden (narrow width)", "manager wide responsive restore")

  sendKeys(sessionName, "p")
  const manualHiddenWidePane = capturePaneUntil(sessionName, "manager manual preview hidden wide", "[Enter] Open", 20)
  expectPaneContains(manualHiddenWidePane, "[Enter] Open", "manager manual preview hidden wide")
  resizeSession(sessionName, 60, 24, "manager manual preview hidden narrow")
  const manualHiddenNarrowPane = capturePaneUntil(sessionName, "manager manual preview hidden narrow", "[Enter] Open", 20)
  expectPaneContains(manualHiddenNarrowPane, "projects", "manager manual preview hidden narrow")

  resizeSession(sessionName, 100, 30, "manager manual preview hidden restore")
  const manualHiddenRestoredPane = capturePaneUntil(sessionName, "manager manual preview hidden restore", "[Enter] Open", 20)
  expectPaneContains(manualHiddenRestoredPane, "[Enter] Open", "manager manual preview hidden restore")
  sendKeys(sessionName, "p")
  capturePaneUntil(sessionName, "manager preview re-enabled", "[Enter] Open", 20)

  sendKeys(sessionName, "s")
  wait(500)
  const searchPromptFromSPane = capturePane(sessionName, "search prompt from s")
  expectPaneContains(searchPromptFromSPane, "Search Everything", "search prompt from s")
  sendKeys(sessionName, "Escape")
  wait(500)
  const returnedFromSManagerPane = capturePaneUntil(sessionName, "return from s search", "[Enter] Open", 20)
  expectLatestScreen(returnedFromSManagerPane, "[Enter] Open", "Search Everything", "return from s search")

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
  expectPaneContains(searchQueryPane, "[Esc] Manager", "search query")

  sendKeys(sessionName, "M-p")
  const searchPreviewOffPane = capturePaneUntil(sessionName, "search preview Alt+P off", "Preview hidden", 20)
  expectPaneContains(searchPreviewOffPane, "Alt+P preview show", "search preview Alt+P off")
  expectPaneExcludes(searchPreviewOffPane, "Preview ·", "search preview Alt+P off")
  sendKeys(sessionName, "M-p")
  const searchPreviewOnPane = capturePaneUntil(sessionName, "search preview Alt+P on", "Preview ·", 20)
  expectPaneContains(searchPreviewOnPane, "[Esc] Manager", "search preview Alt+P on")

  resizeSession(sessionName, 100, 15, "search short responsive resize")
  const shortSearchPane = capturePaneUntil(sessionName, "search short responsive resize", "Preview hidden for short terminal", 20)
  expectPaneContains(shortSearchPane, "Search Everything", "search short responsive resize")
  expectPaneExcludes(shortSearchPane, "Preview ·", "search short responsive resize")
  resizeSession(sessionName, 100, 30, "search tall responsive restore")
  const restoredSearchPane = capturePaneUntil(sessionName, "search tall responsive restore", "Preview ·", 20)
  expectPaneExcludes(restoredSearchPane, "Preview hidden for short terminal", "search tall responsive restore")

  sendKeys(sessionName, "M-p")
  const manualHiddenSearchPane = capturePaneUntil(sessionName, "search manual hidden before resize", "Preview hidden", 20)
  expectPaneContains(manualHiddenSearchPane, "Alt+P preview show", "search manual hidden before resize")
  resizeSession(sessionName, 100, 15, "search manual hidden short resize")
  capturePaneUntil(sessionName, "search manual hidden short resize", "Preview hidden", 20)
  resizeSession(sessionName, 100, 30, "search manual hidden tall restore")
  const manualHiddenRestoredSearchPane = capturePaneUntil(sessionName, "search manual hidden tall restore", "Preview hidden", 20)
  expectPaneContains(manualHiddenRestoredSearchPane, "Alt+P preview show", "search manual hidden tall restore")
  sendKeys(sessionName, "M-p")
  capturePaneUntil(sessionName, "search preview restored before exit", "Preview ·", 20)

  sendKeys(sessionName, "Escape")
  const returnedManagerPane = capturePaneUntil(sessionName, "return from search", "[Enter] Open", 20)
  expectPaneContains(returnedManagerPane, "[Enter] Open", "return from search")
  expectPaneExcludes(returnedManagerPane, "BlueNote Manager", "return from search")
  expectLatestScreen(returnedManagerPane, "[Enter] Open", "Search Everything", "return from search")

  sendKeys(sessionName, "C-p")
  wait(500)
  sendText(sessionName, "longscrolltoken")
  const longSearchPane = capturePaneUntil(sessionName, "long search results initial", "Results · 20", 30)
  expectPaneContains(longSearchPane, "Long Scroll Fixture", "long search results initial")
  for (let index = 0; index < 15; index += 1) {
    sendKeys(sessionName, "Down")
    wait(80)
  }
  const longSearchScrolledPane = capturePaneUntil(sessionName, "long search results scrolled", "more above", 30)
  expectPaneContains(longSearchScrolledPane, "more below", "long search results scrolled")
  expectPaneContains(longSearchScrolledPane, "Long Scroll Fixture 15", "long search results scrolled")
  sendKeys(sessionName, "Enter")
  const longSearchEditorPane = capturePaneUntil(sessionName, "long search selected result opened", "Long Scroll Fixture 15", 30)
  expectPaneContains(longSearchEditorPane, "Long Scroll Fixture 15", "long search selected result opened")
  expectNoteFileContains(longSearchSummaries[15]!.notePath, "longscrolltoken body 15", "long search selected result filesystem")
  sendKeys(sessionName, "Escape")
  wait(500, "return from long search selected editor settle")
  let returnedFromLongSearchEditorPane = capturePane(sessionName, "return from long search selected editor")
  if (!returnedFromLongSearchEditorPane.includes("[Enter] Open")) {
    sendKeys(sessionName, "Escape")
    returnedFromLongSearchEditorPane = capturePaneUntil(sessionName, "return from long search selected editor retry", "[Enter] Open", 20)
  }
  expectPaneContains(returnedFromLongSearchEditorPane, "[Enter] Open", "return from long search selected editor")

  // Empty default folders are now visible at the manager root, so select the
  // projects folder by visible name instead of relying on root row order.
  sendKeys(sessionName, "/")
  sendText(sessionName, "projects")
  sendKeys(sessionName, "Enter")
  wait(500)
  const folderPane = capturePane(sessionName, "manager folder enter")
  expectPaneContains(folderPane, "[Enter] Open", "manager folder enter")
  expectPaneExcludes(folderPane, "BlueNote Manager", "manager folder enter")
  expectPaneContains(folderPane, "notes/projects", "manager folder enter")
  expectPaneContains(folderPane, "Folder Navigation Fixture", "manager folder enter")

  sendKeys(sessionName, "Left")
  wait(500)
  const rootPane = capturePane(sessionName, "manager folder return")
  expectPaneContains(rootPane, "[Enter] Open", "manager folder return")
  expectPaneExcludes(rootPane, "BlueNote Manager", "manager folder return")
  expectPaneContains(rootPane, "notes/", "manager folder return")
  expectPaneContains(rootPane, "Root Editor", "manager folder return")

  sendKeys(sessionName, "/")
  sendText(sessionName, "root")
  sendKeys(sessionName, "Enter")
  const editorPane = capturePaneUntil(sessionName, "editor open", "Root Editor", 30)
  expectPaneContains(editorPane, "Root Editor", "editor open")
  resizeSession(sessionName, 54, 15, "editor responsive resize")
  const resizedEditorPane = capturePaneUntil(sessionName, "editor responsive resize", "[Ctrl+S] Save", 20)
  expectPaneContains(resizedEditorPane, "Root Editor", "editor responsive resize")
  expectPaneContains(resizedEditorPane, "[Ctrl+S] Save", "editor responsive resize")
  expectPaneExcludes(resizedEditorPane, "[Ctrl+Shift+V] Paste", "editor responsive resize")
  expectPaneExcludes(resizedEditorPane, "/copy-all", "editor responsive resize")
  expectPaneExcludes(resizedEditorPane, "/replace-all", "editor responsive resize")
  expectPaneExcludes(resizedEditorPane, "[Alt+Z] Wrap", "editor responsive resize")
  resizeSession(sessionName, 120, 30, "editor restore after responsive resize")
  wait(500, "editor focus settle")

  sendKeys(sessionName, "M-z")
  const editorWrapNonePane = capturePaneUntil(sessionName, "editor Alt+Z wrap toggle off", "Wrap off", 20)
  expectPaneContains(editorWrapNonePane, "Wrap off", "editor Alt+Z wrap toggle off")
  const longUnwrappedSmokeToken = `long-line-overflow-${"0123456789".repeat(12)}`
  sendText(sessionName, longUnwrappedSmokeToken)
  const longUnwrappedPane = capturePaneUntil(sessionName, "editor long unwrapped horizontal overflow", "‹", 30)
  expectPaneContains(longUnwrappedPane, "‹", "editor long unwrapped horizontal overflow")
  sendKeys(sessionName, "Left", "Left", "Left", "Right")
  const longUnwrappedNavigationPane = capturePaneUntil(sessionName, "editor long unwrapped horizontal navigation", "‹", 20)
  expectPaneContains(longUnwrappedNavigationPane, "‹", "editor long unwrapped horizontal navigation")
  sendKeys(sessionName, "End")
  sendKeys(sessionName, "M-z")
  const editorWrapWordPane = capturePaneUntil(sessionName, "editor Alt+Z wrap toggle on", "Wrap on", 20)
  expectPaneContains(editorWrapWordPane, "Wrap on", "editor Alt+Z wrap toggle on")

  const typedEditorText = "editor-input-regression-token"
  sendText(sessionName, typedEditorText)
  const editorTypedPane = capturePaneUntil(sessionName, "editor body typing", typedEditorText, 30)
  expectPaneContains(editorTypedPane, "Root Editor", "editor body typing")
  expectPaneContains(editorTypedPane, typedEditorText, "editor body typing")

  const cursorMarker = "-cursor-probe-"
  const cursorEditedPrefix = `${typedEditorText.slice(0, -1)}${cursorMarker}`
  sendKeys(sessionName, "Left")
  wait(250, "editor cursor left")
  sendText(sessionName, cursorMarker)
  const editorCursorPane = capturePaneUntil(sessionName, "editor cursor insert before final character", `${cursorMarker}${typedEditorText.slice(-1)}`, 30)
  expectPaneContains(editorCursorPane, `${cursorEditedPrefix.slice(0, -6)}`, "editor cursor insert before final character")
  expectPaneContains(editorCursorPane, "probe-", "editor cursor insert before final character")
  expectPaneContains(editorCursorPane, `${cursorMarker}${typedEditorText.slice(-1)}`, "editor cursor insert before final character")
  expectPaneExcludes(editorCursorPane, "▌", "editor cursor insert before final character")

  const multilineText = "newline-body-probe"
  sendKeys(sessionName, "Enter")
  wait(250, "editor newline")
  sendText(sessionName, multilineText)
  const editorNewlinePane = capturePaneUntil(sessionName, "editor newline insertion", multilineText, 30)
  expectPaneContains(editorNewlinePane, "editor-input-regression-toke-cursor-", "editor newline insertion")
  expectPaneContains(editorNewlinePane, "probe-", "editor newline insertion")
  expectPaneContains(editorNewlinePane, `${multilineText}${typedEditorText.slice(-1)}`, "editor newline insertion")
  expectPaneExcludes(editorNewlinePane, "▌", "editor newline insertion")

  const pasteFallbackText = "paste-fallback-probe"
  sendText(sessionName, pasteFallbackText)
  const editorPastePane = capturePaneUntil(sessionName, "editor paste or literal multi-character input", pasteFallbackText, 30)
  expectPaneContains(editorPastePane, `${multilineText}${pasteFallbackText}`, "editor paste or literal multi-character input")
  expectPaneExcludes(editorPastePane, "[Ctrl+Shift+V] Paste", "editor rerender calm chrome")

  const autosavePersistenceToken = `autosave-persist-${process.pid}`
  sendText(sessionName, autosavePersistenceToken)
  const editorAutosavePane = capturePaneUntil(sessionName, "editor autosave persistence typing", autosavePersistenceToken, 30)
  expectPaneContains(editorAutosavePane, `${multilineText}${pasteFallbackText}${autosavePersistenceToken}`, "editor autosave persistence typing")
  wait(1_250, "editor autosave persistence wait")
  const postAutosavePane = capturePane(sessionName, "editor autosave persistence status")
  expectPaneExcludes(postAutosavePane, "Autosave failed", "editor autosave persistence status")
  expectNoteFileContains(rootEditorSummary.notePath, autosavePersistenceToken, "editor autosave persistence filesystem")

  sendKeys(sessionName, "Escape")
  const managerAfterAutosavePane = capturePaneUntil(sessionName, "editor autosave return to manager", "[Enter] Open", 20)
  expectPaneContains(managerAfterAutosavePane, "Root Editor", "editor autosave return to manager")
  expectLatestScreen(managerAfterAutosavePane, "[Enter] Open", autosavePersistenceToken, "editor autosave return to manager latest screen")

  sendKeys(sessionName, "Escape")
  wait(250, "manager clear root filter before switch target selection")
  sendKeys(sessionName, "/")
  sendText(sessionName, "switch")
  sendKeys(sessionName, "Enter")
  const switchTargetEnterPane = capturePaneUntil(sessionName, "manager opens switch target with Enter after autosave", "Switch target body", 30)
  expectPaneContains(switchTargetEnterPane, "Switch target body", "manager opens switch target with Enter after autosave")

  sendKeys(sessionName, "Escape")
  const managerAfterSwitchEnterPane = capturePaneUntil(sessionName, "switch target return to manager after Enter", "[Enter] Open", 20)
  expectPaneContains(managerAfterSwitchEnterPane, "Switch Target", "switch target return to manager after Enter")
  sendKeys(sessionName, "Enter")
  const switchTargetRightSetupPane = capturePaneUntil(sessionName, "manager reopens switch target with Enter before Right attempt", "Switch target body", 30)
  sendKeys(sessionName, "Escape")
  wait(250, "switch target return before right settle")
  let switchTargetReturnBeforeRightPane = capturePane(sessionName, "switch target return to manager before Right attempt")
  if (!switchTargetReturnBeforeRightPane.includes("[Enter] Open") || switchTargetReturnBeforeRightPane.lastIndexOf("[Enter] Open") <= switchTargetReturnBeforeRightPane.lastIndexOf("Switch target body")) {
    sendKeys(sessionName, "C-[")
    switchTargetReturnBeforeRightPane = capturePaneUntil(sessionName, "switch target return to manager before Right attempt retry", "[Enter] Open", 20)
  }
  expectLatestScreen(switchTargetReturnBeforeRightPane, "[Enter] Open", "Switch target body", "switch target return to manager before Right attempt")
  sendKeys(sessionName, "Right")
  const switchTargetRightPane = capturePaneUntil(sessionName, "manager opens switch target with Arrow Right after autosave", "Switch target body", 30)
  expectPaneContains(switchTargetRightPane, "Switch target body", "manager opens switch target with Arrow Right after autosave")

  sendKeys(sessionName, "Escape")
  wait(250, "switch target return for original editor settle")
  let switchTargetReturnForOriginalPane = capturePane(sessionName, "switch target return to manager for original editor")
  if (!switchTargetReturnForOriginalPane.includes("[Enter] Open") || switchTargetReturnForOriginalPane.lastIndexOf("[Enter] Open") <= switchTargetReturnForOriginalPane.lastIndexOf("Switch target body")) {
    sendKeys(sessionName, "C-[")
    switchTargetReturnForOriginalPane = capturePaneUntil(sessionName, "switch target return to manager for original editor retry", "[Enter] Open", 20)
  }
  expectLatestScreen(switchTargetReturnForOriginalPane, "[Enter] Open", "Switch target body", "switch target return to manager for original editor")
  sendKeys(sessionName, "Escape")
  wait(250, "manager clear switch filter before original editor selection")
  sendKeys(sessionName, "/")
  sendText(sessionName, "root")
  sendKeys(sessionName, "Enter")
  const editorReopenedAfterSwitchPane = capturePaneUntil(sessionName, "manager reopens original editor after switch target", autosavePersistenceToken, 30)
  expectPaneContains(editorReopenedAfterSwitchPane, autosavePersistenceToken, "manager reopens original editor after switch target")

  sendKeys(sessionName, "C-p")
  const dirtySearchPane = capturePaneUntil(sessionName, "dirty editor search open", "Search Everything", 20)
  expectPaneContains(dirtySearchPane, "Search Everything", "dirty editor search open")
  sendKeys(sessionName, "Escape")
  const postAutosaveCursorText = `${multilineText}${pasteFallbackText}${autosavePersistenceToken}${typedEditorText.slice(-1)}`
  const dirtySearchCancelPane = capturePaneUntil(sessionName, "editor search cancel restores body focus", postAutosaveCursorText, 30)
  expectPaneContains(dirtySearchCancelPane, postAutosaveCursorText, "editor search cancel restores body focus")
  expectPaneExcludes(dirtySearchCancelPane, "Search Everything", "editor search cancel restores body focus")

  const manualSavePersistenceToken = `manual-save-persist-${process.pid}`
  sendText(sessionName, manualSavePersistenceToken)
  expectNoteFileExcludes(rootEditorSummary.notePath, manualSavePersistenceToken, "editor manual save pre-ctrl-s filesystem")
  sendKeys(sessionName, "C-s")
  expectNoteFileContainsWithin(rootEditorSummary.notePath, manualSavePersistenceToken, "editor manual save persistence filesystem", 700)
  const editorSavedPane = capturePaneUntil(sessionName, "editor ctrl-s save", "Saved", 30)
  const postManualSaveCursorText = `${multilineText}${pasteFallbackText}${autosavePersistenceToken}${typedEditorText.slice(-1)}${manualSavePersistenceToken}`
  expectPaneContains(editorSavedPane, postManualSaveCursorText, "editor ctrl-s save")
  expectNoteFileContains(rootEditorSummary.notePath, manualSavePersistenceToken, "editor manual save persistence filesystem")

  sendKeys(sessionName, "C-f")
  wait(500)
  const editorAfterFindShortcutPane = capturePane(sessionName, "editor ctrl-f shortcut")
  expectPaneContains(editorAfterFindShortcutPane, "Root Editor", "editor ctrl-f shortcut")
  expectPaneContains(editorAfterFindShortcutPane, "Find in note", "editor ctrl-f shortcut")

  sendKeys(sessionName, "Escape")
  wait(500)
  const editorBodyReturnPane = capturePane(sessionName, "editor find return to body")
  expectPaneContains(editorBodyReturnPane, "editor-input-regression-toke-cursor-", "editor find return to body")
  expectPaneContains(editorBodyReturnPane, "probe-", "editor find return to body")
  expectPaneContains(editorBodyReturnPane, postManualSaveCursorText, "editor find return to body")
  expectPaneExcludes(editorBodyReturnPane, "Find in note", "editor find return to body")

  sendKeys(sessionName, "Escape")
  wait(250, "editor return to manager settle")
  let managerReturnPane = capturePane(sessionName, "editor return to manager")
  if (!managerReturnPane.includes("[Enter] Open") || managerReturnPane.lastIndexOf("[Enter] Open") <= managerReturnPane.lastIndexOf(postManualSaveCursorText)) {
    sendKeys(sessionName, "C-[")
    managerReturnPane = capturePaneUntil(sessionName, "editor return to manager retry", "[Enter] Open", 20)
  }
  expectPaneContains(managerReturnPane, "Root Editor", "editor return to manager")
  expectLatestScreen(managerReturnPane, "[Enter] Open", postManualSaveCursorText, "editor return to manager latest screen")

  const liveManagerTitle = `Live Smoke Manager Note ${process.pid}`
  sendKeys(sessionName, "n")
  const createPromptPane = capturePaneUntil(sessionName, "manager create prompt", "New note", 20)
  expectPaneContains(createPromptPane, "Note title", "manager create prompt")
  sendText(sessionName, liveManagerTitle)
  sendKeys(sessionName, "C-m")
  const createdEditorPane = capturePaneUntil(sessionName, "manager create opens editor", liveManagerTitle, 30)
  expectPaneContains(createdEditorPane, liveManagerTitle, "manager create opens editor")
  const createdArtifacts = expectNoteArtifactsExist(rootPath, liveManagerTitle, "manager create filesystem")

  const createdNoteParent = path.dirname(createdArtifacts.relativePath).replaceAll("\\", "/")

  sendKeys(sessionName, "Escape")
  wait(500)
  const managerAfterCreatePane = capturePaneUntil(sessionName, "manager shows created note", `Currently open: ${liveManagerTitle}`, 30)
  expectPaneContains(managerAfterCreatePane, `Currently open: ${liveManagerTitle}`, "manager shows created note")

  const createdParentFilter = path.basename(createdNoteParent)
  sendKeys(sessionName, "/")
  sendText(sessionName, createdParentFilter)
  sendKeys(sessionName, "C-m")
  const createdFolderPane = capturePaneUntil(sessionName, "manager enters created note folder", createdNoteParent, 20)
  expectPaneContains(createdFolderPane, createdArtifacts.key, "manager enters created note folder")

  sendKeys(sessionName, "d")
  const deletePromptPane = capturePaneUntil(sessionName, "manager delete confirmation", "Delete note?", 20)
  expectPaneContains(deletePromptPane, createdArtifacts.key, "manager delete confirmation")
  expectPaneContains(deletePromptPane, "[y] Delete", "manager delete confirmation")
  expectPaneContains(deletePromptPane, "This cannot be undone.", "manager delete confirmation")

  sendKeys(sessionName, "Escape")
  wait(500)
  const cancelledDeletePane = capturePane(sessionName, "manager delete cancellation")
  expectPaneContains(cancelledDeletePane, createdArtifacts.key, "manager delete cancellation")
  expectPaneExcludes(cancelledDeletePane, "Delete note?", "manager delete cancellation")
  expectNoteArtifactsExist(rootPath, liveManagerTitle, "manager delete cancellation filesystem")

  sendKeys(sessionName, "d")
  const secondDeletePromptPane = capturePaneUntil(sessionName, "manager delete confirmation retry", "Delete note?", 20)
  expectPaneContains(secondDeletePromptPane, createdArtifacts.key, "manager delete confirmation retry")
  sendKeys(sessionName, "y")
  const deletedManagerPane = capturePaneUntil(sessionName, "manager delete removes note", "No notes or folders", 30)
  expectPaneExcludes(deletedManagerPane, createdArtifacts.key, "manager delete removes note")
  expectNoteArtifactsDeleted(createdArtifacts, "manager delete filesystem")

  sendKeys(sessionName, "q")
  expectTmuxSessionExited(sessionName, "main smoke exits after final q")
  mainSmokeResource.panePid = null
  expectNoLiveBlueNoteTuiProcessesForRoot(rootPath, "main smoke process lifecycle after final q")

  console.log("Interactive OpenTUI smoke check passed.")
} finally {
  cleanup()
}
