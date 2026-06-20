import { runTuiCommand, type RunTuiCommandOptions } from "./command"

const NOTE_COMMANDS = new Set(["init", "new", "list", "show", "search", "edit", "archive", "delete", "rebuild", "ai"])
const TUI_FLAGS = new Set(["--help", "-h", "--version", "-v", "--probe-tui-runtime", "--check-daemon"])

export async function runInternalCommand(args: string[], options: RunTuiCommandOptions = {}): Promise<number> {
  const io = options.io ?? process
  const [command, ...commandArgs] = args

  if (command === undefined) {
    return runTuiCommand([], options)
  }

  if (command === "tui") {
    return runTuiCommand(commandArgs, options)
  }

  if (TUI_FLAGS.has(command) || command.startsWith("--daemon-url") || command.startsWith("--daemon-token")) {
    return runTuiCommand(args, options)
  }

  const stderr = NOTE_COMMANDS.has(command)
    ? `Use bluenote ${command}; bluenote-term is TUI-only.\n`
    : `Unknown bluenote-term option or command: ${command}\nUse bluenote-term --help for TUI launcher options.\n`

  io.stderr.write(stderr)
  return 1
}
