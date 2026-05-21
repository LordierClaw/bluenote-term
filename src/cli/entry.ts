import {
  AppError,
  isValidationOrDataError,
  UsageError,
} from "../core/errors"
import type { CliResult } from "../core/types"
import { initRoot } from "../core/init-root"

export function formatCliError(error: AppError): CliResult {
  const messageLines = [error.message]

  if (error.hint) {
    messageLines.push(`Hint: ${error.hint}`)
  }

  return {
    exitCode: isValidationOrDataError(error) ? 2 : 1,
    stdout: "",
    stderr: `${messageLines.join("\n")}\n`,
  }
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
    "  init         Initialize the managed BlueNote root",
    "  tui          Show the TUI scaffold status",
  ].join("\n") + "\n"
}

export function runCli(args: string[], version: string): CliResult {
  try {
    const [command] = args

    if (!command || command === "--help" || command === "help") {
      return { exitCode: 0, stdout: formatHelp(version), stderr: "" }
    }

    if (command === "--version" || command === "version") {
      return { exitCode: 0, stdout: `${version}\n`, stderr: "" }
    }

    if (command === "init") {
      const summary = initRoot()

      return {
        exitCode: 0,
        stdout: `Initialized BlueNote root: ${summary.rootPath}\n`,
        stderr: "",
      }
    }

    if (command === "tui") {
      return {
        exitCode: 0,
        stdout: "BlueNote TUI scaffold is present; full implementation starts in Phase 2.\n",
        stderr: "",
      }
    }

    return formatCliError(
      new UsageError(`Unknown command: ${command}`, {
        hint: "Use --help to see available commands.",
      }),
    )
  } catch (error) {
    if (error instanceof AppError) {
      return formatCliError(error)
    }

    throw error
  }
}
