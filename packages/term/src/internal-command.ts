import type { CliResult } from "@lordierclaw/bluenote-core"

import { runTuiCommand, type RunTuiCommandOptions } from "./command"

const NOTE_COMMANDS = new Set(["init", "new", "list", "show", "search", "edit", "archive", "delete", "rebuild", "ai"])
const TUI_FLAGS = new Set(["--help", "-h", "--version", "-v", "--probe-tui-runtime", "--check-daemon"])

async function probeSourceTuiRuntime(): Promise<CliResult> {
  if (!("Bun" in globalThis)) {
    return {
      exitCode: 1 as const,
      stdout: "",
      stderr: "The source bluenote-term TUI probe requires Bun.\n",
    }
  }

  try {
    await import("./tui/app")
    return { exitCode: 0 as const, stdout: "BlueNote source TUI runtime available.\n", stderr: "" }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      exitCode: 1 as const,
      stdout: "",
      stderr: `Unable to load the source BlueNote TUI runtime: ${message}\n`,
    }
  }
}

export async function runInternalCommand(args: string[], options: RunTuiCommandOptions = {}): Promise<number> {
  const io = options.io ?? process
  const [command, ...commandArgs] = args

  if (command === undefined) {
    return runTuiCommand([], { probeTuiRuntime: probeSourceTuiRuntime, ...options })
  }

  if (command === "tui") {
    return runTuiCommand(commandArgs, { probeTuiRuntime: probeSourceTuiRuntime, ...options })
  }

  if (TUI_FLAGS.has(command) || command.startsWith("--daemon-url") || command.startsWith("--daemon-token")) {
    return runTuiCommand(args, { probeTuiRuntime: probeSourceTuiRuntime, ...options })
  }

  const stderr = NOTE_COMMANDS.has(command)
    ? `Use bluenote ${command}; bluenote-term is TUI-only.\n`
    : `Unknown bluenote-term option or command: ${command}\nUse bluenote-term --help for TUI launcher options.\n`

  io.stderr.write(stderr)
  return 1
}
