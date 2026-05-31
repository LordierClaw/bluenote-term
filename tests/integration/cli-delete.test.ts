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

test("bn delete <key|path> --force removes the note file and sidecar and rebuilds automatically", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-delete-")

  try {
    const relativePath = "notes/inbox/delete-target.md"
    await writePlainNoteWithSidecar(harness.rootPath, {
      key: "delete-target",
      title: "Delete Target",
      description: "Disposable note.",
      relativePath,
      body: "Disposable note.\n",
    })
    await writePlainNoteWithSidecar(harness.rootPath, {
      key: "still-active",
      title: "Still Active",
      description: "Still visible.",
      relativePath: "notes/inbox/still-active.md",
      body: "Still visible.\n",
      createdAt: "2026-05-21T10:16:00.000Z",
    })

    const result = harness.run(["delete", "delete-target", "--force"])

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.match(result.stdout, /Deleted note: notes[\\/]inbox[\\/]delete-target\.md/)

    await assert.rejects(() => access(path.join(harness.rootPath, relativePath)))
    await assert.rejects(() => access(path.join(harness.rootPath, ".data", "notes", "delete-target.json")))

    const showResult = harness.run(["show", "delete-target"])
    assert.equal(showResult.exitCode, 1)
    assert.match(showResult.stderr, /Could not find a note matching selector 'delete-target'\./)

    const listResult = harness.run(["list"])
    assert.equal(listResult.exitCode, 0)
    assert.match(listResult.stdout, /Still Active\s+still-active\s+Still visible\.\s+notes[\\/]inbox[\\/]still-active\.md/)
    assert.doesNotMatch(listResult.stdout, /delete-target/)

    const searchResult = harness.run(["search", "Disposable note"])
    assert.equal(searchResult.exitCode, 0)
    assert.equal(searchResult.stdout, 'No notes matched "Disposable note".\n')
  } finally {
    await harness.cleanup()
  }
})

test("bn delete requires --force", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-delete-")

  try {
    const relativePath = "notes/inbox/delete-target.md"
    await writePlainNoteWithSidecar(harness.rootPath, {
      key: "delete-target",
      title: "Delete Target",
      description: "Disposable note.",
      relativePath,
      body: "Disposable note.\n",
    })

    const result = harness.run(["delete", "delete-target"])

    assert.equal(result.exitCode, 1)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /Deleting notes requires --force\./)
    assert.match(result.stderr, /Run bn delete <key\|path> --force to confirm permanent removal\./)

    assert.equal(await readFile(path.join(harness.rootPath, relativePath), "utf8"), "Disposable note.\n")
    assert.equal(
      JSON.parse(await readFile(path.join(harness.rootPath, ".data", "notes", "delete-target.json"), "utf8")).key,
      "delete-target",
    )
  } finally {
    await harness.cleanup()
  }
})
