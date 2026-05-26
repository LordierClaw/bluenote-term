#!/usr/bin/env bun
import pkg from "../package.json"
import { runCli } from "../src/cli/entry"
import { runTuiCliInteractive } from "../src/tui/app"

const args = process.argv.slice(2)
const result = args[0] === "tui"
  ? await runTuiCliInteractive()
  : runCli(args, pkg.version)

if (result.stdout) {
  process.stdout.write(result.stdout)
}

if (result.stderr) {
  process.stderr.write(result.stderr)
}

process.exit(result.exitCode)
