import test from "node:test"
import assert from "node:assert/strict"
import path from "node:path"

import { assertManagedRootLayout, createBlockedRootFixture, createManagedRootHarness, runCli } from "../helpers/cli"

test("bn init exits 0 and reports the initialized root", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-init-")

  try {
    const result = harness.run(["init"])

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.match(result.stdout, new RegExp(`Initialized BlueNote root: ${harness.escapeForRegExp(harness.rootPath)}`))
    await assertManagedRootLayout(harness.rootPath)
  } finally {
    await harness.cleanup()
  }
})

test("bn init is idempotent on subsequent runs", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-init-idempotent-")

  try {
    const firstResult = harness.run(["init"])
    const secondResult = harness.run(["init"])

    assert.equal(firstResult.exitCode, 0)
    assert.equal(secondResult.exitCode, 0)
    assert.equal(secondResult.stderr, "")
    assert.match(secondResult.stdout, new RegExp(`Initialized BlueNote root: ${harness.escapeForRegExp(harness.rootPath)}`))
    await assertManagedRootLayout(harness.rootPath)
  } finally {
    await harness.cleanup()
  }
})

test("bn init reports a user-facing error when BLUENOTE_ROOT points to a file", async () => {
  const fixture = await createBlockedRootFixture("bluenote-cli-init-error-")

  try {
    const result = runCli(["init"], { rootPath: fixture.blockedRoot })

    assert.equal(result.exitCode, 1)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /Could not initialize BlueNote root at/)
    assert.match(result.stderr, /Hint: Ensure BLUENOTE_ROOT points to a writable directory path\./)
    assert.doesNotMatch(result.stderr, /at runCli|Error:|stack/i)
  } finally {
    await fixture.cleanup()
  }
})
