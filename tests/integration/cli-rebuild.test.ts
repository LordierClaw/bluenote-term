import { test } from "bun:test"
import assert from "node:assert/strict"
import path from "node:path"
import { access, mkdir, readFile } from "node:fs/promises"

import { loadIndexStore } from "../../src/index/index-store"
import { createManagedRootHarness } from "../helpers/cli"
import { noteMarkdown } from "../helpers/note-fixtures"

function sidecarJson(input: {
  key: string
  title: string
  description: string
  relativePath: string
  createdAt?: string
  updatedAt?: string
  archivedAt?: string | null
  namingVersion?: number
}): string {
  return `${JSON.stringify(
    {
      key: input.key,
      title: input.title,
      description: input.description,
      relativePath: input.relativePath,
      createdAt: input.createdAt ?? "2026-05-21T10:15:00.000Z",
      updatedAt: input.updatedAt ?? input.createdAt ?? "2026-05-21T10:15:00.000Z",
      archivedAt: input.archivedAt ?? null,
      namingVersion: input.namingVersion ?? 1,
    },
    null,
    2,
  )}\n`
}

test("bn rebuild reads plain note bodies plus sidecars and writes derived artifacts under .data", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-rebuild-")

  try {
    const relativePath = "note/alpha-note.md"
    await harness.writeNote(relativePath, "Alpha plain body mentions comet trails.\n")
    await harness.writeNote(
      path.join(".data", "notes", "alpha-note.json"),
      sidecarJson({
        key: "alpha-note",
        title: "Alpha Note",
        description: "Project comet summary",
        relativePath,
      }),
    )

    const result = harness.run(["rebuild"])

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.match(result.stdout, /Rebuilt indexes for 1 note\(s\)\./)

    const metadataPath = path.join(harness.rootPath, ".data", "metadata.sqlite")
    const searchPath = path.join(harness.rootPath, ".data", "search-index.json")

    assert.equal(await Bun.file(metadataPath).exists(), true)
    assert.equal(await Bun.file(searchPath).exists(), true)

    const searchJson = JSON.parse(await readFile(searchPath, "utf8")) as { documentIds: Record<string, string> }
    assert.equal(searchJson.documentIds["0"], "alpha-note")
  } finally {
    await harness.cleanup()
  }
})

test("bn rebuild migrates .state sidecars before rebuilding .data indexes", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-rebuild-state-migration-")

  try {
    const relativePath = "note/legacy-state-note.md"
    await harness.writeNote(relativePath, "Legacy state sidecar body mentions asteroid dust.\n")
    await harness.writeNote(
      path.join(".state", "notes", "legacy-state-note.json"),
      sidecarJson({
        key: "legacy-state-note",
        title: "Legacy State Note",
        description: "Legacy state sidecar body mentions asteroid dust.",
        relativePath,
      }),
    )
    await harness.writeNote(path.join(".state", "metadata.sqlite"), "stale metadata must not be copied")

    const result = harness.run(["rebuild"])

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.match(result.stdout, /Rebuilt indexes for 1 note\(s\)\./)
    await access(path.join(harness.rootPath, ".data", "notes", "legacy-state-note.json"))
    await access(path.join(harness.rootPath, ".data", "metadata.sqlite"))
    await access(path.join(harness.rootPath, ".data", "search-index.json"))
    assert.notEqual(await readFile(path.join(harness.rootPath, ".data", "metadata.sqlite"), "utf8"), "stale metadata must not be copied")
  } finally {
    await harness.cleanup()
  }
})

test("bn rebuild exits 2 and reports a missing sidecar for a plain note", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-rebuild-missing-sidecar-")

  try {
    await harness.writeNote("note/missing-sidecar.md", "Body without sidecar.\n")

    const result = harness.run(["rebuild"])

    assert.equal(result.exitCode, 2)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /Validation failed while rebuilding indexes\./)
    assert.match(result.stderr, /Could not read sidecar '\.data[\\/]notes[\\/]missing-sidecar\.json'\./)
  } finally {
    await harness.cleanup()
  }
})

