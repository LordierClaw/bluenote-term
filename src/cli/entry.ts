export interface CliResult {
  exitCode: number
  stdout: string
  stderr: string
}

export function formatHelp(version: string): string {
  return [
    `BlueNote v${version}`,
    "Scaffold status: preparation phase",
    "",
    "Usage:",
    "  bn [command]",
    "",
    "Commands:",
    "  --help       Show this message",
    "  --version    Print the current version",
    "  tui          Show the TUI scaffold status",
  ].join("\n") + "\n"
}

export function runCli(args: string[], version: string): CliResult {
  const [command] = args

  if (!command || command === "--help" || command === "help") {
    return { exitCode: 0, stdout: formatHelp(version), stderr: "" }
  }

  if (command === "--version" || command === "version") {
    return { exitCode: 0, stdout: `${version}\n`, stderr: "" }
  }

  if (command === "tui") {
    return {
      exitCode: 0,
      stdout: "BlueNote TUI scaffold is present; full implementation starts in Phase 2.\n",
      stderr: "",
    }
  }

  return {
    exitCode: 1,
    stdout: "",
    stderr: `Unknown command: ${command}\nUse --help to see available commands.\n`,
  }
}
