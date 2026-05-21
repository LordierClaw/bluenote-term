import test from "node:test"
import assert from "node:assert/strict"

import { formatHelp, runCli } from "../../src/cli/entry"

test("formatHelp lists all Phase 1 commands with actionable usage", () => {
  const help = formatHelp("0.1.0")

  assert.match(help, /BlueNote/)
  assert.match(help, /Usage:\n  bn <command> \[options\]/)
  assert.match(help, /--help/)
  assert.match(help, /--version/)
  assert.match(help, /init\s+Initialize the managed BlueNote root/)
  assert.match(help, /new\s+--title <title>/)
  assert.match(help, /list\s+List note summaries/)
  assert.match(help, /show\s+<id\|path\|slug>/)
  assert.match(help, /search\s+<query>/)
  assert.match(help, /edit\s+<id\|path\|slug>/)
  assert.match(help, /archive\s+<id\|path\|slug>/)
  assert.match(help, /rebuild\s+Rebuild derived metadata and search indexes/)
})

test("runCli returns version output for --version", () => {
  const result = runCli(["--version"], "0.1.0")

  assert.equal(result.exitCode, 0)
  assert.equal(result.stdout, "0.1.0\n")
  assert.equal(result.stderr, "")
})

test("runCli returns help output by default", () => {
  const result = runCli([], "0.1.0")

  assert.equal(result.exitCode, 0)
  assert.match(result.stdout, /BlueNote/)
  assert.equal(result.stderr, "")
})

test("runCli rejects unknown commands with guidance", () => {
  const result = runCli(["unknown"], "0.1.0")

  assert.equal(result.exitCode, 1)
  assert.match(result.stderr, /Unknown command: unknown/)
  assert.match(result.stderr, /Use --help/)
  assert.match(result.stderr, /available commands/)
})
