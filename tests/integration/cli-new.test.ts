import { test } from "bun:test"
import assert from "node:assert/strict"
import path from "node:path"
import { readdir, readFile } from "node:fs/promises"

import { assertManagedRootLayout, createBlockedRootFixture, createManagedRootHarness, runCli } from "../helpers/cli"

const FIXED_TIMESTAMP = "2026-05-24T12:00:00.000Z"

function extractCreatedKey(stdout: string): string {
  const match = stdout.match(/^Created note\nKey: (.+)\nPath: note[\\/](.+)\.md\n$/)

  assert.notEqual(match, null)
  assert.equal(match?.[1], match?.[2])

  return match?.[1] ?? ""
}

test("bn new --path note --title \"Example\" creates a normal plain note plus sidecar and prints key + path", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-new-")

  try {
    const result = harness.run(["new", "--path", "note", "--title", "Example", "Example body"], {
      BLUENOTE_TEST_NOW: FIXED_TIMESTAMP,
      BLUENOTE_TEST_RANDOM_SEQUENCE: "0x12345678",
    })

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.equal(result.stdout, "Created note\nKey: example-51u7i0\nPath: note/example-51u7i0.md\n")

    await assertManagedRootLayout(harness.rootPath)

    const noteFiles = await readdir(path.join(harness.rootPath, "note"))
    assert.deepEqual(noteFiles, ["example-51u7i0.md"])

    const notePath = path.join(harness.rootPath, "note", noteFiles[0])
    const markdown = await readFile(notePath, "utf8")
    assert.equal(markdown, "Example body")

    const sidecar = JSON.parse(await readFile(path.join(harness.rootPath, ".data", "notes", "example-51u7i0.json"), "utf8"))
    assert.deepEqual(sidecar, {
      type: "normal",
      key: "example-51u7i0",
      title: "Example",
      description: "Example body",
      relativePath: "note/example-51u7i0.md",
      createdAt: FIXED_TIMESTAMP,
      updatedAt: FIXED_TIMESTAMP,
      archivedAt: null,
      namingVersion: 1,
    })
  } finally {
    await harness.cleanup()
  }
})

test("bn new auto-rebuilds indexes so the created normal note appears in bn list immediately", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-new-rebuild-")

  try {
    const createResult = harness.run(["new", "--path", "note", "--title", "Mission Log", "Mission body"], {
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
      "Mission Log\tmission-log-51u7i0\tMission body\tnote/mission-log-51u7i0.md\n",
    )
  } finally {
    await harness.cleanup()
  }
}, 15_000)

test("bn new reports auto-rebuild validation failures after creating the note", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-new-rebuild-error-")

  try {
    await harness.writeNote("note/orphaned.md", "Orphaned note body.\n")

    const result = harness.run(["new", "--path", "note", "--title", "Fresh Note", "Fresh body"], {
      BLUENOTE_TEST_NOW: FIXED_TIMESTAMP,
      BLUENOTE_TEST_RANDOM_SEQUENCE: "0x12345678",
    })

    assert.equal(result.exitCode, 2)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /Created note 'fresh-note-51u7i0', but derived indexes could not be rebuilt\./)
    assert.match(result.stderr, /Could not read sidecar '\.data[\\/]notes[\\/]orphaned\.json'\./)
    assert.match(result.stderr, /Hint: Run bn rebuild after fixing the reported validation errors\./)

    const createdNotePath = path.join(harness.rootPath, "note", "fresh-note-51u7i0.md")
    assert.equal(await readFile(createdNotePath, "utf8"), "Fresh body")

    const createdSidecar = JSON.parse(
      await readFile(path.join(harness.rootPath, ".data", "notes", "fresh-note-51u7i0.json"), "utf8"),
    )
    assert.equal(createdSidecar.key, "fresh-note-51u7i0")

    const metadataDatabasePath = path.join(harness.rootPath, ".state", "metadata.sqlite")
    await assert.rejects(() => readFile(metadataDatabasePath, "utf8"))
  } finally {
    await harness.cleanup()
  }
})

test("repeated note creation produces distinct keys", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-new-distinct-")

  try {
    const firstResult = harness.run(["new", "--path", "note", "--title", "Example", "First body"], {
      BLUENOTE_TEST_NOW: FIXED_TIMESTAMP,
      BLUENOTE_TEST_RANDOM_SEQUENCE: "0x12345678",
    })
    const secondResult = harness.run(["new", "--path", "note", "--title", "Example", "Second body"], {
      BLUENOTE_TEST_NOW: FIXED_TIMESTAMP,
      BLUENOTE_TEST_RANDOM_SEQUENCE: "0x76543210",
    })

    assert.equal(firstResult.exitCode, 0)
    assert.equal(secondResult.exitCode, 0)
    assert.equal(extractCreatedKey(firstResult.stdout), "example-51u7i0")
    assert.equal(extractCreatedKey(secondResult.stdout), "example-wtycr4")

    const noteFiles = await readdir(path.join(harness.rootPath, "note"))
    assert.deepEqual(noteFiles.sort(), ["example-51u7i0.md", "example-wtycr4.md"])
  } finally {
    await harness.cleanup()
  }
}, 15_000)

test("bn new retries when an orphaned sidecar collides with the first generated key", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-new-sidecar-collision-")

  try {
    await Bun.write(
      path.join(harness.rootPath, ".data", "notes", "example-51u7i0.json"),
      JSON.stringify(
        {
          type: "normal",
          key: "example-51u7i0",
          title: "Orphaned Example",
          description: "",
          relativePath: "note/example-51u7i0.md",
          createdAt: FIXED_TIMESTAMP,
          updatedAt: FIXED_TIMESTAMP,
          archivedAt: null,
          namingVersion: 1,
        },
        null,
        2,
      ) + "\n",
    )

    const result = harness.run(["new", "--path", "note", "--title", "Example", "Example body"], {
      BLUENOTE_TEST_NOW: FIXED_TIMESTAMP,
      BLUENOTE_TEST_RANDOM_SEQUENCE: "0x12345678,0x76543210",
    })

    assert.equal(result.exitCode, 2)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /Created note 'example-wtycr4', but derived indexes could not be rebuilt\./)
    assert.match(result.stderr, /Sidecar '\.data[\\/]notes[\\/]example-51u7i0\.json' points to missing note 'note[\\/]example-51u7i0\.md'\./)
    assert.doesNotMatch(result.stderr, /Could not create note 'note[\\/]example-51u7i0\.md'\./)

    const noteFiles = await readdir(path.join(harness.rootPath, "note"))
    assert.deepEqual(noteFiles, ["example-wtycr4.md"])
    assert.equal(
      JSON.parse(await readFile(path.join(harness.rootPath, ".data", "notes", "example-51u7i0.json"), "utf8")).key,
      "example-51u7i0",
    )
    assert.equal(
      JSON.parse(await readFile(path.join(harness.rootPath, ".data", "notes", "example-wtycr4.json"), "utf8")).key,
      "example-wtycr4",
    )
  } finally {
    await harness.cleanup()
  }
})

test("bn new surfaces repository filesystem failures as CLI errors", async () => {
  const fixture = await createBlockedRootFixture("bluenote-cli-new-error-")

  try {
    const result = runCli(["new", "--path", "note", "--title", "Example", "Example body"], { rootPath: fixture.blockedRoot })

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
