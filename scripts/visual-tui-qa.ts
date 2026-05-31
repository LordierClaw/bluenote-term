import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"

interface RunResult {
  status: number | null
  stdout: string
  stderr: string
}

interface VisualCase {
  id: string
  title: string
  geometry: string
  zoom: string
  requirementIds: number[]
  actions: string[]
  expected: string[]
  forbidden?: string[]
  evidence?: string[]
  ratingPrompt: string
}

export interface EvidenceRowInput {
  caseId: string
  title: string
  requirementIds: number[]
  geometry: string
  zoom: string
  actions: string[]
  expected: string[]
  forbidden?: string[]
  panePath: string
  screenshotPath: string
  screenshotLogPath: string
  stateReadbackPaths?: string[]
  status: string
  notes: string
}

export interface ScreenshotBridgeArguments {
  window_id?: number
  raise_window?: boolean
  full_screen?: boolean
}

const repoRoot = process.cwd()
const screenshotBridgePath = process.env.CUL_SCREENSHOT_BRIDGE ?? path.join(tmpdir(), "bluenote-focused-mcp-screenshot.py")

const baselineVisualCases: VisualCase[] = [
  {
    id: "manager-100x30",
    title: "Manager medium",
    geometry: "100x30",
    zoom: "1.0",
    requirementIds: [1, 7, 14],
    actions: [],
    expected: ["BlueNote", "Workspace"],
    ratingPrompt: "Rate manager readability, terminal-default background, title focus, dim secondary text, and absence of a third note-path column.",
  },
  {
    id: "editor-100x30",
    title: "Editor medium",
    geometry: "100x30",
    zoom: "1.0",
    requirementIds: [5, 14],
    actions: ["C-p", "text:wrap", "Enter"],
    expected: ["Wrap"],
    ratingPrompt: "Rate editor topbar, removed line/column row, body left edge, shortcut bar, and calm styling.",
  },
  {
    id: "search-100x30",
    title: "Search Everything medium",
    geometry: "100x30",
    zoom: "1.0",
    requirementIds: [9, 10, 11],
    actions: ["C-p", "text:alpha"],
    expected: ["Search Everything", "Results", "Alpha"],
    ratingPrompt: "Rate search input/results/preview readability and confirm no useless metadata row is visible.",
  },
  {
    id: "longline-100x30",
    title: "Long line unwrap medium",
    geometry: "100x30",
    zoom: "1.0",
    requirementIds: [2],
    actions: ["C-p", "text:long line", "Enter", "M-z"],
    expected: ["Wrap off"],
    ratingPrompt: "Rate long-line unwrap usability, continuation indicator, and whether hidden content is discoverable.",
  },
  {
    id: "manager-80x24",
    title: "Manager small",
    geometry: "80x24",
    zoom: "1.0",
    requirementIds: [1, 2, 7, 14],
    actions: [],
    expected: ["BlueNote"],
    ratingPrompt: "Rate small-terminal manager layout and whether primary actions remain visible.",
  },
  {
    id: "manager-120x40",
    title: "Manager large",
    geometry: "120x40",
    zoom: "1.0",
    requirementIds: [1, 2, 7, 14],
    actions: [],
    expected: ["BlueNote"],
    ratingPrompt: "Rate large-terminal spacing, alignment, and whether extra space is used calmly.",
  },
  {
    id: "manager-100x30-zoom150",
    title: "Manager zoom 1.5",
    geometry: "100x30",
    zoom: "1.5",
    requirementIds: [1, 2, 7, 14],
    actions: [],
    expected: ["BlueNote"],
    ratingPrompt: "Rate high-zoom readability and whether layout remains usable at larger font scale.",
  },
]

