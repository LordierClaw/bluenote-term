import { resolveBlueNoteRoot, type ResolveBlueNoteRootOptions } from "../config/root"
import { ensureManagedRoot } from "../storage/root-layout"

export interface InitRootSummary {
  rootPath: string
}

export function initRoot(options: ResolveBlueNoteRootOptions = {}): InitRootSummary {
  const rootPath = ensureManagedRoot(resolveBlueNoteRoot(options))

  return {
    rootPath,
  }
}
