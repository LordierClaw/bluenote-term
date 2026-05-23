import test from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import { readdir, readFile } from "node:fs/promises"

import { assertManagedRootLayout, createBlockedRootFixture, createManagedRootHarness, runCli } from "../helpers/cli"

const FIXED_TIMESTAMP = "2026-05-24T12:00:00.000Z"

function extractCreatedKey(stdout: string): string {
  const match = stdout.match(/^Created note\nKey: (.+)\nPath: notes[\\/]inbox[\\/](.+)\.md\n$/)

  assert.notEqual(match, null)
  assert.equal(match?.[1], match?.[2])

  return match?.[1] ?? ""
}

test("bn new --title \"Example\" creates a plain note plus sidecar and prints key + path", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-new-")

  try {
    const result = harness.run(["new", "--title", "Example"], {
      BLUENOTE_TEST_NOW: FIXED_TIMESTAMP,
      BLUENOTE_TEST_RANDOM_SEQUENCE: "0x12345678",
    })

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.equal(result.stdout, "Created note\nKey: example-51u7i0\nPath: notes/inbox/example-51u7i0.md\n")

    await assertManagedRootLayout(harness.rootPath)

    const noteFiles = await readdir(path.join(harness.rootPath, "notes", "inbox"))
    assert.deepEqual(noteFiles, ["example-51u7i0.md"])

    const notePath = path.join(harness.rootPath, "notes", "inbox", noteFiles[0])
    const markdown = await readFile(notePath, "utf8")
    assert.equal(markdown, "")

    const sidecar = JSON.parse(await readFile(path.join(harness.rootPath, ".state", "notes", "example-51u7i0.json"), "utf8"))
    assert.deepEqual(sidecar, {
      key: "example-51u7i0",
      title: "Example",
      description: "",
      relativePath: path.join("notes", "inbox", "example-51u7i0.md"),
      createdAt: FIXED_TIMESTAMP,
      updatedAt: FIXED_TIMESTAMP,
      archivedAt: null,
      namingVersion: 1,
    })
  } finally {
    await harness.cleanup()
  }
})

test("bn new auto-rebuilds indexes so the created note appears in bn list immediately", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-new-rebuild-")

  try {
    const createResult = harness.run(["new", "--title", "Mission Log"], {
      BLUENOTE_TEST_NOW: FIXED_TIMESTAMP,
      BLUENOTE_TEST_RANDOM_SEQUENCE: "0x12345678",
    })

    assert.equal(createResult.exitCode, 0)
    assert.equal(createResult.stderr, "")
    assert.equal(extractCreatedKey(createResult.stdout), "mission-log-51u7i0")

    const listResult = harness.run(["list"])

    assert.equal(listResult.exitCode, 0)
    assert.equal(listResult.stderr, "")
    assert.equal(
      listResult.stdout,
      "Mission Log\tmission-log-51u7i0\t\tnotes/inbox/mission-log-51u7i0.md\n",
    )
  } finally {
    await harness.cleanup()
  }
})

test("repeated note creation produces distinct keys", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-new-distinct-")

  try {
    const firstResult = harness.run(["new", "--title", "Example"], {
      BLUENOTE_TEST_NOW: FIXED_TIMESTAMP,
      BLUENOTE_TEST_RANDOM_SEQUENCE: "0x12345678",
    })
    const secondResult = harness.run(["new", "--title", "Example"], {
      BLUENOTE_TEST_NOW: FIXED_TIMESTAMP,
      BLUENOTE_TEST_RANDOM_SEQUENCE: "0x76543210",
    })

    assert.equal(firstResult.exitCode, 0)
    assert.equal(secondResult.exitCode, 0)
    assert.equal(extractCreatedKey(firstResult.stdout), "example-51u7i0")
    assert.equal(extractCreatedKey(secondResult.stdout), "example-wtycr4")

    const noteFiles = await readdir(path.join(harness.rootPath, "notes", "inbox"))
    assert.deepEqual(noteFiles.sort(), ["example-51u7i0.md", "example-wtycr4.md"])
  } finally {
    await harness.cleanup()
  }
})

test("bn new surfaces repository filesystem failures as CLI errors", async () => {
  const fixture = await createBlockedRootFixture("bluenote-cli-new-error-")

  try {
    const result = runCli(["new", "--title", "Example"], { rootPath: fixture.blockedRoot })

    assert.equal(result.exitCode, 1)
    assert.equal(result.stdout, "")
    assert.equal(
      result.stderr,
      [
        "Could not initialize BlueNote root at '" + path.resolve(fixture.blockedRoot) + "'.",
        "Hint: Ensure BLUENOTE_ROOT points to a writable directory path.",
        "",
      ].join("\n"),
    )
  } finally {
    await fixture.cleanup()
  }
})
