import test from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import { access, readFile } from "node:fs/promises"
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

    const archivedRelativePath = path.join("notes", "archive", "archive-target.md")
    const showResult = harness.run(["show", archivedRelativePath])
    assert.equal(showResult.exitCode, 0)
    assert.equal(
      showResult.stdout,
      [
        "Title: Archive Target",
        "Key: archive-target",
        `Path: ${archivedRelativePath.replaceAll(path.sep, "/")}`,
        "Description: Searchable before archive.",
        "",
        "Searchable before archive.",
        "",
      ].join("\n"),
    )

    const archivedMarkdown = await readFile(path.join(harness.rootPath, archivedRelativePath), "utf8")
    assert.equal(archivedMarkdown, "Searchable before archive.\n")

    const archivedSidecar = JSON.parse(
      await readFile(path.join(harness.rootPath, ".state", "notes", "archive-target.json"), "utf8"),
    )
    assert.match(`archivedAt: ${archivedSidecar.archivedAt}`, timestampFieldPattern("archivedAt"))

    const listResult = harness.run(["list"])
    assert.equal(listResult.exitCode, 0)
    assert.match(listResult.stdout, /Still Active\s+still-active\s+Remains visible\.\s+notes[\\/]inbox[\\/]still-active\.md/)
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
    await harness.writeNote(path.join("notes", "inbox", "missing-sidecar.md"), "Broken plain note without sidecar.\n")

    const archiveResult = harness.run(["archive", "archive-target"])
    assert.equal(archiveResult.exitCode, 1)
    assert.equal(archiveResult.stdout, "")
    assert.match(archiveResult.stderr, /Could not read note 'notes[\\/]inbox[\\/]missing-sidecar\.md'\./)
    assert.match(archiveResult.stderr, /Hint: Ensure the note exists inside BLUENOTE_ROOT and is readable\./)

    await access(path.join(harness.rootPath, "notes", "inbox", "archive-target.md"))

    const showArchivedResult = harness.run(["show", path.join("notes", "archive", "archive-target.md")])
    assert.equal(showArchivedResult.exitCode, 1)
    assert.match(showArchivedResult.stderr, /Could not read note 'notes[\\/]inbox[\\/]missing-sidecar\.md'\./)
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
    assert.equal(
      showResult.stdout,
      [
        "Title: Already Archived",
        "Key: already-archived",
        "Path: notes/archive/already-archived.md",
        "Description: Already archived.",
        "",
        "Already archived.",
        "",
      ].join("\n"),
    )
  } finally {
    await harness.cleanup()
  }
})
