import { resolveBlueNoteRoot, type ResolveBlueNoteRootOptions } from "../config/root"
import { UsageError } from "./errors"
import { writeStateManifest } from "../storage/state-manifest"
import { ensureManagedRoot } from "../storage/root-layout"

export interface InitRootSummary {
  rootPath: string
}

export function initRoot(options: ResolveBlueNoteRootOptions = {}): InitRootSummary {
  const rootPath = ensureManagedRoot(resolveBlueNoteRoot(options))

  try {
    writeStateManifest(rootPath)
  } catch (error) {
    throw new UsageError(`Could not initialize BlueNote root at '${rootPath}'.`, {
      hint: "Ensure BLUENOTE_ROOT points to a writable directory path.",
      cause: error,
    })
  }

  return {
    rootPath,
  }
}
