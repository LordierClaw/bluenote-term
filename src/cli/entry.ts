import {
  AppError,
  isValidationOrDataError,
  UsageError,
} from "../core/errors"
import type { CliResult } from "../core/types"
import { archiveNote } from "../core/archive-note"
import { createNote } from "../core/create-note"
import { deleteNote } from "../core/delete-note"
import { editNote } from "../core/edit-note"
import { initRoot } from "../core/init-root"
import { listNotes } from "../core/list-notes"
import { migrateStorage, type MigrateStorageOptions } from "../core/migrate-storage"
import { rebuildIndexes, type RebuildIndexesOptions } from "../core/rebuild-indexes"
import { searchNotes, type SearchNoteMatch } from "../core/search-notes"
import { showNote } from "../core/show-note"
import { desktopClipboard, type ClipboardRuntime } from "../platform/clipboard"
import { runTuiCli } from "../tui/app"
import { runAiCli, type AiCliRuntimeOptions } from "./ai"

export interface CliRuntimeOptions {
  createNoteOptions?: Pick<Parameters<typeof createNote>[0], "clock" | "randomSource">
  migrateStorageOptions?: Pick<MigrateStorageOptions, "clock" | "randomSource">
  rebuildIndexesOptions?: Pick<RebuildIndexesOptions, "testHooks">
  tuiRunner?: () => CliResult
  ai?: AiCliRuntimeOptions
  clipboard?: ClipboardRuntime
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

interface ParsedNewArgs {
  title?: string
  path?: string
  useClipboard: boolean
  body?: string
}

function parseNewArgs(args: string[]): ParsedNewArgs {
  const positional: string[] = []
  let title: string | undefined
  let destinationPath: string | undefined
  let useClipboard = false

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if (arg === "--title") {
      const value = args[index + 1]

      if (value === undefined || value.startsWith("--")) {
        throw new UsageError("Missing value for --title.", { hint: 'Pass --title "...".' })
      }

      title = value
      index += 1
      continue
    }

    if (arg === "--path") {
      const value = args[index + 1]

      if (value === undefined || value.startsWith("--")) {
        throw new UsageError("Missing value for --path.", { hint: "Pass --path note/<folder>." })
      }

      destinationPath = value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "")
      index += 1
      continue
    }

    if (arg === "--clipboard") {
      useClipboard = true
      continue
    }

    if (arg.startsWith("--")) {
      throw new UsageError(`Unknown option for new note: ${arg}.`, {
        hint: "Run bn new --help for available new-note options.",
      })
    }

    positional.push(arg)
  }

  if (positional.length > 1) {
    throw new UsageError("Too many positional body arguments for new note.", {
      hint: 'Quote the note body as one argument, e.g. bn new "Body text".',
    })
  }

  return { title, path: destinationPath, useClipboard, body: positional[0] }
}

function readNewNoteBody(parsed: ParsedNewArgs, runtime: CliRuntimeOptions): string {
  const hasPositionalBody = parsed.body !== undefined

  if (hasPositionalBody && parsed.useClipboard) {
    throw new UsageError("Choose either positional body or --clipboard, not both.", {
      hint: 'Run bn new "Body text" or bn new --clipboard.',
    })
  }

  if (!hasPositionalBody && !parsed.useClipboard) {
    throw new UsageError("Missing note body for new note.", {
      hint: 'Pass a positional body or use --clipboard, e.g. bn new "Body text".',
    })
  }

  if (hasPositionalBody) {
    return parsed.body ?? ""
  }

  try {
    const clipboardBody = (runtime.clipboard ?? desktopClipboard).readText()

    if (clipboardBody.length === 0) {
      throw new UsageError("Clipboard is empty or unavailable.", {
        hint: 'Copy note text first, or pass a body directly with bn new "Body text".',
      })
    }

    return clipboardBody
  } catch (error) {
    if (error instanceof UsageError) throw error

    throw new UsageError("Clipboard is empty or unavailable.", {
      hint: 'Copy note text first, or pass a body directly with bn new "Body text".',
      cause: error,
    })
  }
}

function assertNewNotePathIsAllowed(destinationPath: string | undefined, title: string | undefined): void {
  if (destinationPath === undefined) {
    return
  }

  if (title === undefined || title.trim().length === 0) {
    throw new UsageError("--path requires --title for normal note creation.", {
      hint: 'Run bn new --path note/<folder> --title "Title" "Body text".',
    })
  }

  if (destinationPath !== "note" && !destinationPath.startsWith("note/")) {
    throw new UsageError("--path must point to an existing folder under note/.", {
      hint: "Use --path note or an existing note/<folder> destination.",
    })
  }
}

