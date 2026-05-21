import test from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import { createManagedRootHarness } from "../helpers/cli"
import { noteMarkdown } from "../helpers/note-fixtures"

test("bn list shows existing note summaries", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-list-")

  try {
    await harness.writeNote(
      path.join("notes", "inbox", "alpha.md"),
      noteMarkdown({ id: "note-alpha", title: "Alpha Note", body: "Alpha body.\n" }),
    )
    await harness.writeNote(
      path.join("notes", "journal", "beta.md"),
      noteMarkdown({
        id: "note-beta",
        title: "Beta Note",
        body: "Beta body.\n",
        createdAt: "2026-05-21T11:15:00.000Z",
      }),
    )

    const rebuildResult = harness.run(["rebuild"])

    assert.equal(rebuildResult.exitCode, 0)
    assert.equal(rebuildResult.stderr, "")

    const result = harness.run(["list"])

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.match(result.stdout, /note-alpha\s+Alpha Note\s+notes[\\/]inbox[\\/]alpha\.md/)
    assert.match(result.stdout, /note-beta\s+Beta Note\s+notes[\\/]journal[\\/]beta\.md/)
  } finally {
    await harness.cleanup()
  }
})

test("bn show <selector> prints the matching note", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-show-")
  const markdown = noteMarkdown({ id: "show-note", title: "Example Show Note", body: "Visible body.\n" })

  try {
    await harness.writeNote(path.join("notes", "inbox", "show-note.md"), markdown)

    const result = harness.run(["show", "show-note"])

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.equal(result.stdout, markdown)
  } finally {
    await harness.cleanup()
  }
})

test("bn show preserves the stored note formatting exactly", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-show-formatting-")
  const markdown = `---
title: "Formatting Example"
id: formatting-note
schemaVersion: 1
mode: plain
tags: [alpha, beta]
createdAt: "2026-05-21T10:15:00.000Z"
updatedAt: "2026-05-21T10:15:00.000Z"
---

Body line one.

Body line two.
`

  try {
    await harness.writeNote(path.join("notes", "inbox", "formatting-note.md"), markdown)

    const result = harness.run(["show", "formatting-note"])

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.equal(result.stdout, markdown)
  } finally {
    await harness.cleanup()
  }
})

test("bn show resolves a title-derived slug selector", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-show-slug-")
  const markdown = noteMarkdown({ id: "slug-note", title: "Example Show Note", body: "Visible body.\n" })

  try {
    await harness.writeNote(path.join("notes", "inbox", "slug-note.md"), markdown)

    const result = harness.run(["show", "  ExAmPlE-sHoW-nOtE  "])

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.equal(result.stdout, markdown)
  } finally {
    await harness.cleanup()
  }
})

test("bn show resolves a managed-root-relative path selector", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-show-path-")
  const relativePath = path.join("notes", "journal", "show-path.md")
  const markdown = noteMarkdown({ id: "path-note", title: "Path Show Note", body: "Path body.\n" })

  try {
    await harness.writeNote(relativePath, markdown)

    const result = harness.run(["show", relativePath])

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.equal(result.stdout, markdown)
  } finally {
    await harness.cleanup()
  }
})

test("bn show surfaces ambiguous selector failures", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-show-ambiguous-")

  try {
    await harness.writeNote(
      path.join("notes", "inbox", "shared-a.md"),
      noteMarkdown({
        id: "shared-a",
        title: "Shared Title",
        body: "Shared A body.\n",
        createdAt: "2026-05-21T10:19:00.000Z",
      }),
    )
    await harness.writeNote(
      path.join("notes", "archive", "shared-b.md"),
      noteMarkdown({
        id: "shared-b",
        title: "Shared Title",
        body: "Shared B body.\n",
        createdAt: "2026-05-21T10:20:00.000Z",
      }),
    )

    const result = harness.run(["show", "shared-title"])

    assert.equal(result.exitCode, 2)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /Ambiguous note selector: shared-title\./)
    assert.match(result.stderr, /notes[\\/]inbox[\\/]shared-a\.md/)
    assert.match(result.stderr, /notes[\\/]archive[\\/]shared-b\.md/)
    assert.match(result.stderr, /Hint: Use a note ID or managed-root-relative path to disambiguate\./)
  } finally {
    await harness.cleanup()
  }
})

test("bn show reports selector-not-found errors", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-show-missing-")

  try {
    await harness.writeNote(
      path.join("notes", "inbox", "present.md"),
      noteMarkdown({ id: "present-note", title: "Present Note", body: "Visible body.\n" }),
    )

    const result = harness.run(["show", "does-not-exist"])

    assert.equal(result.exitCode, 1)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /Could not find a note matching selector 'does-not-exist'\./)
    assert.match(result.stderr, /Hint: Use bn list to inspect available notes\./)
  } finally {
    await harness.cleanup()
  }
})

test("bn show requires a selector argument", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-show-usage-")

  try {
    const result = harness.run(["show"])

    assert.equal(result.exitCode, 1)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /Missing required selector for show\./)
    assert.match(result.stderr, /Hint: Run bn show <id\|path\|slug>\./)
  } finally {
    await harness.cleanup()
  }
})
