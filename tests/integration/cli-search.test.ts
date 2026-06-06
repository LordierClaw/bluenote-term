import { test } from "bun:test"
import assert from "node:assert/strict"
import path from "node:path"
import { rm } from "node:fs/promises"

import { createManagedRootHarness } from "../helpers/cli"
import { noteMarkdown } from "../helpers/note-fixtures"

test("bn search <query> returns grouped note blocks with ranked match details", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-search-")

  try {
    await harness.writeNote(
      "notes/inbox/project-comet.md",
      noteMarkdown({ id: "note-comet", title: "Project Comet", body: "Project comet planning notes.\n", tags: ["space"] }),
    )
    await harness.writeNote(
      "notes/journal/nebula.md",
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
    assert.match(stdout, /^Project Comet\n  key: note-comet\n  path: notes[\\/]inbox[\\/]project-comet\.md\n  match: title/m)
    assert.match(stdout, /Nebula Retrospective\n  key: note-nebula\n  path: notes[\\/]journal[\\/]nebula\.md\n  match: description/)
    assert.ok(stdout.indexOf("Project Comet") < stdout.indexOf("Nebula Retrospective"))
  } finally {
    await harness.cleanup()
  }
}, 15_000)

test("bn list and bn search prefer derived index data when available", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-search-index-preferred-")

  try {
    await harness.writeNote(
      "notes/inbox/alpha.md",
      noteMarkdown({ id: "note-alpha", title: "Alpha Note", body: "Alpha body mentions comet.\n" }),
    )

    const rebuildResult = harness.run(["rebuild"])
    assert.equal(rebuildResult.exitCode, 0)

    await rm(path.join(harness.rootPath, "notes"), { recursive: true, force: true })

    const listResult = harness.run(["list"])
    assert.equal(listResult.exitCode, 0)
    assert.match(listResult.stdout, /Alpha Note\s+note-alpha\s+Alpha body mentions comet\.\s+notes[\\/]inbox[\\/]alpha\.md/)

    const searchResult = harness.run(["search", "comet"])
    assert.equal(searchResult.exitCode, 0)
    assert.match(searchResult.stdout, /^Alpha Note\n  key: note-alpha\n  path: notes[\\/]inbox[\\/]alpha\.md\n  match: description/m)
  } finally {
    await harness.cleanup()
  }
}, 15_000)

test("bn search returns a calm no-result message when nothing matches", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-search-no-results-")

  try {
    await harness.writeNote(
      "notes/inbox/alpha.md",
      noteMarkdown({ id: "note-alpha", title: "Alpha Note", body: "Alpha body mentions comet.\n" }),
    )

    const rebuildResult = harness.run(["rebuild"])
    assert.equal(rebuildResult.exitCode, 0)

    const result = harness.run(["search", "saturn"])

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.equal(result.stdout, 'No notes matched "saturn".\n')
  } finally {
    await harness.cleanup()
  }
}, 15_000)

test("bn search 123 only prints notes with fields containing 123", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-search-contains-numeric-")

  try {
    await harness.writeNote(
      "notes/inbox/receipt.md",
      noteMarkdown({ id: "note-receipt", title: "Receipt 123", body: "Purchase details.\n" }),
    )
    await harness.writeNote(
      "notes/meetings/meeting-123.md",
      noteMarkdown({ id: "note-meeting", title: "Meeting Notes", body: "Planning details.\n" }),
    )
    await harness.writeNote(
      "notes/inbox/body-only.md",
      noteMarkdown({ id: "note-body", title: "Body Only", body: "First line.\nTracking code 123 appears here.\n" }),
    )
    await harness.writeNote(
      "notes/inbox/a-big-cat.md",
      noteMarkdown({ id: "note-cat", title: "a-big-cat", body: "a-big-cat reference.\n" }),
    )

    const rebuildResult = harness.run(["rebuild"])
    assert.equal(rebuildResult.exitCode, 0)

    const result = harness.run(["search", "123"])

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.match(result.stdout, /^Receipt 123\n  key: note-receipt\n  path: notes[\\/]inbox[\\/]receipt\.md\n  match: title/m)
    assert.match(result.stdout, /^Meeting Notes\n  key: note-meeting\n  path: notes[\\/]meetings[\\/]meeting-123\.md\n  match: key\/path/m)
    assert.match(result.stdout, /^Body Only\n  key: note-body\n  path: notes[\\/]inbox[\\/]body-only\.md\n  match: content line 2/m)
    assert.doesNotMatch(result.stdout, /a-big-cat/)

    const compactResult = harness.run(["search", "abc"])
    assert.equal(compactResult.exitCode, 0)
    assert.equal(compactResult.stderr, "")
    assert.doesNotMatch(compactResult.stdout, /a-big-cat/)
  } finally {
    await harness.cleanup()
  }
}, 15_000)

test("bn search finds arbitrary substring contains matches through the real index", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-search-substring-")

  try {
    await harness.writeNote(
      "notes/inbox/alpha.md",
      noteMarkdown({ id: "note-alpha", title: "Alpha Project", body: "Opening line.\nBody contains foobar for substring search.\n" }),
    )

    const rebuildResult = harness.run(["rebuild"])
    assert.equal(rebuildResult.exitCode, 0)

    const titleResult = harness.run(["search", "pha"])
    assert.equal(titleResult.exitCode, 0)
    assert.equal(titleResult.stderr, "")
    assert.match(titleResult.stdout, /^Alpha Project\n  key: note-alpha\n  path: notes[\\/]inbox[\\/]alpha\.md\n  match: title/m)

    const bodyResult = harness.run(["search", "oba"])
    assert.equal(bodyResult.exitCode, 0)
    assert.equal(bodyResult.stderr, "")
    assert.match(bodyResult.stdout, /^Alpha Project\n  key: note-alpha\n  path: notes[\\/]inbox[\\/]alpha\.md\n  match: content line 2/m)
  } finally {
    await harness.cleanup()
  }
}, 15_000)

test("bn search returns actionable rebuild guidance when derived indexes are missing", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-search-missing-index-")

  try {
    await harness.writeNote(
      "notes/inbox/alpha.md",
      noteMarkdown({ id: "note-alpha", title: "Alpha Note", body: "Alpha body mentions comet.\n" }),
    )

    const result = harness.run(["search", "comet"])

    assert.equal(result.exitCode, 2)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /Derived indexes are unavailable\./)
    assert.match(result.stderr, /Hint: Run bn rebuild to recreate \.data artifacts from note files and sidecars\./)
  } finally {
    await harness.cleanup()
  }
})
