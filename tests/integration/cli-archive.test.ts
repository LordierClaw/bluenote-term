import { test } from "bun:test"
import assert from "node:assert/strict"
import path from "node:path"
import { access, mkdir, readFile, writeFile } from "node:fs/promises"

import { createManagedRootHarness } from "../helpers/cli"

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
  await harnessLikeWrite(rootPath, relativePath, body)
  await harnessLikeWrite(
    rootPath,
    path.join(".data", "notes", `${key}.json`),
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
  )
}

async function harnessLikeWrite(rootPath: string, relativePath: string, contents: string) {
  const targetPath = path.join(rootPath, relativePath)
  await mkdir(path.dirname(targetPath), { recursive: true })
  await writeFile(targetPath, contents, "utf8")
}

test("bn archive <selector> moves the plain note to notes/archive, preserves the key, updates the sidecar path, and rebuilds automatically", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-archive-")

  try {
    await writePlainNoteWithSidecar(harness.rootPath, {
      key: "archive-target",
      title: "Archive Target",
      description: "Searchable before archive.",
      relativePath: "notes/inbox/archive-target.md",
      body: "Searchable before archive.\n",
    })
    await writePlainNoteWithSidecar(harness.rootPath, {
      key: "still-active",
      title: "Still Active",
      description: "Remains visible.",
      relativePath: "notes/inbox/still-active.md",
      body: "Remains visible.\n",
      createdAt: "2026-05-21T10:16:00.000Z",
    })

    const archiveResult = harness.run(["archive", "archive-target"])
    assert.equal(archiveResult.exitCode, 0)
    assert.equal(archiveResult.stderr, "")
    assert.match(archiveResult.stdout, /Archived note: notes[\\/]archive[\\/]archive-target\.md/)

    await assert.rejects(() => access(path.join(harness.rootPath, "notes", "inbox", "archive-target.md")))

    const archivedRelativePath = "notes/archive/archive-target.md"
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
      await readFile(path.join(harness.rootPath, ".data", "notes", "archive-target.json"), "utf8"),
    )
    assert.equal(archivedSidecar.key, "archive-target")
    assert.equal(archivedSidecar.relativePath, archivedRelativePath)
    assert.match(archivedSidecar.archivedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)

    const listResult = harness.run(["list"])
    assert.equal(listResult.exitCode, 0)
    assert.match(listResult.stdout, /Still Active\s+still-active\s+Remains visible\.\s+notes[\\/]inbox[\\/]still-active\.md/)
    assert.doesNotMatch(listResult.stdout, /archive-target/)

    const searchResult = harness.run(["search", "Searchable before archive"])
    assert.equal(searchResult.exitCode, 0)
    assert.equal(searchResult.stdout, 'No notes matched "Searchable before archive".\n')
  } finally {
    await harness.cleanup()
  }
})

test("bn archive rejects notes that are already archived", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-archive-")

  try {
    await writePlainNoteWithSidecar(harness.rootPath, {
      key: "already-archived",
      title: "Already Archived",
      description: "Already archived.",
      relativePath: "notes/archive/already-archived.md",
      body: "Already archived.\n",
      archivedAt: "2026-05-21T11:00:00.000Z",
    })

    const archiveResult = harness.run(["archive", "already-archived"])
    assert.equal(archiveResult.exitCode, 1)
    assert.equal(archiveResult.stdout, "")
    assert.match(archiveResult.stderr, /Note 'notes[\\/]archive[\\/]already-archived\.md' is already archived\./)

    const showResult = harness.run(["show", "notes/archive/already-archived.md"])
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

test("bn archive requires a selector argument in <key|path> form", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-archive-usage-")

  try {
    const result = harness.run(["archive"])

    assert.equal(result.exitCode, 1)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /Missing required selector for archive\./)
    assert.match(result.stderr, /Hint: Run bn archive <key\|path>\./)
  } finally {
    await harness.cleanup()
  }
})