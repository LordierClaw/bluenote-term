import { test } from "bun:test"
import assert from "node:assert/strict"
import path from "node:path"
import { access, readFile } from "node:fs/promises"

import { createNoteDescription } from "../../src/domain/note-description"
import { loadIndexStore } from "../../src/index/index-store"
import { createBlockedRootFixture, createManagedRootHarness, runCli } from "../helpers/cli"
import { legacyNoteMarkdown } from "../helpers/note-fixtures"

test("bn migrate converts legacy frontmatter notes into plain notes, sidecars, and rebuilt indexes", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-migrate-")

  try {
    await harness.writeNote(
      "notes/inbox/123e4567-e89b-12d3-a456-426614174000.md",
      legacyNoteMarkdown({
        id: "123e4567-e89b-12d3-a456-426614174000",
        title: "CLI Migration Note",
        body: "CLI migration body mentions orbit transfer windows.\n",
      }),
    )

    const result = harness.run(["migrate"], {
      BLUENOTE_TEST_NOW: "2026-05-24T12:00:00.000Z",
      BLUENOTE_TEST_RANDOM_SEQUENCE: "305419896",
    })

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.match(result.stdout, /Migrated 1 legacy note\(s\) to plain-note \+ sidecar storage\./)
    assert.match(result.stdout, /Key map: 123e4567-e89b-12d3-a456-426614174000 -> cli-migration-note-51u7i0/)

    assert.equal(
      await readFile(path.join(harness.rootPath, "note", "cli-migration-note-51u7i0.md"), "utf8"),
      "CLI migration body mentions orbit transfer windows.\n",
    )

    const sidecar = JSON.parse(
      await readFile(path.join(harness.rootPath, ".data", "notes", "cli-migration-note-51u7i0.json"), "utf8"),
    ) as { description: string }
    assert.equal(sidecar.description, createNoteDescription("CLI migration body mentions orbit transfer windows.\n"))

    const store = loadIndexStore(harness.rootPath)
    assert.deepEqual(store.search("orbit").map((match) => match.key), ["cli-migration-note-51u7i0"])
  } finally {
    await harness.cleanup()
  }
}, 15_000)

test("bn migrate returns a calm no-op message for already migrated roots", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-migrate-noop-")

  try {
    await harness.writeNote("note/already-migrated-51u7i0.md", "Already migrated body.\n")
    await harness.writeNote(
      path.join(".data", "notes", "already-migrated-51u7i0.json"),
      JSON.stringify(
        {
          type: "normal",
          key: "already-migrated-51u7i0",
          title: "Already Migrated",
          description: "Already migrated body.",
          relativePath: "note/already-migrated-51u7i0.md",
          createdAt: "2026-05-21T10:15:00.000Z",
          updatedAt: "2026-05-21T10:15:00.000Z",
          archivedAt: null,
          namingVersion: 1,
        },
        null,
        2,
      ) + "\n",
    )

    const result = harness.run(["migrate"], {
      BLUENOTE_TEST_NOW: "2026-05-24T12:00:00.000Z",
    })

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.equal(result.stdout, "BlueNote storage is already migrated; nothing to do.\n")
  } finally {
    await harness.cleanup()
  }
})

test("bn migrate reports a clean rollback error when rebuild cannot write derived indexes", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-migrate-rollback-")

  try {
    await harness.writeNote(
      "notes/inbox/legacy-rollback-uuid.md",
      legacyNoteMarkdown({
        id: "legacy-rollback-uuid",
        title: "Rollback Recovery Note",
        body: "Body that should survive a failed rebuild.\n",
        createdAt: "2026-05-21T10:15:00.000Z",
        updatedAt: "2026-05-22T11:30:00.000Z",
      }),
    )
    await harness.writeNote(path.join(".state", "metadata.sqlite"), "stale-metadata")
    await harness.writeNote(path.join(".state", "search-index.json"), '{"stale":true}\n')

    const result = harness.run(["migrate"], {
      BLUENOTE_TEST_NOW: "2026-05-24T12:00:00.000Z",
      BLUENOTE_TEST_RANDOM_SEQUENCE: "0.1234",
      BLUENOTE_TEST_MIGRATE_FAIL_REBUILD_WRITE: "1",
    })

    assert.equal(result.exitCode, 1)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /Legacy storage migration failed after rollback\./)
    assert.match(result.stderr, /Rollback succeeded\. Fix the underlying filesystem or index error, then retry bn migrate\./)
    assert.doesNotMatch(result.stderr, /writeFileSync|src\/index\/index-store\.ts|tests\/helpers\/run-cli\.ts/)
    assert.equal(
      await readFile(path.join(harness.rootPath, "notes", "inbox", "legacy-rollback-uuid.md"), "utf8"),
      legacyNoteMarkdown({
        id: "legacy-rollback-uuid",
        title: "Rollback Recovery Note",
        body: "Body that should survive a failed rebuild.\n",
        createdAt: "2026-05-21T10:15:00.000Z",
        updatedAt: "2026-05-22T11:30:00.000Z",
      }),
    )
    await assert.rejects(() => access(path.join(harness.rootPath, "note", "rollback-recovery-note-51u7i0.md")))
    await assert.rejects(() => access(path.join(harness.rootPath, ".data", "notes", "rollback-recovery-note-51u7i0.json")))
    await assert.rejects(() => access(path.join(harness.rootPath, ".data", "metadata.sqlite")))
    await assert.rejects(() => access(path.join(harness.rootPath, ".data", "search-index.json")))
  } finally {
    await harness.cleanup()
  }
}, 15_000)

