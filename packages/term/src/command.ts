import type { CliResult } from "@lordierclaw/bluenote-core"

import pkg from "../package.json"
import { runCliAsync } from "./cli/entry"
import { runTuiCliInteractive } from "./tui/app"

export interface TuiCommandWriter {
  write(chunk: string): unknown
}

export interface TuiCommandIO {
  stdout: TuiCommandWriter
  stderr: TuiCommandWriter
}

export interface RunTuiCommandOptions {
  io?: TuiCommandIO
  version?: string
  cliRunner?: (args: string[], version: string) => Promise<CliResult>
  tuiRunner?: () => Promise<CliResult>
}

function writeCliResult(result: CliResult, io: TuiCommandIO): void {
  if (result.stdout) {
    io.stdout.write(result.stdout)
  }

  if (result.stderr) {
    io.stderr.write(result.stderr)
  }
}

async function runAndWrite(resultPromise: Promise<CliResult>, io: TuiCommandIO): Promise<number> {
  const result = await resultPromise
  writeCliResult(result, io)
  return result.exitCode
}

export async function runTuiCommand(_args: string[] = [], options: RunTuiCommandOptions = {}): Promise<number> {
  const io = options.io ?? process
  return runAndWrite((options.tuiRunner ?? runTuiCliInteractive)(), io)
}

export async function runCommand(args: string[], options: RunTuiCommandOptions = {}): Promise<number> {
  const io = options.io ?? process
  const version = options.version ?? pkg.version
  const result = args[0] === "tui"
    ? (options.tuiRunner ?? runTuiCliInteractive)()
    : (options.cliRunner ?? runCliAsync)(args, version)

  return runAndWrite(result, io)
}
