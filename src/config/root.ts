import os from "node:os"
import path from "node:path"

import { UsageError } from "../core/errors"

export interface ResolveBlueNoteRootOptions {
  override?: string
  env?: NodeJS.ProcessEnv
  cwd?: string
  homeDir?: string
}

function assertNonEmptyRootOverride(rootOverride: string, source: string): string {
  if (rootOverride.trim() === "") {
    throw new UsageError(`${source} must not be empty.`)
  }

  return rootOverride
}

export function resolveBlueNoteRoot(options: ResolveBlueNoteRootOptions = {}): string {
  const env = options.env ?? process.env
  const cwd = options.cwd ?? process.cwd()
  const homeDir = options.homeDir ?? os.homedir()

  const rootOverride = options.override !== undefined
    ? assertNonEmptyRootOverride(options.override, "BlueNote root override")
    : env.BLUENOTE_ROOT !== undefined
      ? assertNonEmptyRootOverride(env.BLUENOTE_ROOT, "BLUENOTE_ROOT")
      : path.join(homeDir, ".bluenote")

  return path.resolve(cwd, rootOverride)
}
