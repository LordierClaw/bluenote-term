import type { CliResult } from "@lordierclaw/bluenote-core"

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
  probeTuiRuntime?: () => Promise<CliResult>
  env?: Record<string, string | undefined>
}

export declare function runTuiCommand(args?: string[], options?: RunTuiCommandOptions): Promise<number>

export declare function runCommand(args: string[], options?: RunTuiCommandOptions): Promise<number>