export const refinedVisualCases: VisualCase[] = [
  {
    id: "manager-long-row-truncation-100x30",
    title: "Manager long row truncation",
    geometry: "100x30",
    zoom: "1.0",
    requirementIds: [2],
    actions: ["C-p", "text:ultra-long"],
    expected: ["Search Everything", "ultra-long"],
    ratingPrompt: "Verify long filename/title/description text is clamped and does not bleed into the preview pane.",
  },
  {
    id: "manager-folder-preview-100x30",
    title: "Manager folder preview",
    geometry: "100x30",
    zoom: "1.0",
    requirementIds: [3],
    actions: ["C-p", "text:projects"],
    expected: ["projects", "client"],
    ratingPrompt: "Verify focused folder preview shows immediate items only and no folder metadata rows.",
  },
  {
    id: "manager-note-preview-100x30",
    title: "Manager note preview",
    geometry: "100x30",
    zoom: "1.0",
    requirementIds: [4],
    actions: ["C-p", "text:preview-note", "Enter"],
    expected: ["preview-note"],
    ratingPrompt: "Verify focused note preview shows title/body content without a redundant Preview section label or path/description metadata rows.",
  },
  {
    id: "manager-filter-name-only-100x30",
    title: "Manager filter name-only scope",
    geometry: "100x30",
    zoom: "1.0",
    requirementIds: [7, 8],
    actions: ["C-p", "text:name-only-target"],
    expected: ["Search Everything", "name-only-target"],
    ratingPrompt: "Verify manager shows / Filter and the filter matches visible item names only, not title/path/description-only text.",
  },
  {
    id: "search-folder-preview-100x30",
    title: "Search Everything folder preview",
    geometry: "100x30",
    zoom: "1.0",
    requirementIds: [9],
    actions: ["C-p", "text:client"],
    expected: ["Search Everything", "projects/client", "client-note"],
    ratingPrompt: "Verify folder result title is full path, match is highlighted, and preview content resembles manager item preview.",
  },
  {
    id: "search-file-title-preview-100x30",
    title: "Search Everything file/title preview",
    geometry: "100x30",
    zoom: "1.0",
    requirementIds: [10],
    actions: ["C-p", "text:titlematch"],
    expected: ["Search Everything", "TitleMatch", "titlematch-file"],
    ratingPrompt: "Verify file preview title combines note title and filename with highlighted title/filename matches.",
  },
  {
    id: "search-multi-content-results-100x30",
    title: "Search Everything repeated content results",
    geometry: "100x30",
    zoom: "1.0",
    requirementIds: [11],
    actions: ["C-p", "text:needle-repeat"],
    expected: ["Search Everything", "Results · 2", "Repeated Content Match Note", "Client Note", "needle-repeat one in this note"],
    ratingPrompt: "Verify repeated note content matches are shown as multiple result rows with centered/highlighted previews.",
  },
  {
    id: "search-stable-chrome-100x30",
    title: "Search Everything stable chrome",
    geometry: "100x30",
    zoom: "1.0",
    requirementIds: [7, 14],
    actions: ["C-p", "text:alpha"],
    expected: ["Search Everything", "Results", "Alpha", "Ctrl+P"],
    forbidden: ["Search · alpha", "Search · type to begin"],
    ratingPrompt: "Verify Search Everything has one stable input-panel title, no redundant standalone title/subtitle rows while typing, and visible footer hints.",
  },
  {
    id: "editor-separator-100x30",
    title: "Editor separator",
    geometry: "100x30",
    zoom: "1.0",
    requirementIds: [5],
    actions: ["C-p", "text:editor-body", "Enter"],
    expected: ["editor-body"],
    ratingPrompt: "Verify editor topbar/body/bottombar separation is visible and calm.",
  },
  {
    id: "editor-find-replace-highlight-100x30",
    title: "Editor find/replace highlight",
    geometry: "100x30",
    zoom: "1.0",
    requirementIds: [12],
    actions: ["C-p", "text:editor-body", "Enter", "C-f", "text:replace-target"],
    expected: ["Find", "replace-target", "1/2", "matches"],
    ratingPrompt: "Verify find-highlight state opens and the found result is highlighted/selected in the editor body; live QA covers Ctrl+R replace delivery.",
  },
  {
    id: "editor-find-bottom-bar",
    title: "Editor find keeps bottom bar",
    geometry: "100x30",
    zoom: "1.0",
    requirementIds: [12, 14],
    actions: ["C-p", "text:editor-body", "Enter", "C-f", "text:replace-target"],
    expected: ["Find", "replace-target", "matches", "Ctrl+S", "Ctrl+R"],
    ratingPrompt: "Verify the editor find sheet does not cover or blank the bottom shortcut/status chrome at 100x30.",
  },
  {
    id: "editor-replace-bottom-bar",
    title: "Editor replace keeps bottom bar",
    geometry: "100x30",
    zoom: "1.0",
    requirementIds: [12, 14],
    actions: ["C-p", "text:editor-body", "Enter", "C-r", "text:replace-target"],
    expected: ["Find and replace", "replace-target", "Ctrl+S", "Ctrl+F"],
    ratingPrompt: "Verify the editor replace sheet consumes only intended vertical space and leaves the bottom shortcut/status chrome readable.",
  },
  {
    id: "editor-clipboard-attempt-100x30",
    title: "Editor clipboard attempt",
    geometry: "100x30",
    zoom: "1.0",
    requirementIds: [6, 14],
    actions: ["C-p", "text:clipboard-note", "Enter", "C-S-c", "C-S-x", "C-S-v"],
    expected: ["clipboard-source"],
    ratingPrompt: "Attempt terminal-compatible Ctrl+Shift+C/X/V and record whether GNOME Terminal/OpenTUI delivers or consumes each binding.",
  },
  {
    id: "editor-undo-flow-100x30",
    title: "Editor undo flow",
    geometry: "100x30",
    zoom: "1.0",
    requirementIds: [13, 14],
    actions: ["C-p", "text:undo-note", "Enter", "text: added", "C-z", "C-z", "C-z", "C-z", "C-z", "C-z"],
    expected: ["undo-redo-start"],
    forbidden: ["added", "adde"],
    ratingPrompt: "Verify recent edit undo removes inserted text and shortcut labels match delivered terminal bindings.",
  },
  {
    id: "editor-redo-flow-100x30",
    title: "Editor redo flow",
    geometry: "100x30",
    zoom: "1.0",
    requirementIds: [13, 14],
    actions: ["C-p", "text:undo-note", "Enter", "text: added", "C-z", "C-z", "C-z", "C-z", "C-z", "C-z", "C-y", "C-y", "C-y", "C-y", "C-y", "C-y"],
    expected: ["undo-redo-start", "added"],
    ratingPrompt: "Verify redo restores the recently undone edit and shortcut labels match delivered terminal bindings.",
  },
]

const feedbackEvidence = ["pane capture", "screenshot or blocked diagnostic", "cleanup assertion"] as const

