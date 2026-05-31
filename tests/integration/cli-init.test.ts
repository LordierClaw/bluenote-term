import { test } from "bun:test"
import assert from "node:assert/strict"
import path from "node:path"
import { access, mkdir, readFile } from "node:fs/promises"

import { STORAGE_SCHEMA_VERSION } from "../../src/config/root"
import { assertManagedRootLayout, createBlockedRootFixture, createManagedRootHarness, runCli } from "../helpers/cli"

test("bn init exits 0 and reports the initialized root", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-init-")

  try {
    const result = harness.run(["init"])

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.match(result.stdout, new RegExp(`Initialized BlueNote root: ${harness.escapeForRegExp(harness.rootPath)}`))
    await assertManagedRootLayout(harness.rootPath)

    await access(path.join(harness.rootPath, ".data", "manifest.json"))

    const manifestJson = await readFile(path.join(harness.rootPath, ".data", "manifest.json"), "utf8")
    assert.deepEqual(JSON.parse(manifestJson), { schemaVersion: STORAGE_SCHEMA_VERSION })
    await assert.rejects(access(path.join(harness.rootPath, ".state")))
    await assert.rejects(access(path.join(harness.rootPath, ".bluenote")))
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

test("bn init migrates existing .state metadata into .data without rewriting notes", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-init-state-migration-")

  try {
    const relativePath = path.join("notes", "inbox", "plain.md")
    const noteBody = "Plain note body must remain byte-for-byte unchanged.\n"
    const sidecarJson = `${JSON.stringify(
      {
        key: "plain",
        title: "Plain",
        description: "Plain note body must remain byte-for-byte unchanged.",
        relativePath,
        createdAt: "2026-05-21T10:15:00.000Z",
        updatedAt: "2026-05-21T10:15:00.000Z",
        archivedAt: null,
        namingVersion: 1,
      },
      null,
      2,
    )}\n`

    await harness.writeNote(relativePath, noteBody)
    await harness.writeNote(
      path.join(".state", "manifest.json"),
      `${JSON.stringify({ schemaVersion: STORAGE_SCHEMA_VERSION }, null, 2)}\n`,
    )
    await harness.writeNote(path.join(".state", "notes", "plain.json"), sidecarJson)

    const result = harness.run(["init"])

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    await access(path.join(harness.rootPath, ".data", "manifest.json"))
    await access(path.join(harness.rootPath, ".data", "notes", "plain.json"))
    assert.equal(await readFile(path.join(harness.rootPath, relativePath), "utf8"), noteBody)
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

test("bn init reports a user-facing error when writing .data/manifest.json fails", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-init-manifest-error-")

  try {
    await mkdir(path.join(harness.rootPath, ".data", "manifest.json"), { recursive: true })

    const result = harness.run(["init"])

    assert.equal(result.exitCode, 1)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /Could not initialize BlueNote root at/)
    assert.match(result.stderr, /Hint: Ensure BLUENOTE_ROOT points to a writable directory path\./)
    assert.doesNotMatch(result.stderr, /manifest\.json|EISDIR|Error:|stack/i)
  } finally {
    await harness.cleanup()
  }
})