export function formatHelp(version: string): string {
  return [
    `BlueNote v${version}`,
    "Local-first terminal notes for plain-note storage and selector-friendly workflows",
    "",
    "Usage:",
    "  bn <command> [options]",
    "",
    "Commands:",
    "  --help       Show this message",
    "  --version    Print the current version",
    "  init         Initialize the managed BlueNote root",
    "  new          [--title <title>] [--path note/<folder>] [--clipboard] <body>",
    "               Create a draft from body text or clipboard; --path creates a normal note",
    "  list         List active notes as title, key, description, and path",
    "  show         <key|path>  Print a matching note summary and body",
    "  search       <query>          Search indexed notes",
    "  edit         <key|path>  Open a matching note in $EDITOR",
    "  archive      <key|path>  Archive a matching note",
    "  delete       <key|path> --force  Permanently remove a matching note and sidecar",
    "  rebuild      Rebuild derived metadata and search indexes",
    "  migrate      Convert frontmatter notes into plain files + sidecars",
    "  tui          Launch the terminal UI workspace",
    "  ai           Configure and run opt-in AI description generation",
  ].join("\n") + "\n"
}

export async function runCliAsync(args: string[], version: string, runtime: CliRuntimeOptions = {}): Promise<CliResult> {
  try {
    if (args[0] === "ai") {
      return await runAiCli(args.slice(1), runtime.ai)
    }

    return runCli(args, version, runtime)
  } catch (error) {
    if (error instanceof AppError) {
      return formatCliError(error)
    }

    throw error
  }
}

export function formatSearchMatches(query: string, matches: SearchNoteMatch[]): string {
  if (matches.length === 0) {
    return `No notes matched \"${query}\".\n`
  }

  return matches.map((match) => {
    const lines = [
      match.title,
      `  key: ${match.key}`,
      `  path: ${match.relativePath}`,
      `  match: ${match.match.label}`,
    ]

    if (match.match.excerpt) {
      lines.push("  excerpt:")
      lines.push(`    ${match.match.excerpt}`)
    }

    return lines.join("\n")
  }).join("\n\n") + "\n"
}

export function formatMigrateCliResult(summary: ReturnType<typeof migrateStorage>): CliResult {
  if (summary.status === "noop") {
    return {
      exitCode: 0,
      stdout:
        summary.reason === "new-format"
          ? "BlueNote storage is already migrated; nothing to do.\n"
          : "BlueNote root is empty; nothing to migrate.\n",
      stderr: "",
    }
  }

  const keyMapLines = Object.entries(summary.keyMap)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([previousId, nextKey]) => `Key map: ${previousId} -> ${nextKey}`)
  const stdoutLines = [`Migrated ${summary.migratedNoteCount} legacy note(s) to plain-note + sidecar storage.`, ...keyMapLines]

  return {
    exitCode: 0,
    stdout: `${stdoutLines.join("\n")}\n`,
    stderr: "",
  }
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

    if (command === "tui") {
      return (runtime.tuiRunner ?? runTuiCli)()
    }

    if (command === "new") {
      const parsed = parseNewArgs(commandArgs)
      const body = readNewNoteBody(parsed, runtime)

      assertNewNotePathIsAllowed(parsed.path, parsed.title)

      const summary = createNote({
        title: parsed.title,
        body,
        type: parsed.path === undefined ? "draft" : "normal",
        ...(parsed.path === undefined ? {} : { destinationFolder: parsed.path }),
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
          hint: "Run bn edit <key|path>.",
        })
      }

      const summary = editNote({ selector })
      const renameLine =
        summary.previousKey !== undefined && summary.key !== undefined && summary.previousKey !== summary.key
          ? `Renamed key: ${summary.previousKey} -> ${summary.key}\n`
          : ""

      return {
        exitCode: 0,
        stdout: `Edited note: ${summary.relativePath}\n${renameLine}`,
        stderr: "",
      }
    }

    if (command === "archive") {
      const selector = commandArgs[0]

      if (!selector) {
        throw new UsageError("Missing required selector for archive.", {
          hint: "Run bn archive <key|path>.",
        })
      }

      const summary = archiveNote({ selector })

      return {
        exitCode: 0,
        stdout: `Archived note: ${summary.relativePath}\n`,
        stderr: "",
      }
    }

    if (command === "delete") {
      const selector = commandArgs[0]

      if (!selector) {
        throw new UsageError("Missing required selector for delete.", {
          hint: "Run bn delete <key|path> --force.",
        })
      }

      const summary = deleteNote({
        selector,
        force: commandArgs.includes("--force"),
      })

      return {
        exitCode: 0,
        stdout: `Deleted note: ${summary.relativePath}\n`,
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

      return {
        exitCode: 0,
        stdout: formatSearchMatches(query, matches),
        stderr: "",
      }
    }

    if (command === "show") {
      const selector = commandArgs[0]

      if (!selector) {
        throw new UsageError("Missing required selector for show.", {
          hint: "Run bn show <key|path>.",
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
      const summary = rebuildIndexes(runtime.rebuildIndexesOptions)

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

    if (command === "migrate") {
      return formatMigrateCliResult(migrateStorage(runtime.migrateStorageOptions))
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