export const feedbackVisualCases: Array<VisualCase & { evidence: string[] }> = [
  {
    id: "editor-clipboard-feedback-disk-readback-100x30",
    title: "Editor clipboard feedback and disk readback",
    geometry: "100x30",
    zoom: "1.0",
    requirementIds: [1, 3],
    actions: ["C-p", "text:/copy-all", "Enter", "C-p", "text:/replace-all", "Enter", "C-s"],
    expected: ["clipboard-feedback-start"],
    evidence: [...feedbackEvidence, "disk readback"],
    ratingPrompt: "Verify Mode A clipboard UX: terminal-native visible copy/paste plus /copy-all and /replace-all, with disk/state readback confirming editor content is not corrupted.",
  },
  {
    id: "editor-ctrl-h-backspace-delivery-100x30",
    title: "Editor Ctrl+H delivery and Backspace non-regression",
    geometry: "100x30",
    zoom: "1.0",
    requirementIds: [2],
    actions: ["C-p", "text:ctrl-h-backspace", "Enter", "text:BACKSPACE-PROBE", "C-h", "C-r", "text:replace-target"],
    expected: ["BACKSPACE-PROB", "Find and replace", "replace-target"],
    forbidden: ["BACKSPACE-PROBE"],
    evidence: [...feedbackEvidence, "shortcut delivery", "disk readback"],
    ratingPrompt: "Record whether real Ctrl+H is delivered as Backspace or replace in this terminal, verify Backspace remains safe, and verify Ctrl+R replace remains available.",
  },
  {
    id: "editor-find-bottom-bar-80x24",
    title: "Editor find bottom bar small",
    geometry: "80x24",
    zoom: "1.0",
    requirementIds: [3],
    actions: ["C-p", "text:editor-body", "Enter", "C-f", "text:replace-target"],
    expected: ["Find", "replace-target", "Ctrl+S"],
    evidence: [...feedbackEvidence],
    ratingPrompt: "Verify the find bar does not cover the bottom shortcut/status chrome at 80x24.",
  },
  {
    id: "editor-replace-bottom-bar-120x40",
    title: "Editor replace bottom bar large",
    geometry: "120x40",
    zoom: "1.0",
    requirementIds: [2, 3],
    actions: ["C-p", "text:editor-body", "Enter", "C-r", "text:replace-target"],
    expected: ["Find and replace", "replace-target", "Ctrl+S", "Ctrl+F"],
    evidence: [...feedbackEvidence],
    ratingPrompt: "Verify replace mode leaves the large-size bottom shortcut/status chrome readable and aligned.",
  },
  {
    id: "manager-no-preview-label-100x30",
    title: "Manager layout without redundant Preview label",
    geometry: "100x30",
    zoom: "1.0",
    requirementIds: [4],
    actions: ["Down", "Enter", "/", "text:preview-note"],
    expected: ["preview-note", "note-preview-body"],
    forbidden: ["Preview ·", "Path:", "Description:"],
    evidence: [...feedbackEvidence],
    ratingPrompt: "Verify Manager layout 2 preview is content-first without a redundant Preview label or metadata clutter.",
  },
  {
    id: "manager-empty-folder-filter-100x30",
    title: "Manager empty folder and filter behavior",
    geometry: "100x30",
    zoom: "1.0",
    requirementIds: [5],
    actions: ["C-p", "text:empty-client", "Enter"],
    expected: ["notes/projects/empty-client", "No notes here yet"],
    forbidden: [".data", ".hidden-child"],
    evidence: [...feedbackEvidence, "state readback"],
    ratingPrompt: "Verify empty user folders are visible/filterable and hidden/internal folders remain absent.",
  },
  {
    id: "search-note-raw-preview-100x30",
    title: "Search Everything note raw preview",
    geometry: "100x30",
    zoom: "1.0",
    requirementIds: [6],
    actions: ["C-p", "text:titlematch"],
    expected: ["Search Everything", "notes/inbox/titlematch-file.md", "TitleMatch body line"],
    forbidden: ["Preview ·", "Summary", "Excerpt"],
    evidence: [...feedbackEvidence],
    ratingPrompt: "Verify note preview title is the note path and content is raw note text without section labels.",
  },
  {
    id: "search-folder-raw-preview-100x30",
    title: "Search Everything folder raw preview",
    geometry: "100x30",
    zoom: "1.0",
    requirementIds: [6],
    actions: ["C-p", "text:empty-client"],
    expected: ["Search Everything", "notes/projects/empty-client"],
    forbidden: ["Items", "Preview ·", ".hidden-child"],
    evidence: [...feedbackEvidence],
    ratingPrompt: "Verify folder preview title is the folder path and content matches Manager-style raw folder rows/empty state.",
  },
  {
    id: "search-command-raw-preview-100x30",
    title: "Search Everything command raw preview",
    geometry: "100x30",
    zoom: "1.0",
    requirementIds: [6, 9],
    actions: ["C-p", "text:/new"],
    expected: ["Search Everything", "/new", "Create"],
    forbidden: ["Availability", "unavailable", "/archive", "/migrate", "/rebuild"],
    evidence: [...feedbackEvidence],
    ratingPrompt: "Verify command preview title is the command and visible command help is raw/readable without unavailable metadata.",
  },
  {
    id: "search-stable-chrome-80x24",
    title: "Search Everything stable chrome small",
    geometry: "80x24",
    zoom: "1.0",
    requirementIds: [7],
    actions: ["C-p", "text:alpha"],
    expected: ["Search Everything", "Alpha", "Ctrl+P"],
    forbidden: ["Search · alpha", "Search · type to begin"],
    evidence: [...feedbackEvidence],
    ratingPrompt: "Verify Search Everything keeps one stable title and no duplicate query-updating subtitle at 80x24.",
  },
  {
    id: "search-long-results-scroll-100x30",
    title: "Search Everything long results scrolling",
    geometry: "100x30",
    zoom: "1.0",
    requirementIds: [8],
    actions: ["C-p", "text:longscrolltoken", "Down", "Down", "Down", "Down", "Down", "Down", "Down", "Down", "Down", "Down", "Down", "Down"],
    expected: ["Search Everything", "longscrolltoken", "more below"],
    evidence: [...feedbackEvidence, "state readback"],
    ratingPrompt: "Verify long Search Everything result lists scroll cleanly, keep selection visible, and keep preview/footer on screen.",
  },
  {
    id: "search-editor-context-commands-100x30",
    title: "Search Everything editor context commands",
    geometry: "100x30",
    zoom: "1.0",
    requirementIds: [9],
    actions: ["C-p", "text:editor-body", "Enter", "C-p", "text:/"],
    expected: ["Search Everything", "/find", "/replace", "/save"],
    forbidden: ["/migrate", "/rebuild", "unavailable"],
    evidence: [...feedbackEvidence],
    ratingPrompt: "Verify editor-invoked Search Everything shows only working editor commands and no unusable command rows.",
  },
  {
    id: "search-manager-context-commands-120x40",
    title: "Search Everything manager context commands",
    geometry: "120x40",
    zoom: "1.0",
    requirementIds: [9],
    actions: ["C-p", "text:/"],
    expected: ["Search Everything", "/new"],
    forbidden: ["/find", "/replace", "/migrate", "/rebuild", "unavailable"],
    evidence: [...feedbackEvidence],
    ratingPrompt: "Verify manager-invoked Search Everything shows only working manager commands and remains readable at 120x40.",
  },
]

const cases: VisualCase[] = [...feedbackVisualCases, ...refinedVisualCases, ...baselineVisualCases]

export const qaSeedExpectations = {
  titles: [
    "Ultra long title used to exercise manager row truncation with enough extra words to exceed eighty display columns",
    "TitleMatch Search File Preview",
  ],
  relativePaths: [
    "notes/projects/client/client-note.md",
    "notes/projects/project-overview.md",
    "notes/projects/empty-client/",
    "notes/.data/",
  ],
  bodyMarkers: ["needle-repeat", "replace-target", "clipboard-source", "undo-redo-start", "clipboard-feedback-start", "longscrolltoken"],
} as const

function parseArg(name: string): string | null {
  const prefix = `${name}=`
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith(prefix)) return arg.slice(prefix.length)
  }
  return null
}

function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(name)
}

