import { test } from "bun:test"
import assert from "node:assert/strict"
import path from "node:path"
import { mkdir, writeFile } from "node:fs/promises"

import { createManagedRootHarness } from "../helpers/cli"
import { noteMarkdown } from "../helpers/note-fixtures"

async function writePlainNoteWithSidecar(
  rootPath: string,
  {
    key,
    title,
    description,
    relativePath,
    body,
    archivedAt = null,
    createdAt = "2026-05-21T10:15:00.000Z",
    updatedAt = createdAt,
  }: {
    key: string
    title: string
    description: string
    relativePath: string
    body: string
    archivedAt?: string | null
    createdAt?: string
    updatedAt?: string
  },
) {
  const notePath = path.join(rootPath, relativePath)
  const sidecarPath = path.join(rootPath, ".data", "notes", `${key}.json`)

  await mkdir(path.dirname(notePath), { recursive: true })
  await mkdir(path.dirname(sidecarPath), { recursive: true })
  await writeFile(notePath, body, "utf8")
  await writeFile(
    sidecarPath,
    JSON.stringify(
      {
        key,
        title,
        description,
        relativePath,
        createdAt,
        updatedAt,
        archivedAt,
        namingVersion: 1,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  )
}

test("bn list shows title, key, description, and path for active notes only", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-list-")

  try {
    await writePlainNoteWithSidecar(harness.rootPath, {
      key: "alpha-note",
      title: "Alpha Note",
      description: "Alpha summary",
      relativePath: "notes/inbox/alpha-note.md",
      body: "Alpha body.\n",
    })
    await writePlainNoteWithSidecar(harness.rootPath, {
      key: "beta-note",
      title: "Beta Note",
      description: "Nebula planning note",
      relativePath: "notes/journal/beta-note.md",
      body: "Beta body.\n",
      createdAt: "2026-05-21T11:15:00.000Z",
    })
    await writePlainNoteWithSidecar(harness.rootPath, {
      key: "archived-note",
      title: "Archived Note",
      description: "Should not appear in list",
      relativePath: "notes/archive/archived-note.md",
      body: "Archived body.\n",
      archivedAt: "2026-05-22T09:30:00.000Z",
    })

    const rebuildResult = harness.run(["rebuild"])

    assert.equal(rebuildResult.exitCode, 0)
    assert.equal(rebuildResult.stderr, "")

    const result = harness.run(["list"])

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.equal(
      result.stdout,
      [
        "Alpha Note\talpha-note\tAlpha summary\tnotes/inbox/alpha-note.md",
        "Beta Note\tbeta-note\tNebula planning note\tnotes/journal/beta-note.md",
        "",
      ].join("\n"),
    )
    assert.doesNotMatch(result.stdout, /Archived Note/)
  } finally {
    await harness.cleanup()
  }
}, 15_000)

test("bn show <selector> prints title, key, path, description, and body", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-show-")

  try {
    await writePlainNoteWithSidecar(harness.rootPath, {
      key: "show-note",
      title: "Example Show Note",
      description: "Visible body. More detail.",
      relativePath: "notes/inbox/show-note.md",
      body: "Visible body.\nSecond line.\n",
    })

    const result = harness.run(["show", "show-note"])

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.equal(
      result.stdout,
      [
        "Title: Example Show Note",
        "Key: show-note",
        "Path: notes/inbox/show-note.md",
        "Description: Visible body. More detail.",
        "",
        "Visible body.",
        "Second line.",
        "",
      ].join("\n"),
    )
  } finally {
    await harness.cleanup()
  }
})

test("bn show falls back to legacy frontmatter notes without sidecars", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-show-legacy-")
  const relativePath = "notes/inbox/legacy-show.md"

  try {
    await harness.writeNote(
      relativePath,
      noteMarkdown({
        id: "legacy-show",
        title: "Legacy Show Note",
        body: "Legacy visible body.\nSecond line.\n",
      }),
    )

    const result = harness.run(["show", "legacy-show"])

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.equal(
      result.stdout,
      [
        "Title: Legacy Show Note",
        "Key: legacy-show",
        "Path: notes/inbox/legacy-show.md",
        "Description: Legacy visible body. Second line.",
        "",
        "Legacy visible body.",
        "Second line.",
        "",
      ].join("\n"),
    )
  } finally {
    await harness.cleanup()
  }
})

test("bn show rejects a title-derived slug selector", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-show-slug-reject-")

  try {
    await writePlainNoteWithSidecar(harness.rootPath, {
      key: "slug-note",
      title: "Example Show Note",
      description: "Visible body.",
      relativePath: "notes/inbox/slug-note.md",
      body: "Visible body.\n",
    })

    const result = harness.run(["show", "  ExAmPlE-sHoW-nOtE  "])

    assert.equal(result.exitCode, 1)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /Could not find a note matching selector '  ExAmPlE-sHoW-nOtE  '\./)
    assert.match(result.stderr, /Hint: Use bn list to inspect available notes\./)
  } finally {
    await harness.cleanup()
  }
})

