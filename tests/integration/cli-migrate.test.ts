import { test } from "bun:test"
import assert from "node:assert/strict"

import { runCli } from "../helpers/cli"

test("bn migrate is not part of the Phase 7 command surface", () => {
  const result = runCli(["migrate"])

  assert.equal(result.exitCode, 1)
  assert.equal(result.stdout, "")
  assert.match(result.stderr, /Unknown command: migrate/)
  assert.match(result.stderr, /Use --help to see available commands/)
})
