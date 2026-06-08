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
    type = archivedAt === null ? "normal" : "archived",
  }: {
    key: string
    title: string
    description: string
    relativePath: string
    body: string
    archivedAt?: string | null
    createdAt?: string
    updatedAt?: string
    type?: "normal" | "draft" | "archived"
  },
) {
  await harnessLikeWrite(rootPath, relativePath, body)
  await harnessLikeWrite(
    rootPath,
    path.join(".data", "notes", `${key}.json`),
    JSON.stringify(
      {
        type,
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

test("bn archive <selector> moves the plain note to .data/archive, preserves the key, updates the sidecar path, and rebuilds automatically", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-archive-")

  try {
    await writePlainNoteWithSidecar(harness.rootPath, {
      key: "archive-target",
      title: "Archive Target",
      description: "Searchable before archive.",
      relativePath: "note/archive-target.md",
      body: "Searchable before archive.\n",
    })
    await writePlainNoteWithSidecar(harness.rootPath, {
      key: "still-active",
      title: "Still Active",
      description: "Remains visible.",
      relativePath: "note/still-active.md",
      body: "Remains visible.\n",
      createdAt: "2026-05-21T10:16:00.000Z",
    })

    const archiveResult = harness.run(["archive", "archive-target"])
    assert.equal(archiveResult.exitCode, 0)
    assert.equal(archiveResult.stderr, "")
    assert.match(archiveResult.stdout, /Archived note: \.data[\\/]archive[\\/]archive-target\.md/)

    await assert.rejects(() => access(path.join(harness.rootPath, "note", "archive-target.md")))

    const archivedRelativePath = path.join(".data", "archive", "archive-target.md")
    const archivedMarkdown = await readFile(path.join(harness.rootPath, archivedRelativePath), "utf8")
    assert.equal(archivedMarkdown, "Searchable before archive.\n")

    const archivedSidecar = JSON.parse(
      await readFile(path.join(harness.rootPath, ".data", "notes", "archive-target.json"), "utf8"),
    )
    assert.equal(archivedSidecar.key, "archive-target")
    assert.equal(archivedSidecar.type, "archived")
    assert.equal(archivedSidecar.relativePath, archivedRelativePath)
    assert.match(archivedSidecar.archivedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    assert.equal(archivedSidecar.updatedAt, archivedSidecar.archivedAt)

    const listResult = harness.run(["list"])
    assert.equal(listResult.exitCode, 0)
    assert.match(listResult.stdout, /Still Active\s+still-active\s+Remains visible\.\s+note[\\/]still-active\.md/)
    assert.doesNotMatch(listResult.stdout, /archive-target/)

    const searchResult = harness.run(["search", "Searchable before archive"])
    assert.equal(searchResult.exitCode, 0)
    assert.equal(searchResult.stdout, 'No notes matched "Searchable before archive".\n')
  } finally {
    await harness.cleanup()
  }
}, 30_000)

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