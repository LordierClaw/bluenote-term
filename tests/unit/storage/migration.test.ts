import { test } from "bun:test"
import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import { mkdtemp, readFile, readdir, rm, writeFile, access, mkdir } from "node:fs/promises"

import { loadIndexStore } from "../../../src/index/index-store"
import { createNoteKey } from "../../../src/domain/note-key"
import { ensureManagedRoot } from "../../../src/storage/root-layout"
import { detectStorageFormat, migrateLegacyStorage } from "../../../src/storage/migration"
import { createNoteDescription } from "../../../src/domain/note-description"
import { legacyNoteMarkdown, sidecarJson } from "../../helpers/note-fixtures"

const LEGACY_CREATED_AT = "2026-05-21T10:15:00.000Z"
const LEGACY_UPDATED_AT = "2026-05-22T11:30:00.000Z"
const LEGACY_ARCHIVED_AT = "2026-05-23T14:45:00.000Z"
const MIGRATED_AT = "2026-05-24T12:00:00.000Z"

async function createRoot(prefix: string): Promise<string> {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), prefix))
  ensureManagedRoot(rootPath)
  await mkdir(path.join(rootPath, "notes", "inbox"), { recursive: true })
  await mkdir(path.join(rootPath, "notes", "archive"), { recursive: true })
  return rootPath
}

test("detectStorageFormat classifies empty, old, new, and mixed managed roots", async () => {
  const emptyRoot = await createRoot("bluenote-migration-empty-")
  const legacyRoot = await createRoot("bluenote-migration-legacy-")
  const newRoot = await createRoot("bluenote-migration-new-")
  const mixedRoot = await createRoot("bluenote-migration-mixed-")

  try {
    await writeFile(
      path.join(legacyRoot, "notes", "inbox", "legacy-uuid-1.md"),
      legacyNoteMarkdown({
        id: "legacy-uuid-1",
        title: "Legacy Root Note",
        body: "Legacy body line.\n",
      }),
      "utf8",
    )

    const newRelativePath = "note/new-note-abcd12.md"
    await writeFile(path.join(newRoot, newRelativePath), "Plain note body.\n", "utf8")
    await writeFile(
      path.join(newRoot, ".data", "notes", "new-note-abcd12.json"),
      sidecarJson({
        key: "new-note-abcd12",
        title: "New Note",
        description: "Plain note body.",
        relativePath: newRelativePath,
      }),
      "utf8",
    )
    const archivedNewRelativePath = ".data/archive/archived-new-note.md"
    await writeFile(path.join(newRoot, archivedNewRelativePath), "Archived plain note body.\n", "utf8")
    await writeFile(
      path.join(newRoot, ".data", "notes", "archived-new-note.json"),
      sidecarJson({
        key: "archived-new-note",
        title: "Archived New Note",
        description: "Archived plain note body.",
        relativePath: archivedNewRelativePath,
        archivedAt: "2026-05-22T12:00:00.000Z",
      }),
      "utf8",
    )

    await writeFile(
      path.join(mixedRoot, "notes", "inbox", "legacy-uuid-2.md"),
      legacyNoteMarkdown({
        id: "legacy-uuid-2",
        title: "Mixed Legacy Note",
        body: "Legacy mixed body.\n",
      }),
      "utf8",
    )
    const mixedRelativePath = "note/already-new-qwerty.md"
    await writeFile(path.join(mixedRoot, mixedRelativePath), "Already migrated body.\n", "utf8")
    await writeFile(
      path.join(mixedRoot, ".data", "notes", "already-new-qwerty.json"),
      sidecarJson({
        key: "already-new-qwerty",
        title: "Already New",
        description: "Already migrated body.",
        relativePath: mixedRelativePath,
      }),
      "utf8",
    )

    assert.deepEqual(detectStorageFormat(emptyRoot), {
      kind: "empty-root",
      legacyNoteCount: 0,
      plainNoteCount: 0,
      sidecarCount: 0,
    })
    assert.deepEqual(detectStorageFormat(legacyRoot), {
      kind: "old-format",
      legacyNoteCount: 1,
      plainNoteCount: 0,
      sidecarCount: 0,
    })
    assert.deepEqual(detectStorageFormat(newRoot), {
      kind: "new-format",
      legacyNoteCount: 0,
      plainNoteCount: 2,
      sidecarCount: 2,
    })
    assert.deepEqual(detectStorageFormat(mixedRoot), {
      kind: "mixed-format",
      legacyNoteCount: 1,
      plainNoteCount: 1,
      sidecarCount: 1,
    })
  } finally {
    await Promise.all([
      rm(emptyRoot, { recursive: true, force: true }),
      rm(legacyRoot, { recursive: true, force: true }),
      rm(newRoot, { recursive: true, force: true }),
      rm(mixedRoot, { recursive: true, force: true }),
    ])
  }
})