function run(command: string, args: string[], options: { env?: NodeJS.ProcessEnv; timeout?: number; cwd?: string } = {}): RunResult {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: { ...process.env, ...options.env },
    encoding: "utf8",
    timeout: options.timeout ?? 10_000,
    maxBuffer: 1024 * 1024 * 10,
  })
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  }
}

function requireCommand(command: string, hint: string): void {
  const result = run("bash", ["-lc", `command -v ${command}`])
  if (result.status !== 0) {
    throw new Error(`${command} is required. ${hint}`)
  }
}

function requirePythonPillow(): void {
  const result = run("python3", ["-c", "import PIL.Image"], { timeout: 10_000 })
  if (result.status !== 0) {
    throw new Error("python3 Pillow is required for screenshot post-processing. Install python3-pil or run with --no-screenshots.")
  }
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

function wait(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)
}

export function buildGnomeTerminalGeometry(geometry: string, caseIndex: number): string {
  void caseIndex
  if (geometry === "80x24") {
    return `${geometry}+40+700`
  }
  return `${geometry}+40+40`
}

export function screenshotBridgeArgumentsFor(targetWindowId: number | null): ScreenshotBridgeArguments[] {
  if (targetWindowId !== null) {
    return [{ window_id: targetWindowId, raise_window: true }, { full_screen: true, raise_window: false }]
  }

  return [{ full_screen: true }]
}

function markdownCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ")
}

export function buildEvidenceRows(input: EvidenceRowInput): string[] {
  const requirement = input.requirementIds.join(", ")
  const expectedText = input.forbidden && input.forbidden.length > 0
    ? `${input.expected.join(", ")} / absent: ${input.forbidden.join(", ")}`
    : input.expected.join(", ")
  const stateReadback = input.stateReadbackPaths && input.stateReadbackPaths.length > 0 ? input.stateReadbackPaths.join(", ") : "n/a"
  return [
    "| Requirement(s) | Case | Size/zoom | Key sequence | Expected text | Pane evidence | Screenshot evidence | Screenshot log | State/readback evidence | Status | Notes |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    `| ${markdownCell(requirement)} | ${markdownCell(input.caseId)} — ${markdownCell(input.title)} | ${markdownCell(`${input.geometry} / ${input.zoom}`)} | ${markdownCell(input.actions.join(" ") || "initial state")} | ${markdownCell(expectedText)} | ${markdownCell(input.panePath)} | ${markdownCell(input.screenshotPath)} | ${markdownCell(input.screenshotLogPath)} | ${markdownCell(stateReadback)} | ${markdownCell(input.status)} | ${markdownCell(input.notes || "manual rating/readback pending")} |`,
  ]
}

interface LiveTuiProcess {
  pid: number
  ppid: string
  stat: string
  rssKb: string
  command: string
}

function readProcText(pid: string, fileName: string): string | null {
  try {
    return readFileSync(path.join("/proc", pid, fileName), "utf8")
  } catch {
    return null
  }
}

function listLiveBlueNoteTuiProcessesForRoot(rootPath: string): LiveTuiProcess[] {
  const live: LiveTuiProcess[] = []
  for (const entry of readdirSync("/proc", { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^\d+$/u.test(entry.name)) continue
    const cmdline = readProcText(entry.name, "cmdline")
    if (!cmdline || !cmdline.includes("bn.ts\u0000tui") && !cmdline.includes("bn.ts tui")) continue
    const environ = readProcText(entry.name, "environ") ?? ""
    if (!environ.split("\u0000").includes(`BLUENOTE_ROOT=${rootPath}`)) continue
    const status = readProcText(entry.name, "status") ?? ""
    const stat = readProcText(entry.name, "stat") ?? ""
    live.push({
      pid: Number.parseInt(entry.name, 10),
      ppid: status.match(/^PPid:\s+(\d+)/mu)?.[1] ?? "?",
      stat: stat.match(/^\d+\s+\([^)]*\)\s+(\S+)/u)?.[1] ?? "?",
      rssKb: status.match(/^VmRSS:\s+(\d+\s+kB)/mu)?.[1] ?? "?",
      command: cmdline.replaceAll("\u0000", " ").trim(),
    })
  }
  return live.sort((left, right) => left.pid - right.pid)
}

function cleanupBlueNoteTuiProcessesForRoot(rootPath: string, context: string): LiveTuiProcess[] {
  let live = listLiveBlueNoteTuiProcessesForRoot(rootPath)
  for (const proc of live) {
    try {
      process.kill(proc.pid, "SIGTERM")
    } catch {
      // The process may exit between listing and signal delivery.
    }
  }

  const deadline = Date.now() + 5_000
  while (Date.now() <= deadline) {
    live = listLiveBlueNoteTuiProcessesForRoot(rootPath)
    if (live.length === 0) return []
    wait(100)
  }

  for (const proc of live) {
    try {
      process.kill(proc.pid, "SIGKILL")
    } catch {
      // The process may exit between listing and signal delivery.
    }
  }
  wait(500)
  const remaining = listLiveBlueNoteTuiProcessesForRoot(rootPath)
  if (remaining.length > 0) {
    throw new Error(`${context}: failed to clean up scoped BlueNote TUI processes: ${JSON.stringify(remaining, null, 2)}`)
  }
  return live
}

