import { test } from "bun:test"
import assert from "node:assert/strict"
import path from "node:path"
import { mkdir, rm, writeFile } from "node:fs/promises"

import { createManagedRootHarness } from "../helpers/cli"

async function writePlainNoteWithSidecar(
  rootPath: string,
  {
    key,
    title,
    description,
    relativePath,
    body,
    createdAt = "2026-05-21T10:15:00.000Z",
  }: {
    key: string
    title: string
    description: string
    relativePath: string
    body: string
    createdAt?: string
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
        type: "normal",
        key,
        title,
        description,
        relativePath,
        createdAt,
        updatedAt: createdAt,
        archivedAt: null,
        namingVersion: 1,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  )
}

test("bn search <query> returns grouped note blocks with ranked match details", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-search-")

  try {
    await writePlainNoteWithSidecar(harness.rootPath, {
      key: "note-comet",
      title: "Project Comet",
      description: "Project comet planning notes.",
      relativePath: "note/note-comet.md",
      body: "Project comet planning notes.\n",
    })
    await writePlainNoteWithSidecar(harness.rootPath, {
      key: "note-nebula",
      title: "Nebula Retrospective",
      description: "This body mentions project comet once.",
      relativePath: "note/journal/note-nebula.md",
      body: "This body mentions project comet once.\n",
      createdAt: "2026-05-21T11:15:00.000Z",
    })

    const rebuildResult = harness.run(["rebuild"])
    assert.equal(rebuildResult.exitCode, 0)

    const result = harness.run(["search", "project", "comet"])

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    const stdout = result.stdout
    assert.match(stdout, /^Project Comet\n  key: note-comet\n  path: note[\\/]note-comet\.md\n  match: title/m)
    assert.match(stdout, /Nebula Retrospective\n  key: note-nebula\n  path: note[\\/]journal[\\/]note-nebula\.md\n  match: description/)
    assert.ok(stdout.indexOf("Project Comet") < stdout.indexOf("Nebula Retrospective"))
  } finally {
    await harness.cleanup()
  }
}, 15_000)

test("bn list and bn search prefer derived index data when available", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-search-index-preferred-")

  try {
    await writePlainNoteWithSidecar(harness.rootPath, {
      key: "note-alpha",
      title: "Alpha Note",
      description: "Alpha body mentions comet.",
      relativePath: "note/note-alpha.md",
      body: "Alpha body mentions comet.\n",
    })

    const rebuildResult = harness.run(["rebuild"])
    assert.equal(rebuildResult.exitCode, 0)

    await rm(path.join(harness.rootPath, "note"), { recursive: true, force: true })

    const listResult = harness.run(["list"])
    assert.equal(listResult.exitCode, 0)
    assert.match(listResult.stdout, /Alpha Note\s+note-alpha\s+Alpha body mentions comet\.\s+note[\\/]note-alpha\.md/)

    const searchResult = harness.run(["search", "comet"])
    assert.equal(searchResult.exitCode, 0)
    assert.match(searchResult.stdout, /^Alpha Note\n  key: note-alpha\n  path: note[\\/]note-alpha\.md\n  match: description/m)
  } finally {
    await harness.cleanup()
  }
}, 15_000)

test("bn search returns a calm no-result message when nothing matches", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-search-no-results-")

  try {
    await writePlainNoteWithSidecar(harness.rootPath, {
      key: "note-alpha",
      title: "Alpha Note",
      description: "Alpha body mentions comet.",
      relativePath: "note/note-alpha.md",
      body: "Alpha body mentions comet.\n",
    })

    const rebuildResult = harness.run(["rebuild"])
    assert.equal(rebuildResult.exitCode, 0)

    const result = harness.run(["search", "saturn"])

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.equal(result.stdout, 'No notes matched "saturn".\n')
  } finally {
    await harness.cleanup()
  }
}, 15_000)

