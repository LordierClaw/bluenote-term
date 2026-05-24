import {
  AppError,
  isValidationOrDataError,
  UsageError,
} from "../core/errors"
import type { CliResult } from "../core/types"
import { archiveNote } from "../core/archive-note"
import { createNote } from "../core/create-note"
import { editNote } from "../core/edit-note"
import { initRoot } from "../core/init-root"
import { listNotes } from "../core/list-notes"
import { rebuildIndexes } from "../core/rebuild-indexes"
import { searchNotes } from "../core/search-notes"
import { showNote } from "../core/show-note"

export interface CliRuntimeOptions {
  createNoteOptions?: Pick<Parameters<typeof createNote>[0], "clock" | "randomSource">
}

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
    "Local-first terminal notes for Phase 2 storage + UX workflows",
    "",
    "Usage:",
    "  bn <command> [options]",
    "",
    "Commands:",
    "  --help       Show this message",
    "  --version    Print the current version",
    "  init         Initialize the managed BlueNote root",
    "  new          --title <title>  Create a new note in notes/inbox and print its key/path",
    "  list         List active notes as title, key, description, and path",
    "  show         <key|path|slug>  Print a matching note summary and body",
    "  search       <query>          Search indexed notes",
    "  edit         <id|path|slug>   Open a matching note in $EDITOR",
    "  archive      <id|path|slug>   Archive a matching note",
    "  rebuild      Rebuild derived metadata and search indexes",
  ].join("\n") + "\n"
}

export function runCli(args: string[], version: string, runtime: CliRuntimeOptions = {}): CliResult {
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

      const summary = createNote({
        title,
        ...runtime.createNoteOptions,
      })

      return {
        exitCode: 0,
        stdout: `Created note\nKey: ${summary.key}\nPath: ${summary.relativePath}\n`,
        stderr: "",
      }
    }

    if (command === "edit") {
      const selector = commandArgs[0]

      if (!selector) {
        throw new UsageError("Missing required selector for edit.", {
          hint: "Run bn edit <id|path|slug>.",
        })
      }

      const summary = editNote({ selector })

      return {
        exitCode: 0,
        stdout: `Edited note: ${summary.relativePath}\n`,
        stderr: "",
      }
    }

    if (command === "archive") {
      const selector = commandArgs[0]

      if (!selector) {
        throw new UsageError("Missing required selector for archive.", {
          hint: "Run bn archive <id|path|slug>.",
        })
      }

      const summary = archiveNote({ selector })

      return {
        exitCode: 0,
        stdout: `Archived note: ${summary.relativePath}\n`,
        stderr: "",
      }
    }

    if (command === "list") {
      const summaries = listNotes()
      const stdout = summaries
        .map((summary) => `${summary.title}\t${summary.key}\t${summary.description}\t${summary.relativePath}`)
        .join("\n")

      return {
        exitCode: 0,
        stdout: stdout === "" ? "" : `${stdout}\n`,
        stderr: "",
      }
    }

    if (command === "search") {
      const query = commandArgs.join(" ").trim()

      if (query === "") {
        throw new UsageError("Missing required query for search.", {
          hint: 'Run bn search "keywords".',
        })
      }

      const matches = searchNotes(query)
      const stdout = matches.map((match) => `${match.id}\t${match.titleSnippet}\t${match.pathSnippet}`).join("\n")

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
          hint: "Run bn show <key|path|slug>.",
        })
      }

      const shown = showNote({ selector })

      return {
        exitCode: 0,
        stdout: `Title: ${shown.title}\nKey: ${shown.key}\nPath: ${shown.relativePath}\nDescription: ${shown.description}\n\n${shown.body}`,
        stderr: "",
      }
    }

    if (command === "rebuild") {
      const summary = rebuildIndexes()

      if (summary.validationErrors.length > 0) {
        return {
          exitCode: 2,
          stdout: "",
          stderr: `Validation failed while rebuilding indexes.\n${summary.validationErrors.join("\n")}\n`,
        }
      }

      return {
        exitCode: 0,
        stdout: `Rebuilt indexes for ${summary.noteCount} note(s).\n`,
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
