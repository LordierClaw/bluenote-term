import type { CliResult } from "../core/types"

export interface TuiBootstrapInfo {
  appName: string
  status: string
  nextPhase: string
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

export function runTuiCli(): CliResult {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: "BlueNote TUI requires an interactive terminal. Run `bn tui` from a TTY.\n",
    }
  }

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