test("bn show resolves a managed-root-relative path selector", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-show-path-")
  const relativePath = "notes/journal/show-path.md"

  try {
    await writePlainNoteWithSidecar(harness.rootPath, {
      key: "show-path",
      title: "Path Show Note",
      description: "Path body.",
      relativePath,
      body: "Path body.\n",
    })

    const result = harness.run(["show", relativePath])

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.match(result.stdout, /^Title: Path Show Note\nKey: show-path\nPath: notes[\\/]journal[\\/]show-path\.md\nDescription: Path body\.\n\nPath body\.\n$/)
  } finally {
    await harness.cleanup()
  }
}, 15_000)

test("bn show rejects non-canonical normalized path aliases", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-show-path-alias-")
  const relativePath = "notes/journal/show-path.md"

  try {
    await writePlainNoteWithSidecar(harness.rootPath, {
      key: "show-path",
      title: "Path Show Note",
      description: "Path body.",
      relativePath,
      body: "Path body.\n",
    })

    const result = harness.run(["show", `notes${path.sep}archive${path.sep}..${path.sep}journal${path.sep}show-path.md`])

    assert.equal(result.exitCode, 1)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /Could not find a note matching selector 'notes[\\/]archive[\\/]\.\.[\\/]journal[\\/]show-path\.md'\./)
    assert.match(result.stderr, /Hint: Use bn list to inspect available notes\./)
  } finally {
    await harness.cleanup()
  }
})

test("bn show still resolves an exact key match when a legacy frontmatter id collides with it", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-show-key-collision-")

  try {
    await writePlainNoteWithSidecar(harness.rootPath, {
      key: "shared-title",
      title: "Canonical Key Note",
      description: "Canonical key body.",
      relativePath: "notes/inbox/shared-title.md",
      body: "Canonical key body.\n",
    })
    await harness.writeNote(
      "notes/journal/legacy-human-key.md",
      noteMarkdown({
        id: "shared-title",
        title: "Legacy Collision Note",
        body: "Legacy collision body.\n",
      }),
    )

    const result = harness.run(["show", "shared-title"])

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.equal(
      result.stdout,
      [
        "Title: Canonical Key Note",
        "Key: shared-title",
        "Path: notes/inbox/shared-title.md",
        "Description: Canonical key body.",
        "",
        "Canonical key body.",
        "",
      ].join("\n"),
    )
  } finally {
    await harness.cleanup()
  }
})

test("bn show reports selector-not-found errors", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-show-missing-")

  try {
    await writePlainNoteWithSidecar(harness.rootPath, {
      key: "present",
      title: "Present Note",
      description: "Visible body.",
      relativePath: "notes/inbox/present.md",
      body: "Visible body.\n",
    })

    const result = harness.run(["show", "does-not-exist"])

    assert.equal(result.exitCode, 1)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /Could not find a note matching selector 'does-not-exist'\./)
    assert.match(result.stderr, /Hint: Use bn list to inspect available notes\./)
  } finally {
    await harness.cleanup()
  }
}, 15_000)

test("bn show suggests close note keys when a selector is missing", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-show-suggest-")

  try {
    await writePlainNoteWithSidecar(harness.rootPath, {
      key: "show-note",
      title: "Show Note",
      description: "Visible body.",
      relativePath: "notes/inbox/show-note.md",
      body: "Visible body.\n",
    })
    await writePlainNoteWithSidecar(harness.rootPath, {
      key: "slow-note",
      title: "Slow Note",
      description: "Slow body.",
      relativePath: "notes/journal/slow-note.md",
      body: "Slow body.\n",
    })

    const result = harness.run(["show", "shoe-note"])

    assert.equal(result.exitCode, 1)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /Could not find a note matching selector 'shoe-note'\./)
    assert.match(result.stderr, /Hint: Did you mean: show-note, slow-note\?/)
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
    assert.match(result.stderr, /Hint: Run bn show <key\|path>\./)
  } finally {
    await harness.cleanup()
  }
})

test("bn show rejects legacy frontmatter ids when they do not match the canonical key", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-show-legacy-id-")

  try {
    await harness.writeNote(
      "notes/inbox/human-key.md",
      noteMarkdown({
        id: "legacy-id-123",
        title: "Legacy Selector Note",
        body: "Legacy visible body.\n",
      }),
    )

    const result = harness.run(["show", "legacy-id-123"])

    assert.equal(result.exitCode, 1)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /Could not find a note matching selector 'legacy-id-123'\./)
    assert.match(result.stderr, /Hint: Use bn list to inspect available notes\./)
  } finally {
    await harness.cleanup()
  }
})
