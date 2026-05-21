import os from "node:os"
import path from "node:path"

import { UsageError } from "../core/errors"

export interface ResolveBlueNoteRootOptions {
  override?: string
  env?: NodeJS.ProcessEnv
  cwd?: string
  homeDir?: string
}

export function resolveBlueNoteRoot(options: ResolveBlueNoteRootOptions = {}): string {
  const env = options.env ?? process.env
  const cwd = options.cwd ?? process.cwd()
  const homeDir = options.homeDir ?? os.homedir()
  const override = options.override
  const envRoot = env.BLUENOTE_ROOT
  const hasOverride = override !== undefined
  let rootPath: string

  if (override !== undefined) {
    rootPath = override
  } else if (envRoot !== undefined) {
    rootPath = envRoot
  } else {
    rootPath = path.join(homeDir, ".bluenote")
  }

  if (rootPath === "") {
    throw new UsageError(hasOverride ? "BlueNote root override must not be empty." : "BLUENOTE_ROOT must not be empty.")
  }

  return path.resolve(cwd, rootPath)
}
