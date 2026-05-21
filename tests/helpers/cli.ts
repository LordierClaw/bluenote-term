import os from "node:os"
import path from "node:path"
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises"

import { MANAGED_ROOT_LAYOUT } from "../../src/storage/root-layout"

const workspaceRoot = path.resolve(import.meta.dir, "../..")
const cliPath = path.join(workspaceRoot, "bin", "bn.ts")

export type CliRunResult = {
  exitCode: number
  stdout: string
  stderr: string
}

export type ManagedRootHarness = {
  rootPath: string
  run(args: string[], extraEnv?: Record<string, string>): CliRunResult
  runScript(relativeScriptPath: string, extraEnv?: Record<string, string>): CliRunResult
  writeNote(relativePath: string, markdown: string): Promise<void>
  cleanup(): Promise<void>
  escapeForRegExp(value: string): string
}

type RunWorkspaceCommandOptions = {
  rootPath?: string
  extraEnv?: Record<string, string>
}

function runWorkspaceCommand(command: string[], { rootPath, extraEnv = {} }: RunWorkspaceCommandOptions = {}): CliRunResult {
  const result = Bun.spawnSync(command, {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      ...(rootPath ? { BLUENOTE_ROOT: rootPath } : {}),
      ...extraEnv,
    },
    stdout: "pipe",
    stderr: "pipe",
  })

  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }
}

export function runCli(args: string[], options: RunWorkspaceCommandOptions = {}): CliRunResult {
  return runWorkspaceCommand(["bun", "run", cliPath, ...args], options)
}

export function runWorkspaceScript(
  relativeScriptPath: string,
  { rootPath, extraEnv = {} }: RunWorkspaceCommandOptions = {},
): CliRunResult {
  return runWorkspaceCommand(["bun", "run", path.join(workspaceRoot, relativeScriptPath)], {
    rootPath,
    extraEnv,
  })
}

export async function assertManagedRootLayout(rootPath: string) {
  for (const relativePath of MANAGED_ROOT_LAYOUT) {
    const stats = await stat(path.join(rootPath, relativePath))
    if (!stats.isDirectory()) {
      throw new Error(`${relativePath} should be created as a directory`)
    }
  }
}

export async function createManagedRootHarness(prefix = "bluenote-test-"): Promise<ManagedRootHarness> {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), prefix))

  return {
    rootPath,
    run(args, extraEnv = {}) {
      return runCli(args, { rootPath, extraEnv })
    },
    runScript(relativeScriptPath, extraEnv = {}) {
      return runWorkspaceScript(relativeScriptPath, { rootPath, extraEnv })
    },
    async writeNote(relativePath, markdown) {
      const absolutePath = path.join(rootPath, relativePath)
      await mkdir(path.dirname(absolutePath), { recursive: true })
      await Bun.write(absolutePath, markdown)
    },
    cleanup() {
      return rm(rootPath, { recursive: true, force: true })
    },
    escapeForRegExp(value) {
      return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    },
  }
}
