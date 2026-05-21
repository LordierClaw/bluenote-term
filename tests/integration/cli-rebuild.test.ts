import test from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import { cp, mkdir, readFile, rm } from "node:fs/promises"

import { createManagedRootHarness } from "../helpers/cli"
import { noteMarkdown } from "../helpers/note-fixtures"

const workspaceRoot = path.resolve(import.meta.dir, "../..")
const fixturesRoot = path.join(workspaceRoot, "tests", "fixtures")

test("bn rebuild scans notes and writes derived artifacts under .bluenote", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-rebuild-")

  try {
    await harness.writeNote(
      path.join("notes", "inbox", "alpha.md"),
      noteMarkdown({ id: "note-alpha", title: "Alpha Note", body: "Alpha body.\n" }),
    )

    const firstResult = harness.run(["rebuild"])

    assert.equal(firstResult.exitCode, 0)
    assert.equal(firstResult.stderr, "")
    assert.match(firstResult.stdout, /Rebuilt indexes for 1 note\(s\)\./)

    const metadataPath = path.join(harness.rootPath, ".bluenote", "metadata.sqlite")
    const searchPath = path.join(harness.rootPath, ".bluenote", "search-index.json")

    assert.equal(await Bun.file(metadataPath).exists(), true)
    assert.equal(await Bun.file(searchPath).exists(), true)

    await rm(metadataPath, { force: true })
    await rm(searchPath, { force: true })

    const secondResult = harness.run(["rebuild"])

    assert.equal(secondResult.exitCode, 0)
    assert.equal(secondResult.stderr, "")
    assert.equal(await Bun.file(metadataPath).exists(), true)
    assert.equal(await Bun.file(searchPath).exists(), true)
  } finally {
    await harness.cleanup()
  }
})

test("bn rebuild exits 2 and reports duplicate IDs as validation failures", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-rebuild-duplicate-")

  try {
    await cp(path.join(fixturesRoot, "duplicate-ids"), path.join(harness.rootPath, "notes"), { recursive: true })

    const result = harness.run(["rebuild"])

    assert.equal(result.exitCode, 2)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /Validation failed while rebuilding indexes\./)
    assert.match(result.stderr, /Duplicate note id 'duplicate-note'/)
    assert.match(result.stderr, /duplicate-a\.md/)
    assert.match(result.stderr, /duplicate-b\.md/)
  } finally {
    await harness.cleanup()
  }
})

test("bn rebuild exits 2 and surfaces exact invalid frontmatter file errors", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-rebuild-invalid-")

  try {
    await mkdir(path.join(harness.rootPath, "notes", "inbox"), { recursive: true })
    const invalidFixturePath = path.join(fixturesRoot, "invalid-frontmatter", "missing-title.md")
    await Bun.write(
      path.join(harness.rootPath, "notes", "inbox", "missing-title.md"),
      await readFile(invalidFixturePath, "utf8"),
    )

    const result = harness.run(["rebuild"])

    assert.equal(result.exitCode, 2)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /Validation failed while rebuilding indexes\./)
    assert.match(result.stderr, /notes[\\/]inbox[\\/]missing-title\.md/)
    assert.match(result.stderr, /missing required field 'title'/)
  } finally {
    await harness.cleanup()
  }
})
