import test from "node:test"
import assert from "node:assert/strict"

import { formatHelp, runCli } from "../../src/cli/entry"

test("formatHelp includes scaffold message and primary commands", () => {
  const help = formatHelp("0.1.0")

  assert.match(help, /BlueNote/)
  assert.match(help, /Scaffold status: preparation phase/)
  assert.match(help, /--help/)
  assert.match(help, /--version/)
  assert.match(help, /tui/)
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
})
