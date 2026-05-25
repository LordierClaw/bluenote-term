import { test } from "bun:test"
import assert from "node:assert/strict"

import { createManagedRootHarness } from "../helpers/cli"

test("bn tui shows a friendly missing-root startup state instead of crashing", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-tui-missing-root-")

  try {
    const result = harness.runBin(["tui"])

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.match(result.stdout, /BlueNote root missing/u)
    assert.match(result.stdout, /BlueNote root is not initialized\./u)
    assert.match(result.stdout, /Run 'bn init' first\./u)
    assert.doesNotMatch(result.stdout, /Unknown command: tui|TypeError|ReferenceError/u)
  } finally {
    await harness.cleanup()
  }
})