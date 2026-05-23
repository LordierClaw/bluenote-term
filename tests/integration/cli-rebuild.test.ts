import test from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import { mkdir, readFile } from "node:fs/promises"

import { createManagedRootHarness } from "../helpers/cli"

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

test("bn rebuild reads plain note bodies plus sidecars and writes derived artifacts under .state", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-rebuild-")

  try {
    const relativePath = path.join("notes", "inbox", "alpha-note.md")
    await harness.writeNote(relativePath, "Alpha plain body mentions comet trails.\n")
    await harness.writeNote(
      path.join(".state", "notes", "alpha-note.json"),
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

    const metadataPath = path.join(harness.rootPath, ".state", "metadata.sqlite")
    const searchPath = path.join(harness.rootPath, ".state", "search-index.json")

    assert.equal(await Bun.file(metadataPath).exists(), true)
    assert.equal(await Bun.file(searchPath).exists(), true)

    const searchJson = JSON.parse(await readFile(searchPath, "utf8")) as { documentIds: Record<string, string> }
    assert.equal(searchJson.documentIds["0"], "alpha-note")
  } finally {
    await harness.cleanup()
  }
})

test("bn rebuild exits 2 and reports a missing sidecar for a plain note", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-rebuild-missing-sidecar-")

  try {
    await harness.writeNote(path.join("notes", "inbox", "missing-sidecar.md"), "Body without sidecar.\n")

    const result = harness.run(["rebuild"])

    assert.equal(result.exitCode, 2)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /Validation failed while rebuilding indexes\./)
    assert.match(result.stderr, /Could not read sidecar '\.state[\\/]notes[\\/]missing-sidecar\.json'\./)
  } finally {
    await harness.cleanup()
  }
})

test("bn rebuild exits 2 and reports a sidecar whose note file is missing", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-rebuild-missing-note-")

  try {
    await harness.writeNote(
      path.join(".state", "notes", "orphaned-note.json"),
      sidecarJson({
        key: "orphaned-note",
        title: "Orphaned Note",
        description: "No body file",
        relativePath: path.join("notes", "inbox", "orphaned-note.md"),
      }),
    )

    const result = harness.run(["rebuild"])

    assert.equal(result.exitCode, 2)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /Validation failed while rebuilding indexes\./)
    assert.match(result.stderr, /Sidecar '\.state[\\/]notes[\\/]orphaned-note\.json' points to missing note 'notes[\\/]inbox[\\/]orphaned-note\.md'\./)
  } finally {
    await harness.cleanup()
  }
})

test("bn rebuild exits 2 and reports sidecar key and path mismatches", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-rebuild-mismatch-")

  try {
    const relativePath = path.join("notes", "inbox", "alpha-note.md")
    await harness.writeNote(relativePath, "Mismatch body.\n")
    await harness.writeNote(
      path.join(".state", "notes", "alpha-note.json"),
      sidecarJson({
        key: "other-key",
        title: "Alpha Note",
        description: "Mismatch metadata",
        relativePath: path.join("notes", "journal", "alpha-note.md"),
      }),
    )

    const result = harness.run(["rebuild"])

    assert.equal(result.exitCode, 2)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /Validation failed while rebuilding indexes\./)
    assert.match(result.stderr, /Sidecar '\.state[\\/]notes[\\/]alpha-note\.json' declares key 'other-key' but is stored for note key 'alpha-note'\./)
    assert.match(result.stderr, /Note metadata for 'other-key' points to 'notes[\\/]journal[\\/]alpha-note\.md' instead of 'notes[\\/]inbox[\\/]alpha-note\.md'\./)
  } finally {
    await harness.cleanup()
  }
})

test("bn rebuild exits 2 and surfaces invalid sidecar validation errors", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-rebuild-invalid-sidecar-")

  try {
    const relativePath = path.join("notes", "inbox", "broken-sidecar.md")
    await harness.writeNote(relativePath, "Broken metadata body.\n")
    await mkdir(path.join(harness.rootPath, ".state", "notes"), { recursive: true })
    await Bun.write(
      path.join(harness.rootPath, ".state", "notes", "broken-sidecar.json"),
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
    assert.match(result.stderr, /Invalid sidecar metadata in \.state[\\/]notes[\\/]broken-sidecar\.json: missing required field 'description'\./)
  } finally {
    await harness.cleanup()
  }
})