test("bn search 123 only prints notes with fields containing 123", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-search-contains-numeric-")

  try {
    await writePlainNoteWithSidecar(harness.rootPath, {
      key: "note-receipt",
      title: "Receipt 123",
      description: "Purchase details.",
      relativePath: "note/note-receipt.md",
      body: "Purchase details.\n",
    })
    await writePlainNoteWithSidecar(harness.rootPath, {
      key: "note-meeting",
      title: "Meeting Notes",
      description: "Planning details.",
      relativePath: "note/meetings-123/note-meeting.md",
      body: "Planning details.\n",
    })
    await writePlainNoteWithSidecar(harness.rootPath, {
      key: "note-body",
      title: "Body Only",
      description: "First line.",
      relativePath: "note/note-body.md",
      body: "First line.\nTracking code 123 appears here.\n",
    })
    await writePlainNoteWithSidecar(harness.rootPath, {
      key: "note-cat",
      title: "a-big-cat",
      description: "a-big-cat reference.",
      relativePath: "note/note-cat.md",
      body: "a-big-cat reference.\n",
    })

    const rebuildResult = harness.run(["rebuild"])
    assert.equal(rebuildResult.exitCode, 0)

    const result = harness.run(["search", "123"])

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.match(result.stdout, /^Receipt 123\n  key: note-receipt\n  path: note[\\/]note-receipt\.md\n  match: title/m)
    assert.match(result.stdout, /^Meeting Notes\n  key: note-meeting\n  path: note[\\/]meetings-123[\\/]note-meeting\.md\n  match: key\/path/m)
    assert.match(result.stdout, /^Body Only\n  key: note-body\n  path: note[\\/]note-body\.md\n  match: content line 2/m)
    assert.doesNotMatch(result.stdout, /a-big-cat/)

    const compactResult = harness.run(["search", "abc"])
    assert.equal(compactResult.exitCode, 0)
    assert.equal(compactResult.stderr, "")
    assert.doesNotMatch(compactResult.stdout, /a-big-cat/)
  } finally {
    await harness.cleanup()
  }
}, 15_000)

test("bn search finds arbitrary substring contains matches through the real index", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-search-substring-")

  try {
    await writePlainNoteWithSidecar(harness.rootPath, {
      key: "note-alpha",
      title: "Alpha Project",
      description: "Opening line.",
      relativePath: "note/note-alpha.md",
      body: "Opening line.\nBody contains foobar for substring search.\n",
    })

    const rebuildResult = harness.run(["rebuild"])
    assert.equal(rebuildResult.exitCode, 0)

    const titleResult = harness.run(["search", "pha"])
    assert.equal(titleResult.exitCode, 0)
    assert.equal(titleResult.stderr, "")
    assert.match(titleResult.stdout, /^Alpha Project\n  key: note-alpha\n  path: note[\\/]note-alpha\.md\n  match: title/m)

    const bodyResult = harness.run(["search", "oba"])
    assert.equal(bodyResult.exitCode, 0)
    assert.equal(bodyResult.stderr, "")
    assert.match(bodyResult.stdout, /^Alpha Project\n  key: note-alpha\n  path: note[\\/]note-alpha\.md\n  match: content line 2/m)
  } finally {
    await harness.cleanup()
  }
}, 15_000)

test("bn search returns actionable rebuild guidance when derived indexes are missing", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-search-missing-index-")

  try {
    await writePlainNoteWithSidecar(harness.rootPath, {
      key: "note-alpha",
      title: "Alpha Note",
      description: "Alpha body mentions comet.",
      relativePath: "note/note-alpha.md",
      body: "Alpha body mentions comet.\n",
    })

    const result = harness.run(["search", "comet"])

    assert.equal(result.exitCode, 2)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /Derived indexes are unavailable\./)
    assert.match(result.stderr, /Hint: Run bn rebuild to recreate \.data artifacts from note files and sidecars\./)
  } finally {
    await harness.cleanup()
  }
})
