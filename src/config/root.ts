import os from "node:os"
import path from "node:path"

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
  const rootPath = options.override ?? env.BLUENOTE_ROOT ?? path.join(homeDir, ".bluenote")

  return path.resolve(cwd, rootPath)
}
