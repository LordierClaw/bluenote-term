import { resolveBlueNoteRoot, type ResolveBlueNoteRootOptions } from "../config/root"
import { writeStateManifest } from "../storage/state-manifest"
import { ensureManagedRoot } from "../storage/root-layout"

export interface InitRootSummary {
  rootPath: string
}

export function initRoot(options: ResolveBlueNoteRootOptions = {}): InitRootSummary {
  const rootPath = ensureManagedRoot(resolveBlueNoteRoot(options))
  writeStateManifest(rootPath)

  return {
    rootPath,
  }
}
