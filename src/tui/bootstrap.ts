import type { ResolveBlueNoteRootOptions } from "../config/root"
import { resolveBlueNoteRoot } from "../config/root"
import { readStateManifest } from "../storage/state-manifest"
import type { TuiBootstrapInfo } from "./types"

export function bootstrapTuiApp(options: ResolveBlueNoteRootOptions = {}): TuiBootstrapInfo {
  const rootPath = resolveBlueNoteRoot(options)

  try {
    readStateManifest(rootPath)

    return {
      appName: "BlueNote",
      status: "ready",
      rootPath,
      nextPhase: "phase-3-tui-shell",
    }
  } catch {
    return {
      appName: "BlueNote",
      status: "missing-root",
      rootPath,
      nextPhase: "phase-3-tui-shell",
    }
  }
}
