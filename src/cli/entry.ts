import {
  AppError,
  archiveNote,
  createNote,
  deleteNote,
  initRoot,
  isValidationOrDataError,
  listNotes,
  rebuildIndexes,
  searchNotes,
  showNote,
  UsageError,
  type CliResult,
  type NoteVisibility,
  type RebuildIndexesOptions,
  type SearchNoteMatch,
} from "@bluenote/core"
import { editNote } from "../core/edit-note"
import { desktopClipboard, type ClipboardRuntime } from "../platform/clipboard"
import { runTuiCli } from "../tui/app"
import { runAiCli, type AiCliRuntimeOptions } from "./ai"

export interface CliRuntimeOptions {
  createNoteOptions?: Pick<Parameters<typeof createNote>[0], "clock" | "randomSource">
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

function parseVisibilityArgs(args: string[]): { args: string[]; visibility: NoteVisibility } {
  let visibility: NoteVisibility = "normal"
  let index = 0

  for (; index < args.length; index += 1) {
    const arg = args[index]

    if (arg === "--drafts") {
      if (visibility === "all") {
        throw new UsageError("Choose either --drafts or --all, not both.", {
          hint: "Use --drafts for normal + draft notes, or --all to include archived notes.",
        })
      }

      visibility = "drafts"
      continue
    }

    if (arg === "--all") {
      if (visibility === "drafts") {
        throw new UsageError("Choose either --drafts or --all, not both.", {
          hint: "Use --drafts for normal + draft notes, or --all to include archived notes.",
        })
      }

      visibility = "all"
      continue
    }

    break
  }

  return { args: args.slice(index), visibility }
}

function parseSelectorArgs(command: string, args: string[], options: { requireForce?: boolean } = {}): { selector: string; force: boolean; visibility: NoteVisibility } {
  const selectors: string[] = []
  let force = false
  let visibility: NoteVisibility = "normal"

  for (const arg of args) {
    if (arg === "--drafts") {
      if (visibility === "all") {
        throw new UsageError("Choose either --drafts or --all, not both.", {
          hint: "Use --drafts for normal + draft notes, or --all to include archived notes.",
        })
      }
      visibility = "drafts"
      continue
    }

    if (arg === "--all") {
      if (visibility === "drafts") {
        throw new UsageError("Choose either --drafts or --all, not both.", {
          hint: "Use --drafts for normal + draft notes, or --all to include archived notes.",
        })
      }
      visibility = "all"
      continue
    }

    if (arg === "--force") {
      if (!options.requireForce) {
        throw new UsageError(`${command} does not accept --force.`, {
          hint: `Run bn ${command} <key|path>.`,
        })
      }

      force = true
      continue
    }

    if (arg.startsWith("--")) {
      throw new UsageError(`Unknown option for ${command}: ${arg}.`, {
        hint: `Run bn ${command} <key|path>${options.requireForce ? " --force" : ""}.`,
      })
    }

    selectors.push(arg)
  }

  if (selectors.length === 0) {
    throw new UsageError(`Missing required selector for ${command}.`, {
      hint: `Run bn ${command} <key|path>${options.requireForce ? " --force" : ""}.`,
    })
  }

  if (selectors.length > 1) {
    throw new UsageError(`Too many selectors for ${command}.`, {
      hint: `Run bn ${command} <key|path>${options.requireForce ? " --force" : ""}.`,
    })
  }

  return { selector: selectors[0], force, visibility }
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

    if (arg === "--title" || arg === "-t") {
      const value = args[index + 1]

      if (value === undefined || value.startsWith("-")) {
        throw new UsageError(`Missing value for ${arg}.`, { hint: 'Pass --title "..." or -t "...".' })
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
    "  list         [--drafts|--all]  List notes as title, key, description, and path",
    "  show         [--drafts|--all] <key|path>  Print a matching note summary and body",
    "  search       [--drafts|--all] <query>  Search indexed notes",
    "  edit         [--drafts|--all] <key|path>  Open a matching note in $EDITOR",
    "  archive      [--drafts|--all] <key|path>  Archive a matching normal note",
    "  delete       [--drafts|--all] <key|path> --force  Permanently remove a matching note and sidecar",
    "  rebuild      Rebuild derived metadata and search indexes",
    "  tui          Launch the terminal UI workspace",
    "  ai           Configure and run opt-in AI description generation",
  ].join("\n") + "\n"
}

export function formatNewHelp(): string {
  return [
    "Usage:",
    "  bn new [--title <title>] [--path note/<folder>] [--clipboard] <body>",
    "",
    "Creates a new note from quoted body text or clipboard text.",
    "Without --path, creates a draft under draft/.",
    "With --path note/<folder> and --title, creates a normal note under an existing note folder.",
    "",
    "Options:",
    "  --title, -t <title>  Set the note title",
    "  --path <folder>     Existing note/<folder> destination for a normal note",
    "  --clipboard         Read note body from the clipboard",
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
      if (commandArgs.length === 1 && commandArgs[0] === "--help") {
        return { exitCode: 0, stdout: formatNewHelp(), stderr: "" }
      }

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
      const { selector, visibility } = parseSelectorArgs("edit", commandArgs)

      const summary = editNote({ selector, visibility })
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
      const { selector, visibility } = parseSelectorArgs("archive", commandArgs)

      const summary = archiveNote({ selector, visibility })

      return {
        exitCode: 0,
        stdout: `Archived note: ${summary.relativePath}\n`,
        stderr: "",
      }
    }

    if (command === "delete") {
      const { selector, force, visibility } = parseSelectorArgs("delete", commandArgs, { requireForce: true })

      const summary = deleteNote({
        selector,
        force,
        visibility,
      })

      return {
        exitCode: 0,
        stdout: `Deleted note: ${summary.relativePath}\n`,
        stderr: "",
      }
    }

    if (command === "list") {
      const parsedVisibility = parseVisibilityArgs(commandArgs)
      if (parsedVisibility.args.length > 0) {
        throw new UsageError(`Unknown option for list: ${parsedVisibility.args[0]}.`, {
          hint: "Run bn list [--drafts|--all].",
        })
      }

      const summaries = listNotes({ visibility: parsedVisibility.visibility })
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
      const parsedVisibility = parseVisibilityArgs(commandArgs)
      const query = parsedVisibility.args.join(" ").trim()

      if (query === "") {
        throw new UsageError("Missing required query for search.", {
          hint: 'Run bn search [--drafts|--all] "keywords".',
        })
      }

      const matches = searchNotes(query, { visibility: parsedVisibility.visibility })

      return {
        exitCode: 0,
        stdout: formatSearchMatches(query, matches),
        stderr: "",
      }
    }

    if (command === "show") {
      const { selector, visibility } = parseSelectorArgs("show", commandArgs)

      const shown = showNote({ selector, visibility })

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
