import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"

function run(command: string, args: string[], options: { env?: NodeJS.ProcessEnv } = {}) {
  return spawnSync(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...options.env },
    encoding: "utf8",
  })
}

const rootPath = mkdtempSync(path.join(tmpdir(), "bluenote-opentui-interactive-"))
const sessionName = `bluenote-opentui-${process.pid}`

try {
  const initResult = run("bun", ["run", "./bin/bn.ts", "init"], { env: { BLUENOTE_ROOT: rootPath } })
  if (initResult.status !== 0) {
    throw new Error(`Failed to initialize smoke root: ${initResult.stderr || initResult.stdout}`)
  }

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
    `cd ${JSON.stringify(process.cwd())} && BLUENOTE_ROOT=${JSON.stringify(rootPath)} TERM=xterm-256color bun run ./bin/bn.ts tui`,
  ])
  if (launchResult.status !== 0) {
    throw new Error(`Failed to launch tmux TUI smoke session: ${launchResult.stderr || launchResult.stdout}`)
  }

  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1_500)

  const captureResult = run("tmux", ["capture-pane", "-p", "-t", sessionName])
  if (captureResult.status !== 0) {
    throw new Error(`Failed to capture tmux TUI pane: ${captureResult.stderr || captureResult.stdout}`)
  }

  const pane = captureResult.stdout
  if (pane.includes("BlueNote TUI workspace bootstrap ready")) {
    throw new Error("Interactive TUI printed the non-interactive bootstrap message instead of owning the terminal")
  }

  if (!pane.includes("BlueNote") || !pane.includes("Manager")) {
    throw new Error(`Interactive TUI pane did not include the expected Manager workspace text. Captured:\n${pane}`)
  }

  const interruptResult = run("tmux", ["send-keys", "-t", sessionName, "C-c"])
  if (interruptResult.status !== 0) {
    throw new Error(`Failed to interrupt tmux TUI smoke session: ${interruptResult.stderr || interruptResult.stdout}`)
  }

  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500)

  const hasSession = run("tmux", ["has-session", "-t", sessionName])
  if (hasSession.status === 0) {
    throw new Error("Interactive TUI did not exit after Ctrl+C")
  }

  console.log("Interactive OpenTUI smoke check passed.")
} finally {
  run("tmux", ["kill-session", "-t", sessionName])
  rmSync(rootPath, { recursive: true, force: true })
}