function writeFocusedScreenshotBridge(scriptPath: string): void {
  writeFileSync(scriptPath, `#!/usr/bin/env python3
from __future__ import annotations
import base64, json, subprocess, sys, time
from pathlib import Path

def send(proc, msg):
    proc.stdin.write(json.dumps(msg) + "\\n")
    proc.stdin.flush()

def read_response(proc, wanted_id, timeout=60.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        line = proc.stdout.readline()
        if not line:
            err = proc.stderr.read() if proc.stderr else ""
            raise RuntimeError("computer-use-linux mcp exited before response: " + err[:500])
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue
        if msg.get("id") == wanted_id:
            return msg
    raise TimeoutError(f"timed out waiting for JSON-RPC id {wanted_id}")

def extract_png(response):
    result = response.get("result") or {}
    tool_result = result.get("result", result)
    for item in tool_result.get("content", []):
        data = item.get("data")
        if data:
            return base64.b64decode(data)
        text = item.get("text") or ""
        if "base64," in text:
            return base64.b64decode(text.split("base64,", 1)[1].strip())
    raise RuntimeError("no PNG/base64 content found in response: " + json.dumps(response)[:1000])

def call_screenshot(arguments):
    proc = subprocess.Popen(["computer-use-linux", "mcp"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1)
    try:
        send(proc, {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"bluenote-visual-qa-focused-bridge","version":"1"}}})
        read_response(proc, 1, timeout=20)
        send(proc, {"jsonrpc":"2.0","method":"notifications/initialized","params":{}})
        if arguments.get("window_id") is not None:
            send(proc, {"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"activate_window","arguments":{"window_id": arguments.get("window_id")}}})
            read_response(proc, 2, timeout=20)
            time.sleep(0.5)
        send(proc, {"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"screenshot","arguments":arguments}})
        return read_response(proc, 3, timeout=60)
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            proc.kill()

def main():
    out = Path(sys.argv[1])
    window_id = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2] else None
    errors = []
    attempts = []
    if window_id is not None:
        attempts.append({"window_id": window_id, "raise_window": True})
        attempts.append({"full_screen": True, "raise_window": False})
    else:
        attempts.append({"full_screen": True})
    for index, arguments in enumerate(attempts):
        try:
            response = call_screenshot(arguments)
            png = extract_png(response)
            target = out
            target.write_bytes(png)
            if index != 0:
                fallback = out.with_name(out.stem + f".fallback-{index}.png")
                fallback.write_bytes(png)
                raw = out.with_name(out.stem + ".raw.png")
                raw.write_bytes(png)
                print(json.dumps({"ok": True, "out": str(target), "fallback_out": str(fallback), "raw": str(raw), "bytes": len(png), "arguments": arguments, "fallback": index}))
            else:
                print(json.dumps({"ok": True, "out": str(target), "bytes": len(png), "arguments": arguments}))
            return 0
        except Exception as exc:
            errors.append({"arguments": arguments, "error": str(exc)})
    print(json.dumps({"ok": False, "out": str(out), "errors": errors}), file=sys.stderr)
    return 2

if __name__ == "__main__":
    raise SystemExit(main())
`)
}