test("detectStorageFormat classifies archived-only migrated roots as new-format", async () => {
  const rootPath = await createRoot("bluenote-migration-archived-only-")
  const archivedRelativePath = ".data/archive/archived-only.md"

  try {
    await writeFile(path.join(rootPath, archivedRelativePath), "Archived-only body.\n", "utf8")
    await writeFile(
      path.join(rootPath, ".data", "notes", "archived-only.json"),
      sidecarJson({
        key: "archived-only",
        title: "Archived Only",
        description: "Archived-only body.",
        relativePath: archivedRelativePath,
        archivedAt: "2026-05-22T12:00:00.000Z",
      }),
      "utf8",
    )

    assert.deepEqual(detectStorageFormat(rootPath), {
      kind: "new-format",
      legacyNoteCount: 0,
      plainNoteCount: 1,
      sidecarCount: 1,
    })
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("detectStorageFormat rejects active plain notes that are missing sidecars", async () => {
  const rootPath = await createRoot("bluenote-migration-orphan-active-")
  const archivedRelativePath = ".data/archive/archived-note.md"

  try {
    await writeFile(path.join(rootPath, "note", "orphan-active.md"), "Orphan active body.\n", "utf8")
    await writeFile(path.join(rootPath, archivedRelativePath), "Archived body.\n", "utf8")
    await writeFile(
      path.join(rootPath, ".data", "notes", "archived-note.json"),
      sidecarJson({
        key: "archived-note",
        title: "Archived Note",
        description: "Archived body.",
        relativePath: archivedRelativePath,
        archivedAt: "2026-05-22T12:00:00.000Z",
      }),
      "utf8",
    )

    assert.deepEqual(detectStorageFormat(rootPath), {
      kind: "mixed-format",
      legacyNoteCount: 0,
      plainNoteCount: 2,
      sidecarCount: 1,
    })
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("detectStorageFormat accepts draft sidecars in Phase 7 layout", async () => {
  const rootPath = await createRoot("bluenote-migration-draft-sidecar-")
  const draftRelativePath = "draft/draft-a8k2p9.md"

  try {
    await writeFile(path.join(rootPath, draftRelativePath), "Draft body.\n", "utf8")
    await writeFile(
      path.join(rootPath, ".data", "notes", "draft-a8k2p9.json"),
      sidecarJson({
        type: "draft",
        key: "draft-a8k2p9",
        title: "draft-a8k2p9",
        description: "Draft body.",
        relativePath: draftRelativePath,
      }),
      "utf8",
    )

    assert.deepEqual(detectStorageFormat(rootPath), {
      kind: "new-format",
      legacyNoteCount: 0,
      plainNoteCount: 1,
      sidecarCount: 1,
    })
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("detectStorageFormat rejects malformed legacy frontmatter instead of silently treating it as plain text", async () => {
  const rootPath = await createRoot("bluenote-migration-invalid-frontmatter-")

  try {
    await writeFile(
      path.join(rootPath, "notes", "inbox", "broken-legacy.md"),
      "---\nid: broken-legacy\ntitle: Missing fields\n---\nBody stays here.\n",
      "utf8",
    )

    assert.throws(() => detectStorageFormat(rootPath), /Invalid frontmatter/i)
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("migrateLegacyStorage converts legacy frontmatter notes into plain notes, sidecars, recovery artifacts, and rebuilt indexes", async () => {
  const rootPath = await createRoot("bluenote-migration-success-")
  const legacyInboxPath = path.join(rootPath, "notes", "inbox", "123e4567-e89b-12d3-a456-426614174000.md")
  const legacyArchivePath = path.join(rootPath, "notes", "archive", "123e4567-e89b-12d3-a456-426614174001.md")
  const inboxBody = "Alpha launch workstream needs a calmer migration path.\n"
  const archiveBody = "Archived checklist keeps the rollback breadcrumbs intact.\n"

  try {
    await writeFile(
      legacyInboxPath,
      legacyNoteMarkdown({
        id: "123e4567-e89b-12d3-a456-426614174000",
        title: "Alpha Launch Plan",
        body: inboxBody,
        createdAt: LEGACY_CREATED_AT,
        updatedAt: LEGACY_UPDATED_AT,
      }),
      "utf8",
    )
    await writeFile(
      legacyArchivePath,
      legacyNoteMarkdown({
        id: "123e4567-e89b-12d3-a456-426614174001",
        title: "Archived Rollback Checklist",
        body: archiveBody,
        createdAt: LEGACY_CREATED_AT,
        updatedAt: LEGACY_UPDATED_AT,
        archivedAt: LEGACY_ARCHIVED_AT,
      }),
      "utf8",
    )

    const migrated = migrateLegacyStorage({
      rootPath,
      migratedAt: MIGRATED_AT,
      randomSource: () => 0x12345678,
    })

    const inboxKey = createNoteKey("Alpha Launch Plan", { randomSource: () => 0x12345678 })
    const archiveKey = createNoteKey("Archived Rollback Checklist", { randomSource: () => 0x12345678 })
    const migratedInboxRelativePath = `note/${inboxKey}.md`
    const migratedArchiveRelativePath = `.data/archive/${archiveKey}.md`

    assert.equal(migrated.status, "migrated")
    assert.equal(migrated.migratedNoteCount, 2)
    assert.equal(migrated.rootPath, rootPath)
    assert.deepEqual(migrated.keyMap, {
      "123e4567-e89b-12d3-a456-426614174000": inboxKey,
      "123e4567-e89b-12d3-a456-426614174001": archiveKey,
    })

    await assert.rejects(() => readFile(legacyInboxPath, "utf8"))
    await assert.rejects(() => readFile(legacyArchivePath, "utf8"))
    assert.equal(await readFile(path.join(rootPath, migratedInboxRelativePath), "utf8"), inboxBody)
    assert.equal(await readFile(path.join(rootPath, migratedArchiveRelativePath), "utf8"), archiveBody)

    assert.deepEqual(JSON.parse(await readFile(path.join(rootPath, ".data", "notes", `${inboxKey}.json`), "utf8")), {
      type: "normal",
      key: inboxKey,
      title: "Alpha Launch Plan",
      description: createNoteDescription(inboxBody),
      relativePath: migratedInboxRelativePath,
      createdAt: LEGACY_CREATED_AT,
      updatedAt: LEGACY_UPDATED_AT,
      archivedAt: null,
      namingVersion: 1,
    })
    assert.deepEqual(JSON.parse(await readFile(path.join(rootPath, ".data", "notes", `${archiveKey}.json`), "utf8")), {
      type: "archived",
      key: archiveKey,
      title: "Archived Rollback Checklist",
      description: createNoteDescription(archiveBody),
      relativePath: migratedArchiveRelativePath,
      createdAt: LEGACY_CREATED_AT,
      updatedAt: LEGACY_ARCHIVED_AT,
      archivedAt: LEGACY_ARCHIVED_AT,
      namingVersion: 1,
    })

    const recoveryEntries = (await readdir(path.join(rootPath, ".data", "recovery"))).sort()
    assert.equal(recoveryEntries.length, 1)
    assert.match(recoveryEntries[0] ?? "", /^migrate-2026-05-24T12-00-00-000Z$/)

    const recoveryPath = path.join(rootPath, ".data", "recovery", recoveryEntries[0]!)
    assert.deepEqual(JSON.parse(await readFile(path.join(recoveryPath, "key-map.json"), "utf8")), {
      migratedAt: MIGRATED_AT,
      notes: [
        {
          previousId: "123e4567-e89b-12d3-a456-426614174000",
          nextKey: inboxKey,
          previousRelativePath: "notes/inbox/123e4567-e89b-12d3-a456-426614174000.md",
          nextRelativePath: migratedInboxRelativePath,
        },
        {
          previousId: "123e4567-e89b-12d3-a456-426614174001",
          nextKey: archiveKey,
          previousRelativePath: "notes/archive/123e4567-e89b-12d3-a456-426614174001.md",
          nextRelativePath: migratedArchiveRelativePath,
        },
      ],
    })
    assert.equal(
      await readFile(path.join(recoveryPath, "notes", "inbox", "123e4567-e89b-12d3-a456-426614174000.md"), "utf8"),
      legacyNoteMarkdown({
        id: "123e4567-e89b-12d3-a456-426614174000",
        title: "Alpha Launch Plan",
        body: inboxBody,
        createdAt: LEGACY_CREATED_AT,
        updatedAt: LEGACY_UPDATED_AT,
      }),
    )
    assert.equal(
      await readFile(path.join(recoveryPath, "notes", "archive", "123e4567-e89b-12d3-a456-426614174001.md"), "utf8"),
      legacyNoteMarkdown({
        id: "123e4567-e89b-12d3-a456-426614174001",
        title: "Archived Rollback Checklist",
        body: archiveBody,
        createdAt: LEGACY_CREATED_AT,
        updatedAt: LEGACY_UPDATED_AT,
        archivedAt: LEGACY_ARCHIVED_AT,
      }),
    )

    const store = loadIndexStore(rootPath)
    assert.deepEqual(store.listAllSummaries(), [
      {
        key: archiveKey,
        id: archiveKey,
        title: "Archived Rollback Checklist",
        description: createNoteDescription(archiveBody),
        relativePath: migratedArchiveRelativePath,
        createdAt: LEGACY_CREATED_AT,
        updatedAt: LEGACY_ARCHIVED_AT,
        archivedAt: LEGACY_ARCHIVED_AT,
      },
      {
        key: inboxKey,
        id: inboxKey,
        title: "Alpha Launch Plan",
        description: createNoteDescription(inboxBody),
        relativePath: migratedInboxRelativePath,
        createdAt: LEGACY_CREATED_AT,
        updatedAt: LEGACY_UPDATED_AT,
        archivedAt: null,
      },
    ])
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("migrateLegacyStorage removes partial derived indexes and restores legacy notes when rebuild fails", async () => {
  const rootPath = await createRoot("bluenote-migration-rollback-")
  const randomSource = () => 0.1234
  const legacyKey = createNoteKey("Rollback Recovery Note", { randomSource })
  const migratedRelativePath = `note/${legacyKey}.md`
  const legacyRelativePath = "notes/inbox/legacy-rollback-uuid.md"
  const legacyPath = path.join(rootPath, legacyRelativePath)
  const migratedPath = path.join(rootPath, migratedRelativePath)
  const sidecarPath = path.join(rootPath, ".data", "notes", `${legacyKey}.json`)
  const metadataPath = path.join(rootPath, ".data", "metadata.sqlite")
  const searchIndexPath = path.join(rootPath, ".data", "search-index.json")
  const legacyMarkdown = legacyNoteMarkdown({
    id: "legacy-rollback-uuid",
    title: "Rollback Recovery Note",
    body: "Body that should survive a failed rebuild.\n",
    createdAt: LEGACY_CREATED_AT,
    updatedAt: LEGACY_UPDATED_AT,
  })

  try {
    await writeFile(legacyPath, legacyMarkdown, "utf8")
    await writeFile(metadataPath, "stale-metadata", "utf8")
    await writeFile(searchIndexPath, '{"stale":true}\n', "utf8")

    assert.throws(
      () =>
        migrateLegacyStorage({
          rootPath,
          migratedAt: MIGRATED_AT,
          randomSource,
          testHooks: {
            rebuildIndexes() {
              throw new Error("simulated rebuild write failure")
            },
          },
        }),
      /Legacy storage migration failed after rollback|simulated rebuild write failure|rebuild/i,
    )

    assert.equal(await readFile(legacyPath, "utf8"), legacyMarkdown)
    await assert.rejects(() => access(migratedPath))
    await assert.rejects(() => access(sidecarPath))
    await assert.rejects(() => access(metadataPath))
    await assert.rejects(() => access(searchIndexPath))
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("migrateLegacyStorage is a calm no-op for already migrated roots and rejects mixed roots", async () => {
  const newRoot = await createRoot("bluenote-migration-noop-")
  const mixedRoot = await createRoot("bluenote-migration-mixed-error-")

  try {
    const relativePath = "note/already-new-51u7i0.md"
    await writeFile(path.join(newRoot, relativePath), "Already migrated body.\n", "utf8")
    await writeFile(
      path.join(newRoot, ".data", "notes", "already-new-51u7i0.json"),
      sidecarJson({
        key: "already-new-51u7i0",
        title: "Already New",
        description: "Already migrated body.",
        relativePath,
      }),
      "utf8",
    )
    const archivedNoopRelativePath = ".data/archive/already-archived-new.md"
    await writeFile(path.join(newRoot, archivedNoopRelativePath), "Already archived new body.\n", "utf8")
    await writeFile(
      path.join(newRoot, ".data", "notes", "already-archived-new.json"),
      sidecarJson({
        key: "already-archived-new",
        title: "Already Archived New",
        description: "Already archived new body.",
        relativePath: archivedNoopRelativePath,
        archivedAt: "2026-05-22T12:00:00.000Z",
      }),
      "utf8",
    )

    await writeFile(
      path.join(mixedRoot, "notes", "inbox", "legacy-uuid-3.md"),
      legacyNoteMarkdown({
        id: "legacy-uuid-3",
        title: "Mixed Legacy",
        body: "Mixed body.\n",
      }),
      "utf8",
    )
    await writeFile(path.join(mixedRoot, relativePath), "Already migrated body.\n", "utf8")
    await writeFile(
      path.join(mixedRoot, ".data", "notes", "already-new-51u7i0.json"),
      sidecarJson({
        key: "already-new-51u7i0",
        title: "Already New",
        description: "Already migrated body.",
        relativePath,
      }),
      "utf8",
    )

    assert.deepEqual(migrateLegacyStorage({ rootPath: newRoot, migratedAt: MIGRATED_AT }), {
      status: "noop",
      reason: "new-format",
      rootPath: newRoot,
      migratedNoteCount: 0,
      keyMap: {},
    })

    assert.throws(
      () => migrateLegacyStorage({ rootPath: mixedRoot, migratedAt: MIGRATED_AT }),
      /mixed-format/i,
    )
  } finally {
    await Promise.all([
      rm(newRoot, { recursive: true, force: true }),
      rm(mixedRoot, { recursive: true, force: true }),
    ])
  }
})
