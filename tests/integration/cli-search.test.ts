import test from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import { rm } from "node:fs/promises"

import { createManagedRootHarness } from "../helpers/cli"
import { noteMarkdown } from "../helpers/note-fixtures"
test("bn search <query> returns ranked matches with title and path snippets", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-search-")

  try {
    await harness.writeNote(
      path.join("notes", "inbox", "project-comet.md"),
      noteMarkdown({ id: "note-comet", title: "Project Comet", body: "Project comet planning notes.\n", tags: ["space"] }),
    )
    await harness.writeNote(
      path.join("notes", "journal", "nebula.md"),
      noteMarkdown({
        id: "note-nebula",
        title: "Nebula Retrospective",
        body: "This body mentions project comet once.\n",
        tags: ["space"],
        createdAt: "2026-05-21T11:15:00.000Z",
      }),
    )

    const rebuildResult = harness.run(["rebuild"])
    assert.equal(rebuildResult.exitCode, 0)

    const result = harness.run(["search", "project", "comet"])

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    const stdout = result.stdout
    assert.match(stdout, /^note-comet\s+Project Comet\s+notes[\\/]inbox[\\/]project-comet\.md/m)
    assert.match(stdout, /note-nebula\s+Nebula Retrospective\s+notes[\\/]journal[\\/]nebula\.md/)
    assert.ok(stdout.indexOf("note-comet") < stdout.indexOf("note-nebula"))
  } finally {
    await harness.cleanup()
  }
})

test("bn list and bn search prefer derived index data when available", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-search-index-preferred-")

  try {
    await harness.writeNote(
      path.join("notes", "inbox", "alpha.md"),
      noteMarkdown({ id: "note-alpha", title: "Alpha Note", body: "Alpha body mentions comet.\n" }),
    )

    const rebuildResult = harness.run(["rebuild"])
    assert.equal(rebuildResult.exitCode, 0)

    await rm(path.join(harness.rootPath, "notes"), { recursive: true, force: true })

    const listResult = harness.run(["list"])
    assert.equal(listResult.exitCode, 0)
    assert.match(listResult.stdout, /note-alpha\s+Alpha Note\s+notes[\\/]inbox[\\/]alpha\.md/)

    const searchResult = harness.run(["search", "comet"])
    assert.equal(searchResult.exitCode, 0)
    assert.match(searchResult.stdout, /note-alpha\s+Alpha Note\s+notes[\\/]inbox[\\/]alpha\.md/)
  } finally {
    await harness.cleanup()
  }
})

test("bn search returns actionable rebuild guidance when derived indexes are missing", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-search-missing-index-")

  try {
    await harness.writeNote(
      path.join("notes", "inbox", "alpha.md"),
      noteMarkdown({ id: "note-alpha", title: "Alpha Note", body: "Alpha body mentions comet.\n" }),
    )

    const result = harness.run(["search", "comet"])

    assert.equal(result.exitCode, 2)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /Derived indexes are unavailable\./)
    assert.match(result.stderr, /Hint: Run bn rebuild to recreate \.bluenote artifacts from note files\./)
  } finally {
    await harness.cleanup()
  }
})