function ensureQaRoot(): string {
  const explicitRoot = parseArg("--root")
  if (explicitRoot) return path.resolve(explicitRoot)

  const root = mkdtempSync(path.join(tmpdir(), "bluenote-visual-qa-root-"))
  const init = run("bun", ["run", "./bin/bn.ts", "init"], { env: { BLUENOTE_ROOT: root }, timeout: 30_000 })
  if (init.status !== 0) {
    throw new Error(`failed to init QA root:\n${init.stdout}\n${init.stderr}`)
  }

  for (const title of [
    "Alpha",
    "Beta",
    "Long Line",
    "Unicode Café 测试 🙂",
    "Leading Spaces",
    "Empty",
    "Alpha Source",
    "Alpha Summary",
    "Ultra long title used to exercise manager row truncation with enough extra words to exceed eighty display columns",
    "Projects Folder Seed",
    "Preview Note Body",
    "Name Only Target",
    "TitleMatch Search File Preview",
    "Repeated Content Match Note",
    "Editor Body Replace Note",
    "Clipboard Note",
    "Undo Note",
    "Client Note",
    "Clipboard Feedback Note",
    "Ctrl H Backspace Note",
  ]) {
    const created = run("bun", ["run", "./bin/bn.ts", "new", "--title", title], { env: { BLUENOTE_ROOT: root }, timeout: 30_000 })
    if (created.status !== 0) {
      throw new Error(`failed to create ${title}:\n${created.stdout}\n${created.stderr}`)
    }
  }

  const bodies: Record<string, string> = {
    Alpha: "# Alpha\nquick brown fox 123\nShort line for editing.\n",
    Beta: "# Beta\nmeeting checklist\n- [ ] one\n- [x] two\n1234 punctuation !?.,\n",
    "Long Line": "This is a very long unwrap verification line with ASCII first then CJK 日本語日本語 and emoji 🙂🙂 and it continues far beyond one hundred eighty terminal columns so horizontal panning and the display-only continuation marker must be visible without changing saved content.\n",
    "Unicode Café 测试 🙂": "Unicode Café 测试 🙂\nCJK: 你好世界 日本語\nAccents: café Ångström naïve\nCombining: é â\n",
    "Leading Spaces": "    user-authored leading spaces must remain\nplain line starts here\n",
    Empty: "",
    "Alpha Source": "Alpha source content.\n",
    "Alpha Summary": "Alpha summary content.\n",
    "Ultra long title used to exercise manager row truncation with enough extra words to exceed eighty display columns": "# Ultra long\nThis description-like body line is intentionally verbose so the manager row has long title and preview content pressure without bleeding into the adjacent pane.\n",
    "Projects Folder Seed": "Folder seed used only to make projects visible during manager/search preview QA.\n",
    "Preview Note Body": "# preview-note\nnote-preview-body first line\nNo metadata rows should be needed to understand this note.\n",
    "Name Only Target": "This body intentionally mentions path-only-secret and description-only-secret but the visible filename should be name-only-target.\n",
    "TitleMatch Search File Preview": "TitleMatch body line for file/title preview.\nA deep titlematch-file filename/title match should be highlighted.\n",
    "Repeated Content Match Note": "needle-repeat one in this note.\nA second needle-repeat should produce another Search Everything row.\nThird needle-repeat occurrence confirms multi-content results.\n",
    "Editor Body Replace Note": "editor-body replace-target line for find replace highlight.\nAnother replace-target keeps navigation realistic.\n",
    "Clipboard Note": "clipboard-source text selected or attempted for terminal copy cut paste verification.\nclipboard-destination line remains for paste attempts.\n",
    "Undo Note": "undo-redo-start baseline line for undo/redo visual QA.\n",
    "Client Note": "client-note body inside nested projects/client folder.\nneedle-repeat client folder content.\n",
    "Clipboard Feedback Note": "clipboard-feedback-start alpha beta gamma for visual clipboard readback.\nclipboard-feedback-destination line remains for paste attempts.\n",
    "Ctrl H Backspace Note": "ctrl-h-backspace replace-target baseline.\nBackspace delivery should remove one typed probe character before replace opens through Ctrl+R.\n",
  }

  const desiredRelativePaths: Record<string, string> = {
    "Ultra long title used to exercise manager row truncation with enough extra words to exceed eighty display columns": "notes/inbox/ultra-long-filename-with-title-and-description-that-must-truncate-before-preview-pane.md",
    "Projects Folder Seed": "notes/projects/project-overview.md",
    "Preview Note Body": "notes/inbox/preview-note.md",
    "Name Only Target": "notes/inbox/name-only-target.md",
    "TitleMatch Search File Preview": "notes/inbox/titlematch-file.md",
    "Repeated Content Match Note": "notes/inbox/repeated-content.md",
    "Editor Body Replace Note": "notes/inbox/editor-body.md",
    "Clipboard Note": "notes/inbox/clipboard-note.md",
    "Undo Note": "notes/inbox/undo-note.md",
    "Client Note": "notes/projects/client/client-note.md",
    "Clipboard Feedback Note": "notes/inbox/clipboard-feedback.md",
    "Ctrl H Backspace Note": "notes/inbox/ctrl-h-backspace.md",
  }
  const sidecarDir = path.join(root, ".data", "notes")
  mkdirSync(path.join(root, "notes", "projects", "empty-client"), { recursive: true })
  mkdirSync(path.join(root, "notes", "projects", ".hidden-child"), { recursive: true })
  mkdirSync(path.join(root, "notes", ".data"), { recursive: true })
  mkdirSync(path.join(root, "notes", ".cache"), { recursive: true })

  for (let index = 1; index <= 20; index += 1) {
    const paddedIndex = String(index).padStart(2, "0")
    const key = `search-scroll-${paddedIndex}`
    const title = `Search Scroll ${paddedIndex}`
    const relativePath = path.join("notes", "inbox", `${key}.md`)
    const filePath = path.join(root, relativePath)
    mkdirSync(path.dirname(filePath), { recursive: true })
    writeFileSync(filePath, `# ${title}\nlongscrolltoken result ${index} keeps the Search Everything long list scrolling.\n`)
    writeFileSync(path.join(sidecarDir, `${key}.json`), `${JSON.stringify({
      key,
      title,
      description: `longscrolltoken result ${index}`,
      relativePath,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      archivedAt: null,
      namingVersion: 1,
    }, null, 2)}\n`)
  }

  for (const entry of readdirSync(sidecarDir)) {
    if (!entry.endsWith(".json")) continue
    const sidecarPath = path.join(sidecarDir, entry)
    const sidecar = JSON.parse(readFileSync(sidecarPath, "utf8")) as { key?: string; title?: string; relativePath?: string; description?: string }
    if (!sidecar.title || !sidecar.relativePath) continue

    let nextSidecarPath = sidecarPath
    const desiredRelativePath = desiredRelativePaths[sidecar.title]
    if (desiredRelativePath && desiredRelativePath !== sidecar.relativePath) {
      const from = path.join(root, sidecar.relativePath)
      const to = path.join(root, desiredRelativePath)
      mkdirSync(path.dirname(to), { recursive: true })
      if (existsSync(from)) renameSync(from, to)
      sidecar.relativePath = desiredRelativePath
      sidecar.key = path.basename(desiredRelativePath, ".md")
      nextSidecarPath = path.join(sidecarDir, `${sidecar.key}.json`)
      if (nextSidecarPath !== sidecarPath) renameSync(sidecarPath, nextSidecarPath)
    }

    if (Object.hasOwn(bodies, sidecar.title)) {
      const body = bodies[sidecar.title]
      sidecar.description = body.split(/\r?\n/u).find((line) => line.trim().length > 0)?.trim().slice(0, 120) ?? ""
      writeFileSync(path.join(root, sidecar.relativePath), body)
      writeFileSync(nextSidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`)
    }
  }

  const rebuild = run("bun", ["run", "./bin/bn.ts", "rebuild"], { env: { BLUENOTE_ROOT: root }, timeout: 30_000 })
  if (rebuild.status !== 0) {
    throw new Error(`failed to rebuild QA root:\n${rebuild.stdout}\n${rebuild.stderr}`)
  }

  return root
}

function parseWindowsJson(text: string): Array<{ window_id: number; title?: string; bounds?: unknown }> {
  const parsed = JSON.parse(text) as { windows?: Array<{ window_id: number; title?: string; bounds?: unknown }> }
  return parsed.windows ?? []
}

function findWindowIdByTitle(title: string): number | null {
  const result = run("computer-use-linux", ["windows"], { timeout: 10_000 })
  if (result.status !== 0) return null
  const windows = parseWindowsJson(result.stdout)
  const match = windows.find((window) => window.title === title) ?? windows.find((window) => window.title?.includes(title))
  return match?.window_id ?? null
}

function tmux(session: string, args: string[], timeout = 5_000): RunResult {
  return run("tmux", args.includes("-t") ? args : [...args], { timeout, env: { TMUX: process.env.TMUX ?? "" } })
}

function sendAction(session: string, action: string): void {
  if (action.startsWith("text:")) {
    const text = action.slice("text:".length)
    const result = run("tmux", ["send-keys", "-t", session, "-l", text])
    if (result.status !== 0) throw new Error(`tmux text action failed ${action}: ${result.stderr}`)
    wait(250)
    return
  }

  if (action.startsWith("C-S-")) {
    // tmux/terminal emulators generally cannot synthesize Ctrl+Shift letter
    // chords portably; preserve the scripted state and leave the real shortcut
    // delivery attempt to live manual QA where GNOME Terminal/OpenTUI behavior is observable.
    wait(250)
    return
  }

  const result = run("tmux", ["send-keys", "-t", session, action])
  if (result.status !== 0) throw new Error(`tmux key action failed ${action}: ${result.stderr}`)
  wait(500)
}

function capturePane(session: string): string {
  const result = run("tmux", ["capture-pane", "-p", "-t", session], { timeout: 5_000 })
  if (result.status !== 0) throw new Error(`tmux capture failed: ${result.stderr}`)
  return result.stdout
}

function launchCaseTerminal(testCase: VisualCase, session: string, qaRoot: string, title: string, caseIndex: number): void {
  run("tmux", ["kill-session", "-t", session], { timeout: 2_000 })
  const [cols, rows] = testCase.geometry.split("x")
  const tmuxCommand = `cd ${shellQuote(repoRoot)} && env BLUENOTE_ROOT=${shellQuote(qaRoot)} TERM=xterm-256color bun run ./bin/bn.ts tui`
  const created = run("tmux", ["new-session", "-d", "-s", session, "-x", cols, "-y", rows, tmuxCommand], { timeout: 10_000 })
  if (created.status !== 0) throw new Error(`failed to create tmux session ${session}: ${created.stderr}`)

  const attachCommand = `printf '\\033[3J\\033[H\\033[2J'; exec tmux attach -t ${shellQuote(session)}`
  const launched = run("gnome-terminal", ["--title", title, `--geometry=${buildGnomeTerminalGeometry(testCase.geometry, caseIndex)}`, `--zoom=${testCase.zoom}`, "--", "bash", "-lc", attachCommand], { timeout: 10_000 })
  if (launched.status !== 0) throw new Error(`failed to launch GNOME Terminal for ${testCase.id}: ${launched.stderr}`)
  wait(1_500)
}

function captureScreenshotViaFocusedBridge(outPath: string, targetWindowId: number | null): RunResult {
  const windowArg = targetWindowId === null ? "" : String(targetWindowId)
  const command = `python3 ${shellQuote(screenshotBridgePath)} ${shellQuote(outPath)} ${shellQuote(windowArg)}; code=$?; echo bridge_exit=$code; sleep 1; exit $code`
  return run("bash", ["-lc", command], { timeout: 80_000 })
}

function waitForFile(filePath: string, timeoutMs: number): boolean {
  const deadline = Date.now() + timeoutMs
  while (Date.now() <= deadline) {
    if (existsSync(filePath)) return true
    wait(250)
  }
  return false
}

function collectTextFiles(rootPath: string, relativeDir = "notes"): string[] {
  const absoluteDir = path.join(rootPath, relativeDir)
  if (!existsSync(absoluteDir)) return []
  const files: string[] = []
  for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue
    const relativePath = path.join(relativeDir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectTextFiles(rootPath, relativePath))
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(relativePath)
    }
  }
  return files.sort()
}

function writeCaseReadbackArtifacts(testCase: VisualCase, qaRoot: string, caseDir: string): string[] {
  const paths: string[] = []
  if (!testCase.evidence?.some((item) => item.includes("readback"))) return paths

  const diskPath = path.join(caseDir, "state-readback.txt")
  const matching: string[] = []
  const probes = [...testCase.expected, ...(testCase.forbidden ?? [])]
    .filter((value) => /[A-Za-z0-9]/u.test(value) && !value.startsWith("Ctrl"))
  for (const relativePath of collectTextFiles(qaRoot)) {
    const absolutePath = path.join(qaRoot, relativePath)
    const text = readFileSync(absolutePath, "utf8")
    const hits = probes.filter((probe) => text.includes(probe))
    if (hits.length > 0) {
      matching.push(`## ${relativePath}\nmatched: ${hits.join(", ")}\n${text.slice(0, 2000)}`)
    }
  }
  writeFileSync(diskPath, matching.length > 0 ? `${matching.join("\n\n---\n\n")}\n` : `No note-body readback matches for probes: ${probes.join(", ")}\n`)
  paths.push(diskPath)

  const folderPath = path.join(caseDir, "folder-readback.txt")
  const folderLines = [
    `empty user folder exists: ${existsSync(path.join(qaRoot, "notes", "projects", "empty-client"))}`,
    `hidden project child exists for negative fixture: ${existsSync(path.join(qaRoot, "notes", "projects", ".hidden-child"))}`,
    `internal notes/.data fixture exists for negative fixture: ${existsSync(path.join(qaRoot, "notes", ".data"))}`,
  ]
  writeFileSync(folderPath, `${folderLines.join("\n")}\n`)
  paths.push(folderPath)

  return paths
}

function cropSmallManagerScreenshotIfNeeded(filePath: string, testCaseId: string): string | null {
  if (testCaseId !== "manager-80x24") return null

  const crop = run("python3", ["-c", `
from pathlib import Path
import shutil
from PIL import Image

path = Path(${JSON.stringify(filePath)})
img = Image.open(path)
if img.width >= 780 and img.height >= 500:
    # GNOME portal can include terminal scrollback above the small target.
    # Preserve the raw artifact and write an explicit cropped acceptance artifact.
    raw = path.with_name("screen.raw.png")
    shutil.copy2(path, raw)
    img.crop((35, 170, img.width, img.height)).save(path)
    print(f"cropped manager-80x24 screenshot; raw preserved at {raw}")
`], { timeout: 10_000 })
  if (crop.status !== 0) {
    throw new Error(`failed to crop manager-80x24 screenshot: ${crop.stderr || crop.stdout}`)
  }
  return crop.stdout.trim() || null
}

function main(): void {
  if (hasFlag("--help")) {
    console.log(`Usage: bun run ./scripts/visual-tui-qa.ts [--out-dir=/path] [--root=/existing/bluenote/root] [--no-screenshots]\n\nCreates a seeded QA root, launches BlueNote TUI in GNOME Terminal/tmux across a size/zoom matrix, captures pane text, attempts focused-terminal screenshots, and writes report.md.`)
    return
  }

  requireCommand("tmux", "Install tmux or run from an environment that provides it.")
  requireCommand("gnome-terminal", "GNOME Terminal is required for GNOME Wayland visual QA.")
  const outDir = path.resolve(parseArg("--out-dir") ?? path.join(tmpdir(), `bluenote-visual-qa-${new Date().toISOString().replaceAll(/[:.]/gu, "-")}`))
  mkdirSync(outDir, { recursive: true })
  const qaRoot = ensureQaRoot()
  const noScreenshots = hasFlag("--no-screenshots")
  if (!noScreenshots) {
    requireCommand("computer-use-linux", "Install/configure computer-use-linux for window targeting and screenshot capture.")
    writeFocusedScreenshotBridge(screenshotBridgePath)
    requirePythonPillow()
  }
  const reportLines: string[] = [
    "# BlueNote visual TUI QA harness report",
    "",
    `Date: ${new Date().toISOString()}`,
    `Repo: ${repoRoot}`,
    `QA root: ${qaRoot}`,
    `Output dir: ${outDir}`,
    "",
    "> Fill in UX ratings after inspecting the PNG artifacts. If PNG capture fails, use pane text only for functional evidence and mark visual acceptance as blocked/partial.",
    "",
  ]

  for (const [caseIndex, testCase] of cases.entries()) {
    const session = `bluenote-vqa-${testCase.id}-${process.pid}`
    const terminalTitle = `BlueNote VQA ${testCase.id}`
    const caseDir = path.join(outDir, testCase.id)
    mkdirSync(caseDir, { recursive: true })
    const panePath = path.join(caseDir, "pane.txt")
    const pngPath = path.join(caseDir, "screen.png")
    const screenshotLogPath = path.join(caseDir, "screenshot.log")
    const cleanupPath = path.join(caseDir, "cleanup.txt")
    const stateReadbackPaths: string[] = []

    let status = "Pass"
    let notes = ""
    let windowId: number | null = null
    try {
      launchCaseTerminal(testCase, session, qaRoot, terminalTitle, caseIndex)
      windowId = findWindowIdByTitle(terminalTitle)
      for (const action of testCase.actions) sendAction(session, action)
      const pane = capturePane(session)
      writeFileSync(panePath, pane)
      stateReadbackPaths.push(...writeCaseReadbackArtifacts(testCase, qaRoot, caseDir))
      for (const expected of testCase.expected) {
        if (!pane.includes(expected)) {
          status = "Needs review"
          notes += `Missing expected text ${JSON.stringify(expected)} in pane capture. `
        }
      }
      for (const forbidden of testCase.forbidden ?? []) {
        if (pane.includes(forbidden)) {
          status = "Needs review"
          notes += `Forbidden text ${JSON.stringify(forbidden)} appeared in pane capture. `
        }
      }

      if (!noScreenshots) {
        const bridge = captureScreenshotViaFocusedBridge(pngPath, windowId)
        writeFileSync(screenshotLogPath, `${bridge.stdout}\n${bridge.stderr}`)
        if (bridge.status !== 0) {
          status = status === "Pass" ? "Screenshot blocked" : status
          notes += "Focused-terminal screenshot bridge failed; check screenshot.log and approve GNOME portal prompt if shown. "
        } else if (!waitForFile(pngPath, 75_000)) {
          status = status === "Pass" ? "Screenshot blocked" : status
          notes += "Focused-terminal screenshot did not produce a PNG. Check screenshot.log and approve GNOME portal prompt if shown. "
        } else {
          const cropNote = cropSmallManagerScreenshotIfNeeded(pngPath, testCase.id)
          if (cropNote) notes += `${cropNote}. `
        }
      } else {
        writeFileSync(screenshotLogPath, "Screenshot capture skipped because --no-screenshots was set. Pane evidence is functional only; visual acceptance remains manual/live.\n")
      }
    } catch (error) {
      status = "Error"
      notes += error instanceof Error ? error.message : String(error)
    } finally {
      run("tmux", ["kill-session", "-t", session], { timeout: 5_000 })
      try {
        const cleaned = cleanupBlueNoteTuiProcessesForRoot(qaRoot, `${testCase.id} cleanup`)
        writeFileSync(cleanupPath, cleaned.length === 0 ? "No scoped BlueNote TUI processes required cleanup after this case.\n" : `${JSON.stringify(cleaned, null, 2)}\n`)
        stateReadbackPaths.push(cleanupPath)
        if (cleaned.length > 0) {
          notes += `Cleaned ${cleaned.length} scoped TUI process(es) after this case. `
          status = status === "Pass" ? "Cleanup warning" : status
        }
      } catch (error) {
        status = "Error"
        notes += error instanceof Error ? error.message : String(error)
      }
      wait(500)
    }

    reportLines.push(`## ${testCase.id} — ${testCase.title}`)
    reportLines.push("")
    reportLines.push(`- Requirement(s): ${testCase.requirementIds.join(", ")}`)
    reportLines.push(`- Geometry: ${testCase.geometry}`)
    reportLines.push(`- Zoom: ${testCase.zoom}`)
    reportLines.push(`- TUI window id: ${windowId ?? "not found"}`)
    reportLines.push(`- Pane capture: ${panePath}`)
    reportLines.push(`- Screenshot: ${existsSync(pngPath) ? pngPath : "not captured"}`)
    reportLines.push(`- Screenshot log: ${existsSync(screenshotLogPath) ? screenshotLogPath : "not written"}`)
    reportLines.push(`- State/readback evidence: ${stateReadbackPaths.length > 0 ? stateReadbackPaths.join(", ") : "n/a"}`)
    reportLines.push(`- Harness status: ${status}`)
    reportLines.push(`- Visual rating (1-5): pending manual review`)
    reportLines.push(`- User-perspective prompt: ${testCase.ratingPrompt}`)
    if (notes) reportLines.push(`- Notes: ${notes}`)
    reportLines.push("")
    reportLines.push("### Requirement evidence")
    reportLines.push("")
    reportLines.push(...buildEvidenceRows({
      caseId: testCase.id,
      title: testCase.title,
      requirementIds: testCase.requirementIds,
      geometry: testCase.geometry,
      zoom: testCase.zoom,
      actions: testCase.actions,
      expected: testCase.expected,
      forbidden: testCase.forbidden,
      panePath,
      screenshotPath: existsSync(pngPath) ? pngPath : "not captured",
      screenshotLogPath: existsSync(screenshotLogPath) ? screenshotLogPath : "not written",
      stateReadbackPaths,
      status,
      notes,
    }))
    reportLines.push("")
  }

  const finalLiveProcesses = listLiveBlueNoteTuiProcessesForRoot(qaRoot)
  const processPath = path.join(outDir, "process-after.txt")
  writeFileSync(processPath, finalLiveProcesses.length === 0 ? "No live BlueNote TUI processes for harness QA root.\n" : JSON.stringify(finalLiveProcesses, null, 2))
  reportLines.push("## Process check after harness")
  reportLines.push("")
  reportLines.push(`Process listing: ${processPath}`)
  reportLines.push("")
  reportLines.push("```text")
  reportLines.push(finalLiveProcesses.length === 0 ? "No live BlueNote TUI processes for harness QA root." : JSON.stringify(finalLiveProcesses, null, 2))
  reportLines.push("```")

  const reportPath = path.join(outDir, "report.md")
  writeFileSync(reportPath, `${reportLines.join("\n")}\n`)
  console.log(`Visual TUI QA harness complete.`)
  console.log(`QA root: ${qaRoot}`)
  console.log(`Output dir: ${outDir}`)
  console.log(`Report: ${reportPath}`)
}

if (import.meta.main) {
  main()
}
