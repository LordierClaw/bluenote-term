import {
  AppError,
  isValidationOrDataError,
  UsageError,
} from "../core/errors"
import type { CliResult } from "../core/types"
import { createNote } from "../core/create-note"
import { initRoot } from "../core/init-root"
import { listNotes } from "../core/list-notes"
import { selectNote } from "../core/select-note"
import { resolveBlueNoteRoot } from "../config/root"
import { serializeNoteFile } from "../storage/frontmatter"
import { createNoteRepository } from "../storage/note-repository"

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

function readFlagValue(args: string[], flagName: string): string | undefined {
  const flagIndex = args.indexOf(flagName)

  if (flagIndex === -1) {
    return undefined
  }

  const value = args[flagIndex + 1]

  if (value === undefined || value.startsWith("--")) {
    throw new UsageError(`Missing value for ${flagName}.`, {
      hint: `Pass ${flagName} "...".`,
    })
  }

  return value
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
    "  new          Create a new note in notes/inbox",
    "  list         List note summaries",
    "  show         Print a matching note",
    "  tui          Show the TUI scaffold status",
  ].join("\n") + "\n"
}

export function runCli(args: string[], version: string): CliResult {
  try {
    const [command, ...commandArgs] = args

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

    if (command === "new") {
      const title = readFlagValue(commandArgs, "--title")

      if (!title) {
        throw new UsageError("Missing required --title for new note.", {
          hint: 'Run bn new --title "Example".',
        })
      }

      const summary = createNote({ title })

      return {
        exitCode: 0,
        stdout: `Created note: ${summary.relativePath}\n`,
        stderr: "",
      }
    }

    if (command === "list") {
      const summaries = listNotes()
      const stdout = summaries.map((summary) => `${summary.id}\t${summary.title}\t${summary.relativePath}`).join("\n")

      return {
        exitCode: 0,
        stdout: stdout === "" ? "" : `${stdout}\n`,
        stderr: "",
      }
    }

    if (command === "show") {
      const selector = commandArgs[0]

      if (!selector) {
        throw new UsageError("Missing required selector for show.", {
          hint: "Run bn show <id|path|slug>.",
        })
      }

      const rootPath = resolveBlueNoteRoot()
      const repository = createNoteRepository(rootPath)
      const selected = selectNote({ repository, selector })

      return {
        exitCode: 0,
        stdout: serializeNoteFile({
          frontmatter: selected.frontmatter,
          body: selected.body,
          sourcePath: selected.sourcePath,
        }),
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
