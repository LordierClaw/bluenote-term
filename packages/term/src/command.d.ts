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
  tuiRunner?: () => Promise<CliResult>
  probeTuiRuntime?: () => Promise<CliResult>
  env?: Record<string, string | undefined>
}

export declare function runTuiCommand(args?: string[], options?: RunTuiCommandOptions): Promise<number>
