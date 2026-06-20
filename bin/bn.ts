#!/usr/bin/env bun
import pkg from "../package.json"
import { runCliAsync } from "../src/cli/entry"

const result = await runCliAsync(process.argv.slice(2), pkg.version)

if (result.stdout) {
  process.stdout.write(result.stdout)
}

if (result.stderr) {
  process.stderr.write(result.stderr)
}

process.exit(result.exitCode)
