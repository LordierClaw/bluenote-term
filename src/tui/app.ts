import type { ResolveBlueNoteRootOptions } from "../config/root"
import { bootstrapTuiApp, loadTuiAppState } from "./bootstrap"
import type { TuiAppState, TuiBootstrapInfo } from "./types"

export type { TuiAppState, TuiBootstrapInfo } from "./types"

export function getTuiAppState(options: ResolveBlueNoteRootOptions = {}): TuiAppState {
  return loadTuiAppState(options)
}

export function getTuiBootstrapInfo(options: ResolveBlueNoteRootOptions = {}): TuiBootstrapInfo {
  return bootstrapTuiApp(options)
}

const invokedPath = process.argv[1]
const isMainModule = invokedPath
  ? import.meta.url === new URL(invokedPath, "file://").href
  : false

if (isMainModule) {
  const info = getTuiBootstrapInfo()
  console.log(`${info.appName} TUI bootstrap ${info.status} at ${info.rootPath}. Next: ${info.nextPhase}.`)
}
