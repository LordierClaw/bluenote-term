import { test } from "bun:test"
import assert from "node:assert/strict"

import { createManagedRootHarness } from "../helpers/cli"

test("real bin/bn.ts entrypoint is TUI-only and points legacy note commands to bluenote", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-storage-ux-e2e-")

  try {
    const helpResult = harness.runBin(["--help"])
    assert.equal(helpResult.exitCode, 0)
    assert.equal(helpResult.stderr, "")
    assert.match(helpResult.stdout, /Usage: bluenote-term \[options\]/)
    assert.match(helpResult.stdout, /Launch the BlueNote terminal UI workspace/)
    assert.doesNotMatch(helpResult.stdout, /(^|\n)\s*(new|list|archive|delete|rebuild|ai)(\s|$)/m)

    for (const command of ["init", "new", "list", "show", "search", "edit", "archive", "delete", "rebuild", "ai"]) {
      const result = harness.runBin([command])
      assert.equal(result.exitCode, 1)
      assert.equal(result.stdout, "")
      assert.equal(result.stderr, `Use bluenote ${command}; bluenote-term is TUI-only.\n`)
    }
  } finally {
    await harness.cleanup()
  }
}, 90_000)
