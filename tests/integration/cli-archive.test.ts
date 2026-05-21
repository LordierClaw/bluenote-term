import test from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import { createManagedRootHarness } from "../helpers/cli"
import { noteMarkdown, timestampFieldPattern } from "../helpers/note-fixtures"

test("bn archive <selector> moves the note into notes/archive, prints the archive path, and hides it from list/search", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-archive-")

  try {
    await harness.writeNote(
      path.join("notes", "inbox", "archive-target.md"),
      noteMarkdown({ id: "archive-target", title: "Archive Target", body: "Searchable before archive.\n" }),
    )
    await harness.writeNote(
      path.join("notes", "inbox", "still-active.md"),
      noteMarkdown({
        id: "still-active",
        title: "Still Active",
        body: "Remains visible.\n",
        createdAt: "2026-05-21T10:16:00.000Z",
      }),
    )

    const initialRebuild = harness.run(["rebuild"])
    assert.equal(initialRebuild.exitCode, 0)

    const archiveResult = harness.run(["archive", "archive-target"])
    assert.equal(archiveResult.exitCode, 0)
    assert.equal(archiveResult.stderr, "")
    assert.match(archiveResult.stdout, /Archived note: notes[\\/]archive[\\/]archive-target\.md/)

    const showResult = harness.run(["show", path.join("notes", "archive", "archive-target.md")])
    assert.equal(showResult.exitCode, 0)
    assert.match(showResult.stdout, timestampFieldPattern("archivedAt"))

    const listResult = harness.run(["list"])
    assert.equal(listResult.exitCode, 0)
    assert.match(listResult.stdout, /still-active\s+Still Active\s+notes[\\/]inbox[\\/]still-active\.md/)
    assert.doesNotMatch(listResult.stdout, /archive-target/)

    const searchResult = harness.run(["search", "Searchable before archive"])
    assert.equal(searchResult.exitCode, 0)
    assert.equal(searchResult.stdout, "")
  } finally {
    await harness.cleanup()
  }
})

test("bn archive exits non-zero before mutating files when rebuild validation already fails", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-archive-")

  try {
    await harness.writeNote(
      path.join("notes", "inbox", "archive-target.md"),
      noteMarkdown({ id: "archive-target", title: "Archive Target", body: "Searchable before archive.\n" }),
    )
    await harness.writeNote(
      path.join("notes", "inbox", "duplicate-a.md"),
      noteMarkdown({
        id: "duplicate-note",
        title: "Duplicate A",
        body: "First duplicate.\n",
        createdAt: "2026-05-21T10:16:00.000Z",
      }),
    )
    await harness.writeNote(
      path.join("notes", "inbox", "duplicate-b.md"),
      noteMarkdown({
        id: "duplicate-note",
        title: "Duplicate B",
        body: "Second duplicate.\n",
        createdAt: "2026-05-21T10:17:00.000Z",
      }),
    )

    const archiveResult = harness.run(["archive", "archive-target"])
    assert.equal(archiveResult.exitCode, 2)
    assert.equal(archiveResult.stdout, "")
    assert.match(
      archiveResult.stderr,
      /Validation failed before archiving notes[\\/]inbox[\\/]archive-target\.md\./,
    )
    assert.match(archiveResult.stderr, /Duplicate note id 'duplicate-note'/)

    const showOriginalResult = harness.run(["show", path.join("notes", "inbox", "archive-target.md")])
    assert.equal(showOriginalResult.exitCode, 0)
    assert.doesNotMatch(showOriginalResult.stdout, /archivedAt:/)

    const showArchivedResult = harness.run(["show", path.join("notes", "archive", "archive-target.md")])
    assert.equal(showArchivedResult.exitCode, 1)
    assert.match(showArchivedResult.stderr, /Could not find a note matching selector 'notes[\\/]archive[\\/]archive-target\.md'\./)
  } finally {
    await harness.cleanup()
  }
})

test("bn archive rejects notes that are already archived", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-archive-")

  try {
    await harness.writeNote(
      path.join("notes", "archive", "already-archived.md"),
      noteMarkdown({
        id: "already-archived",
        title: "Already Archived",
        body: "Already archived.\n",
        archivedAt: "2026-05-21T11:00:00.000Z",
      }),
    )

    const archiveResult = harness.run(["archive", "already-archived"])
    assert.equal(archiveResult.exitCode, 1)
    assert.equal(archiveResult.stdout, "")
    assert.match(archiveResult.stderr, /Note 'notes[\\/]archive[\\/]already-archived\.md' is already archived\./)

    const showResult = harness.run(["show", path.join("notes", "archive", "already-archived.md")])
    assert.equal(showResult.exitCode, 0)
    assert.match(showResult.stdout, /archivedAt: '?2026-05-21T11:00:00.000Z'?/)
  } finally {
    await harness.cleanup()
  }
})
