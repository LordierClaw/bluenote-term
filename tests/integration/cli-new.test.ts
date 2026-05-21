import test from "node:test"
import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import { mkdtemp, readdir, readFile } from "node:fs/promises"

import { parseNoteFile } from "../../src/storage/frontmatter"
import { assertManagedRootLayout, createBlockedRootFixture, createManagedRootHarness, runCli } from "../helpers/cli"

test("bn new --title \"Example\" creates a note, initializes the managed root, and returns a created path", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-new-")

  try {
    const result = harness.run(["new", "--title", "Example"])

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.match(result.stdout, /^Created note: notes\/inbox\/.+\.md\n$/)

    await assertManagedRootLayout(harness.rootPath)

    const noteFiles = await readdir(path.join(harness.rootPath, "notes", "inbox"))
    assert.equal(noteFiles.length, 1)

    const notePath = path.join(harness.rootPath, "notes", "inbox", noteFiles[0])
    const markdown = await readFile(notePath, "utf8")
    const parsedNote = parseNoteFile(markdown, path.join("notes", "inbox", noteFiles[0]))

    assert.equal(parsedNote.frontmatter.title, "Example")
    assert.equal(parsedNote.frontmatter.schemaVersion, 1)
    assert.equal(parsedNote.frontmatter.mode, "plain")
    assert.deepEqual(parsedNote.frontmatter.tags, [])
    assert.equal(parsedNote.frontmatter.id.endsWith(".md"), false)
    assert.equal(parsedNote.body, "")
  } finally {
    await harness.cleanup()
  }
})

test("repeated note creation produces distinct IDs", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-new-distinct-")

  try {
    const firstResult = harness.run(["new", "--title", "Example"])
    const secondResult = harness.run(["new", "--title", "Example"])

    assert.equal(firstResult.exitCode, 0)
    assert.equal(secondResult.exitCode, 0)

    const noteFiles = await readdir(path.join(harness.rootPath, "notes", "inbox"))
    assert.equal(noteFiles.length, 2)

    const firstMarkdown = await readFile(path.join(harness.rootPath, "notes", "inbox", noteFiles[0]), "utf8")
    const secondMarkdown = await readFile(path.join(harness.rootPath, "notes", "inbox", noteFiles[1]), "utf8")
    const firstParsed = parseNoteFile(firstMarkdown, path.join("notes", "inbox", noteFiles[0]))
    const secondParsed = parseNoteFile(secondMarkdown, path.join("notes", "inbox", noteFiles[1]))

    assert.notEqual(firstParsed.frontmatter.id, secondParsed.frontmatter.id)
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