test("bn migrate fails hard on unsafe already-migrated roots", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-migrate-unsafe-")

  try {
    await harness.writeNote("note/unsafe-note-51u7i0.md", "Unsafe migrated body.\n")
    await harness.writeNote(path.join(".data", "notes", "unsafe-note-51u7i0.json"), "{ not-valid-json\n")

    const result = harness.run(["migrate"], {
      BLUENOTE_TEST_NOW: "2026-05-24T12:00:00.000Z",
    })

    assert.equal(result.exitCode, 1)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /Cannot migrate a mixed-format BlueNote root\./)
    assert.match(result.stderr, /Resolve the mixed state manually before retrying bn migrate\./)
  } finally {
    await harness.cleanup()
  }
}, 15_000)

test("bn migrate fails hard on mixed-format roots", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-migrate-mixed-")

  try {
    await harness.writeNote(
      "notes/inbox/legacy-uuid-1.md",
      legacyNoteMarkdown({
        id: "legacy-uuid-1",
        title: "Legacy Mixed Note",
        body: "Legacy mixed body.\n",
      }),
    )
    await harness.writeNote("note/already-migrated-51u7i0.md", "Already migrated body.\n")
    await harness.writeNote(
      path.join(".data", "notes", "already-migrated-51u7i0.json"),
      JSON.stringify(
        {
          type: "normal",
          key: "already-migrated-51u7i0",
          title: "Already Migrated",
          description: "Already migrated body.",
          relativePath: "note/already-migrated-51u7i0.md",
          createdAt: "2026-05-21T10:15:00.000Z",
          updatedAt: "2026-05-21T10:15:00.000Z",
          archivedAt: null,
          namingVersion: 1,
        },
        null,
        2,
      ) + "\n",
    )

    const result = harness.run(["migrate"], {
      BLUENOTE_TEST_NOW: "2026-05-24T12:00:00.000Z",
    })

    assert.equal(result.exitCode, 1)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /Cannot migrate a mixed-format BlueNote root\./)
    assert.match(result.stderr, /Resolve the mixed state manually before retrying bn migrate\./)
  } finally {
    await harness.cleanup()
  }
}, 15_000)

test("bn migrate reports a clean user-facing error when BLUENOTE_ROOT points to a file", async () => {
  const fixture = await createBlockedRootFixture("bluenote-cli-migrate-blocked-root-")

  try {
    const result = runCli(["migrate"], { rootPath: fixture.blockedRoot })

    assert.equal(result.exitCode, 1)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /Could not initialize BlueNote root at/)
    assert.match(result.stderr, /Ensure BLUENOTE_ROOT points to a writable directory path\./)
    assert.doesNotMatch(result.stderr, /ENOTDIR|statx|at migrateLegacyAppStateToData|src\/storage\/app-state-migration/i)
  } finally {
    await fixture.cleanup()
  }
}, 15_000)

test("bn migrate reports conflict when .state and .data contain different sidecars", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-migrate-state-conflict-")

  try {
    const relativePath = "note/conflict-note.md"
    const baseSidecar = {
      type: "normal",
      key: "conflict-note",
      title: "Conflict Note",
      description: "Canonical data description.",
      relativePath,
      createdAt: "2026-05-21T10:15:00.000Z",
      updatedAt: "2026-05-21T10:15:00.000Z",
      archivedAt: null,
      namingVersion: 1,
    }

    await harness.writeNote(relativePath, "Conflict body.\n")
    await harness.writeNote(path.join(".data", "notes", "conflict-note.json"), `${JSON.stringify(baseSidecar, null, 2)}\n`)
    await harness.writeNote(
      path.join(".state", "notes", "conflict-note.json"),
      `${JSON.stringify({ ...baseSidecar, description: "Legacy state description." }, null, 2)}\n`,
    )

    const result = harness.run(["migrate"], {
      BLUENOTE_TEST_NOW: "2026-05-24T12:00:00.000Z",
    })

    assert.equal(result.exitCode, 1)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /Cannot migrate legacy \.state because \.data already contains conflicting app state\./)
    assert.match(result.stderr, /Review \.state and \.data, keep the desired BlueNote metadata under \.data, then retry\./)
    assert.doesNotMatch(result.stderr, /Error:|stack|at migrateLegacyAppStateToData/i)
  } finally {
    await harness.cleanup()
  }
})
