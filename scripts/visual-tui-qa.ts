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
  panePath: string
  screenshotPath: string
  screenshotLogPath: string
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

const legacyVisualCases: VisualCase[] = [
  {
    id: "manager-100x30",
    title: "Manager medium",
    geometry: "100x30",
    zoom: "1.0",
    requirementIds: [1, 7, 14],
    actions: [],
    expected: ["BlueNote", "Workspace", "Alpha", "Long Line"],
    ratingPrompt: "Rate manager readability, terminal-default background, title focus, dim secondary text, and absence of a third note-path column.",
  },
  {
    id: "editor-100x30",
    title: "Editor medium",
    geometry: "100x30",
    zoom: "1.0",
    requirementIds: [5, 14],
    actions: ["Enter", "Enter"],
    expected: ["Wrap word", "[Ctrl+S] Save"],
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
    expected: ["BlueNote", "Alpha"],
    ratingPrompt: "Rate small-terminal manager layout and whether primary actions remain visible.",
  },
  {
    id: "manager-120x40",
    title: "Manager large",
    geometry: "120x40",
    zoom: "1.0",
    requirementIds: [1, 2, 7, 14],
    actions: [],
    expected: ["BlueNote", "Alpha", "Unicode Café"],
    ratingPrompt: "Rate large-terminal spacing, alignment, and whether extra space is used calmly.",
  },
  {
    id: "manager-100x30-zoom150",
    title: "Manager zoom 1.5",
    geometry: "100x30",
    zoom: "1.5",
    requirementIds: [1, 2, 7, 14],
    actions: [],
    expected: ["BlueNote", "Alpha"],
    ratingPrompt: "Rate high-zoom readability and whether layout remains usable at larger font scale.",
  },
]

export const phase4JVisualCases: VisualCase[] = [
  {
    id: "manager-long-row-truncation-100x30",
    title: "Manager long row truncation",
    geometry: "100x30",
    zoom: "1.0",
    requirementIds: [2],
    actions: ["Enter", "/", "text:ultra-long"],
    expected: ["Ultra long", "Filter"],
    ratingPrompt: "Verify long filename/title/description text is clamped and does not bleed into the preview pane.",
  },
  {
    id: "manager-folder-preview-100x30",
    title: "Manager folder preview",
    geometry: "100x30",
    zoom: "1.0",
    requirementIds: [3],
    actions: ["j"],
    expected: ["projects", "client"],
    ratingPrompt: "Verify focused folder preview shows immediate items only and no folder metadata rows.",
  },
  {
    id: "manager-note-preview-100x30",
    title: "Manager note preview",
    geometry: "100x30",
    zoom: "1.0",
    requirementIds: [4],
    actions: ["Enter", "/", "text:preview-note", "Enter"],
    expected: ["preview-note", "note-preview-body"],
    ratingPrompt: "Verify focused note preview shows title/body content without path/description metadata rows.",
  },
  {
    id: "manager-filter-name-only-100x30",
    title: "Manager filter name-only scope",
    geometry: "100x30",
    zoom: "1.0",
    requirementIds: [7, 8],
    actions: ["Enter", "/", "text:name-only-target"],
    expected: ["Filter", "name-only-target"],
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
    expected: ["Search Everything", "needle-repeat"],
    ratingPrompt: "Verify repeated note content matches are shown as multiple result rows with centered/highlighted previews.",
  },
  {
    id: "editor-separator-100x30",
    title: "Editor separator",
    geometry: "100x30",
    zoom: "1.0",
    requirementIds: [5],
    actions: ["Enter", "/", "text:editor-body", "Enter", "Enter"],
    expected: ["editor-body", "Ctrl+S"],
    ratingPrompt: "Verify editor topbar/body/bottombar separation is visible and calm.",
  },
  {
    id: "editor-find-replace-highlight-100x30",
    title: "Editor find/replace highlight",
    geometry: "100x30",
    zoom: "1.0",
    requirementIds: [12],
    actions: ["Enter", "/", "text:editor-body", "Enter", "Enter", "C-h", "text:replace-target"],
    expected: ["Replace", "replace-target"],
    ratingPrompt: "Verify Ctrl+H opens find/replace and the found result is highlighted/selected in the editor body.",
  },
  {
    id: "editor-clipboard-attempt-100x30",
    title: "Editor clipboard attempt",
    geometry: "100x30",
    zoom: "1.0",
    requirementIds: [6, 14],
    actions: ["Enter", "/", "text:clipboard-note", "Enter", "Enter", "C-S-c", "C-S-x", "C-S-v"],
    expected: ["clipboard-source"],
    ratingPrompt: "Attempt terminal-compatible Ctrl+Shift+C/X/V and record whether GNOME Terminal/OpenTUI delivers or consumes each binding.",
  },
  {
    id: "editor-undo-redo-flow-100x30",
    title: "Editor undo/redo flow",
    geometry: "100x30",
    zoom: "1.0",
    requirementIds: [13, 14],
    actions: ["Enter", "/", "text:undo-note", "Enter", "Enter", "text: added", "C-z", "C-y"],
    expected: ["undo-redo-start", "added", "Ctrl+S"],
    ratingPrompt: "Verify recent edit undo/redo shortcuts work and shortcut labels match delivered terminal bindings.",
  },
]

