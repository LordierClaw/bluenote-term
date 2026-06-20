#!/usr/bin/env node
import { readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { runTuiCommand } from "../dist/command.js"

const NOTE_COMMANDS = new Set(["init", "new", "list", "show", "search", "edit", "archive", "delete", "rebuild", "ai"])

function resolveBuiltTuiEntrypoint() {
  const binDir = path.dirname(fileURLToPath(import.meta.url))
  const distDir = path.resolve(binDir, "..", "dist")
  const entrypoint = readdirSync(distDir).find((entry) => /^app-.*\.js$/i.test(entry))

  if (!entrypoint) {
    throw new Error(`Missing built TUI entrypoint under ${distDir}`)
  }

  return pathToFileURL(path.join(distDir, entrypoint)).href
}

async function runBuiltTui() {
  try {
    const module = await import(resolveBuiltTuiEntrypoint())
    return module.runTuiCliInteractive()
  } catch (error) {
    return formatBuiltTuiRuntimeError(error)
  }
}

function formatBuiltTuiRuntimeError(error) {
  const message = error instanceof Error ? error.message : String(error)
  const stderr = /bun-ffi-structs|node:ffi/i.test(message)
    ? "The npm-installed @lordierclaw/bluenote-term package cannot launch the full TUI on plain Node.js. Install the built BlueNote terminal artifact instead of the npm PATH package for end-user TUI usage.\n"
    : `Unable to launch the packaged BlueNote TUI runtime: ${message}\n`

  return {
    exitCode: 1,
    stdout: "",
    stderr,
  }
}

async function probeBuiltTuiRuntime() {
  try {
    await import(resolveBuiltTuiEntrypoint())
    return { exitCode: 0, stdout: "BlueNote packaged TUI runtime available.\n", stderr: "" }
  } catch (error) {
    return formatBuiltTuiRuntimeError(error)
  }
}

const args = process.argv.slice(2)
if (NOTE_COMMANDS.has(args[0])) {
  process.stderr.write(`Use bluenote ${args[0]}; bluenote-term is TUI-only.\n`)
  process.exit(1)
}

const exitCode = await runTuiCommand(args, {
  tuiRunner: runBuiltTui,
  probeTuiRuntime: probeBuiltTuiRuntime,
})

process.exit(exitCode)
