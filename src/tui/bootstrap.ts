import type { ResolveBlueNoteRootOptions } from "../config/root"
import { existsSync } from "node:fs"
import path from "node:path"

import { resolveBlueNoteRoot } from "../config/root"
import { RootNotInitializedError } from "../core/errors"
import { MANAGED_ROOT_LAYOUT } from "../storage/root-layout"
import * as stateManifest from "../storage/state-manifest"
import { loadInitialNoteBrowserState } from "./adapters/note-browser"
import type { TuiAppState, TuiBootstrapInfo, TuiBootstrapStatus } from "./types"

function hasManagedRootLayout(rootPath: string): boolean {
  return MANAGED_ROOT_LAYOUT.every((relativePath) => existsSync(path.join(rootPath, relativePath)))
}

function createTuiAppState(rootPath: string, status: TuiBootstrapStatus, options: ResolveBlueNoteRootOptions): TuiAppState {
  return {
    bootstrap: {
      appName: "BlueNote",
      status,
      rootPath,
      nextPhase: "phase-3-tui-shell",
    },
    noteBrowser:
      status === "missing-root"
        ? {
            status: "empty",
            notes: [],
            selectedNote: null,
            emptyState: {
              code: "ROOT_NOT_INITIALIZED",
              message: "BlueNote root is not initialized.",
              hint: "Run 'bn init' first.",
            },
          }
        : loadInitialNoteBrowserState({
            ...options,
            override: rootPath,
          }),
  }
}

export function loadTuiAppState(options: ResolveBlueNoteRootOptions = {}): TuiAppState {
  const rootPath = resolveBlueNoteRoot(options)

  try {
    stateManifest.readStateManifest(rootPath)

    if (!hasManagedRootLayout(rootPath)) {
      return createTuiAppState(rootPath, "missing-root", options)
    }

    return createTuiAppState(rootPath, "ready", options)
  } catch (error) {
    if (error instanceof RootNotInitializedError) {
      return createTuiAppState(rootPath, "missing-root", options)
    }

    throw error
  }
}

export function bootstrapTuiApp(options: ResolveBlueNoteRootOptions = {}): TuiBootstrapInfo {
  return loadTuiAppState(options).bootstrap
}
