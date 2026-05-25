import type { ResolveBlueNoteRootOptions } from "../config/root"
import { bootstrapTuiApp } from "./bootstrap"
import type { TuiBootstrapInfo } from "./types"

export type { TuiBootstrapInfo } from "./types"

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