test("bn rebuild falls back to legacy frontmatter notes without sidecars", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-rebuild-legacy-frontmatter-")

  try {
    await harness.writeNote(
      "note/legacy-note.md",
      noteMarkdown({
        id: "legacy-note",
        title: "Legacy Note",
        body: "Legacy frontmatter body mentions meteor trails.\n",
      }),
    )

    const result = harness.run(["rebuild"])

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.match(result.stdout, /Rebuilt indexes for 1 note\(s\)\./)

    const store = loadIndexStore(harness.rootPath)
    assert.deepEqual(store.listSummaries(), [
      {
        key: "legacy-note",
        id: "legacy-note",
        title: "Legacy Note",
        description: "Legacy frontmatter body mentions meteor trails.",
        relativePath: "note/legacy-note.md",
        createdAt: "2026-05-21T10:15:00.000Z",
        updatedAt: "2026-05-21T10:15:00.000Z",
        archivedAt: null,
      },
    ])
    assert.deepEqual(store.search("meteor").map((match) => match.key), ["legacy-note"])
  } finally {
    await harness.cleanup()
  }
})

test("bn rebuild fails for legacy frontmatter notes when an invalid sidecar already exists", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-rebuild-legacy-invalid-sidecar-")

  try {
    const relativePath = "note/legacy-invalid-sidecar.md"
    await harness.writeNote(
      relativePath,
      noteMarkdown({
        id: "legacy-invalid-sidecar",
        title: "Legacy Invalid Sidecar",
        body: "Legacy frontmatter should not bypass corrupt sidecar metadata.\n",
      }),
    )
    await harness.writeNote(path.join(".data", "notes", "legacy-invalid-sidecar.json"), "{not-valid-json\n")

    const result = harness.run(["rebuild"])

    assert.equal(result.exitCode, 2)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /Validation failed while rebuilding indexes\./)
    assert.match(result.stderr, /Could not parse sidecar '\.data[\\/]notes[\\/]legacy-invalid-sidecar\.json'\./)
  } finally {
    await harness.cleanup()
  }
})

test("bn rebuild preserves archived sidecar notes in derived artifacts without surfacing them as active results", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-rebuild-archived-")

  try {
    const archivedAt = "2026-05-22T09:30:00.000Z"
    const relativePath = path.join(".data", "archive", "archived-note.md")

    await harness.writeNote(relativePath, "Archived body keeps lunar breadcrumb text.\n")
    await harness.writeNote(
      path.join(".data", "notes", "archived-note.json"),
      sidecarJson({
        key: "archived-note",
        title: "Archived Note",
        description: "Archived lunar summary",
        relativePath,
        archivedAt,
      }),
    )

    const result = harness.run(["rebuild"])

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.match(result.stdout, /Rebuilt indexes for 0 note\(s\)\./)

    const store = loadIndexStore(harness.rootPath)
    assert.deepEqual(store.listSummaries(), [])
    assert.deepEqual(store.search("lunar").map((match) => match.key), [])
  } finally {
    await harness.cleanup()
  }
})

test("bn rebuild exits 2 and reports a sidecar whose note file is missing", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-rebuild-missing-note-")

  try {
    await harness.writeNote(
      path.join(".data", "notes", "orphaned-note.json"),
      sidecarJson({
        key: "orphaned-note",
        title: "Orphaned Note",
        description: "No body file",
        relativePath: "note/orphaned-note.md",
      }),
    )

    const result = harness.run(["rebuild"])

    assert.equal(result.exitCode, 2)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /Validation failed while rebuilding indexes\./)
    assert.match(result.stderr, /Sidecar '\.data[\\/]notes[\\/]orphaned-note\.json' points to missing note 'note[\\/]orphaned-note\.md'\./)
  } finally {
    await harness.cleanup()
  }
})

test("bn rebuild rejects orphaned sidecars whose relative path escapes the managed root", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-rebuild-outside-sidecar-")

  try {
    await harness.writeNote(
      path.join(".data", "notes", "outside-note.json"),
      sidecarJson({
        key: "outside-note",
        title: "Outside Note",
        description: "Should not be resolved outside root",
        relativePath: path.join("..", "outside-note.md"),
      }),
    )

    const result = harness.run(["rebuild"])

    assert.equal(result.exitCode, 2)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /Validation failed while rebuilding indexes\./)
    assert.match(result.stderr, /Target path '.+' is outside the managed root '.+'\./)
    assert.doesNotMatch(result.stderr, /points to missing note/)
  } finally {
    await harness.cleanup()
  }
})

