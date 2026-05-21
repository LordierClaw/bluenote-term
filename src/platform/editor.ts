import { spawnSync } from "node:child_process"

import { EditorLaunchError } from "../core/errors"

export interface EditorLaunchResult {
  exitCode: number
}

export type EditorLauncher = (command: string[]) => EditorLaunchResult

export interface LaunchEditorOptions {
  env?: NodeJS.ProcessEnv
  launcher?: EditorLauncher
}

export function resolveEditorCommand(env: NodeJS.ProcessEnv = process.env): string {
  const editor = env.EDITOR?.trim()

  if (!editor) {
    throw new EditorLaunchError("EDITOR is not set.", {
      hint: "Set EDITOR to a command like 'vim' or 'nano' and retry.",
    })
  }

  return editor
}

function defaultLauncher(command: string[]): EditorLaunchResult {
  const result = spawnSync(command[0], command.slice(1), { stdio: "inherit" })

  if (result.error) {
    throw new EditorLaunchError(`Could not launch editor '${command[0]}'.`, {
      hint: "Ensure EDITOR points to an installed executable.",
      cause: result.error,
    })
  }

  return {
    exitCode: result.status ?? 1,
  }
}

export function launchEditor(notePath: string, options: LaunchEditorOptions = {}): void {
  const editor = resolveEditorCommand(options.env)
  const launcher = options.launcher ?? defaultLauncher
  const command = [editor, notePath]
  const result = launcher(command)

  if (result.exitCode !== 0) {
    throw new EditorLaunchError(`Editor '${editor}' exited with code ${result.exitCode}.`, {
      hint: "Fix the editor command or exit the editor successfully, then retry.",
    })
  }
}
