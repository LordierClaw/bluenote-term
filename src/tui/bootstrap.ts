import type { ResolveBlueNoteRootOptions } from "../config/root"
import { existsSync } from "node:fs"
import path from "node:path"

import { resolveBlueNoteRoot } from "../config/root"
import { MANAGED_ROOT_LAYOUT } from "../storage/root-layout"
import { readStateManifest } from "../storage/state-manifest"
import type { TuiAppState, TuiBootstrapInfo, TuiBootstrapStatus } from "./types"

function hasManagedRootLayout(rootPath: string): boolean {
  return MANAGED_ROOT_LAYOUT.every((relativePath) => existsSync(path.join(rootPath, relativePath)))
}

function createTuiAppState(rootPath: string, status: TuiBootstrapStatus): TuiAppState {
  return {
    bootstrap: {
      appName: "BlueNote",
      status,
      rootPath,
      nextPhase: "phase-3-tui-shell",
    },
  }
}

export function bootstrapTuiApp(options: ResolveBlueNoteRootOptions = {}): TuiBootstrapInfo {
  const rootPath = resolveBlueNoteRoot(options)

  try {
    readStateManifest(rootPath)

    if (!hasManagedRootLayout(rootPath)) {
      return createTuiAppState(rootPath, "missing-root").bootstrap
    }

    return createTuiAppState(rootPath, "ready").bootstrap
  } catch {
    return createTuiAppState(rootPath, "missing-root").bootstrap
  }
}