test("bn rebuild rejects orphaned sidecars whose relative path is absolute", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-rebuild-absolute-sidecar-")

  try {
    await harness.writeNote(
      path.join(".data", "notes", "absolute-note.json"),
      sidecarJson({
        key: "absolute-note",
        title: "Absolute Note",
        description: "Absolute paths are not portable metadata",
        relativePath: "/tmp/outside-note.md",
      }),
    )

    const result = harness.run(["rebuild"])

    assert.equal(result.exitCode, 2)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /Validation failed while rebuilding indexes\./)
    assert.match(
      result.stderr,
      /Sidecar '\.data[\\/]notes[\\/]absolute-note\.json' declares absolute relativePath '\/tmp\/outside-note\.md'\./,
    )
    assert.doesNotMatch(result.stderr, /points to missing note 'tmp[\\/]outside-note\.md'/)
  } finally {
    await harness.cleanup()
  }
})

test("bn rebuild exits 2 and reports sidecar key and path mismatches", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-rebuild-mismatch-")

  try {
    const relativePath = "note/alpha-note.md"
    await harness.writeNote(relativePath, "Mismatch body.\n")
    await harness.writeNote(
      path.join(".data", "notes", "alpha-note.json"),
      sidecarJson({
        key: "other-key",
        title: "Alpha Note",
        description: "Mismatch metadata",
        relativePath: "note/renamed-alpha-note.md",
      }),
    )

    const result = harness.run(["rebuild"])

    assert.equal(result.exitCode, 2)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /Validation failed while rebuilding indexes\./)
    assert.match(result.stderr, /Sidecar '\.data[\\/]notes[\\/]alpha-note\.json' declares key 'other-key' but is stored for note key 'alpha-note'\./)
    assert.match(result.stderr, /Note metadata for 'other-key' points to 'note[\\/]renamed-alpha-note\.md' instead of 'note[\\/]alpha-note\.md'\./)
  } finally {
    await harness.cleanup()
  }
})

test("bn rebuild exits 2 and surfaces invalid sidecar validation errors", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-rebuild-invalid-sidecar-")

  try {
    const relativePath = "note/broken-sidecar.md"
    await harness.writeNote(relativePath, "Broken metadata body.\n")
    await mkdir(path.join(harness.rootPath, ".data", "notes"), { recursive: true })
    await Bun.write(
      path.join(harness.rootPath, ".data", "notes", "broken-sidecar.json"),
      JSON.stringify(
        {
          key: "broken-sidecar",
          title: "Broken Sidecar",
          relativePath,
          createdAt: "2026-05-21T10:15:00.000Z",
          updatedAt: "2026-05-21T10:15:00.000Z",
          archivedAt: null,
          namingVersion: 1,
        },
        null,
        2,
      ) + "\n",
    )

    const result = harness.run(["rebuild"])

    assert.equal(result.exitCode, 2)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /Validation failed while rebuilding indexes\./)
    assert.match(result.stderr, /Invalid sidecar metadata in \.data[\\/]notes[\\/]broken-sidecar\.json: missing required field 'description'\./)
  } finally {
    await harness.cleanup()
  }
}, 15_000)

test("bn rebuild exits 2 with a controlled error when .data/notes cannot be scanned", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-rebuild-sidecar-scan-")

  try {
    const relativePath = "note/alpha-note.md"
    await harness.writeNote(relativePath, "Alpha body.\n")
    await harness.writeNote(
      path.join(".data", "notes", "alpha-note.json"),
      sidecarJson({
        key: "alpha-note",
        title: "Alpha Note",
        description: "Alpha summary",
        relativePath,
      }),
    )

    const result = harness.run(["rebuild"], {
      BLUENOTE_TEST_REBUILD_FAIL_SIDECAR_SCAN: "1",
    })

    assert.equal(result.exitCode, 2)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /Validation failed while rebuilding indexes\./)
    assert.match(result.stderr, /Could not scan sidecar directory '\.data[\\/]notes'\./)
    assert.doesNotMatch(result.stderr, /Forced sidecar scan failure for tests\./)
  } finally {
    await harness.cleanup()
  }
})