const cases: VisualCase[] = [...phase4JVisualCases, ...legacyVisualCases]

export const qaSeedExpectations = {
  titles: [
    "Ultra long title used to exercise manager row truncation with enough extra words to exceed eighty display columns",
    "TitleMatch Search File Preview",
  ],
  relativePaths: [
    "notes/projects/client/client-note.md",
    "notes/projects/client/nested/name-only-target.md",
  ],
  bodyMarkers: ["needle-repeat", "replace-target", "clipboard-source", "undo-redo-start"],
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
  return [
    "| Requirement(s) | Case | Size/zoom | Key sequence | Expected text | Pane evidence | Screenshot evidence | Screenshot log | Status | Notes |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    `| ${markdownCell(requirement)} | ${markdownCell(input.caseId)} — ${markdownCell(input.title)} | ${markdownCell(`${input.geometry} / ${input.zoom}`)} | ${markdownCell(input.actions.join(" ") || "initial state")} | ${markdownCell(input.expected.join(", "))} | ${markdownCell(input.panePath)} | ${markdownCell(input.screenshotPath)} | ${markdownCell(input.screenshotLogPath)} | ${markdownCell(input.status)} | ${markdownCell(input.notes || "TODO manual rating/readback")} |`,
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
  }

  const desiredRelativePaths: Record<string, string> = {
    "Ultra long title used to exercise manager row truncation with enough extra words to exceed eighty display columns": "notes/inbox/ultra-long-filename-with-title-and-description-that-must-truncate-before-preview-pane.md",
    "Projects Folder Seed": "notes/projects/project-overview.md",
    "Preview Note Body": "notes/inbox/preview-note.md",
    "Name Only Target": "notes/projects/client/nested/name-only-target.md",
    "TitleMatch Search File Preview": "notes/inbox/titlematch-file.md",
    "Repeated Content Match Note": "notes/inbox/repeated-content.md",
    "Editor Body Replace Note": "notes/inbox/editor-body.md",
    "Clipboard Note": "notes/inbox/clipboard-note.md",
    "Undo Note": "notes/inbox/undo-note.md",
    "Client Note": "notes/projects/client/client-note.md",
  }

  const sidecarDir = path.join(root, ".data", "notes")
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
  return run("gnome-terminal", ["--title", "BlueNote Visual QA Screenshot Bridge", "--geometry=44x8+1400+40", "--", "bash", "-lc", command], { timeout: 10_000 })
}

function waitForFile(filePath: string, timeoutMs: number): boolean {
  const deadline = Date.now() + timeoutMs
  while (Date.now() <= deadline) {
    if (existsSync(filePath)) return true
    wait(250)
  }
  return false
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
  requireCommand("computer-use-linux", "Install/configure computer-use-linux for window targeting and screenshot capture.")

  writeFocusedScreenshotBridge(screenshotBridgePath)

  const outDir = path.resolve(parseArg("--out-dir") ?? path.join(tmpdir(), `bluenote-visual-qa-${new Date().toISOString().replaceAll(/[:.]/gu, "-")}`))
  mkdirSync(outDir, { recursive: true })
  const qaRoot = ensureQaRoot()
  const noScreenshots = hasFlag("--no-screenshots")
  if (!noScreenshots) {
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

    let status = "Pass"
    let notes = ""
    let windowId: number | null = null
    try {
      launchCaseTerminal(testCase, session, qaRoot, terminalTitle, caseIndex)
      windowId = findWindowIdByTitle(terminalTitle)
      for (const action of testCase.actions) sendAction(session, action)
      const pane = capturePane(session)
      writeFileSync(panePath, pane)
      for (const expected of testCase.expected) {
        if (!pane.includes(expected)) {
          status = "Needs review"
          notes += `Missing expected text ${JSON.stringify(expected)} in pane capture. `
        }
      }

      if (!noScreenshots) {
        const bridge = captureScreenshotViaFocusedBridge(pngPath, windowId)
        writeFileSync(screenshotLogPath, `${bridge.stdout}\n${bridge.stderr}`)
        if (!waitForFile(pngPath, 75_000)) {
          status = status === "Pass" ? "Screenshot blocked" : status
          notes += "Focused-terminal screenshot did not produce a PNG. Check screenshot.log and approve GNOME portal prompt if shown. "
        } else {
          const cropNote = cropSmallManagerScreenshotIfNeeded(pngPath, testCase.id)
          if (cropNote) notes += `${cropNote}. `
        }
      }
    } catch (error) {
      status = "Error"
      notes += error instanceof Error ? error.message : String(error)
    } finally {
      run("tmux", ["kill-session", "-t", session], { timeout: 5_000 })
      try {
        const cleaned = cleanupBlueNoteTuiProcessesForRoot(qaRoot, `${testCase.id} cleanup`)
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
    reportLines.push(`- Harness status: ${status}`)
    reportLines.push(`- Visual rating (1-5): TODO`)
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
      panePath,
      screenshotPath: existsSync(pngPath) ? pngPath : "not captured",
      screenshotLogPath: existsSync(screenshotLogPath) ? screenshotLogPath : "not written",
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
