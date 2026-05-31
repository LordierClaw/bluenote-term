import { test } from "bun:test"
import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"

import { SelectorNotFoundError } from "../../../src/core/errors"
import { selectNote } from "../../../src/core/select-note"
import { createNoteRepository } from "../../../src/storage/note-repository"

async function withRepository(
  build: (rootPath: string) => Promise<void>,
  run: (repository: ReturnType<typeof createNoteRepository>) => Promise<void> | void,
) {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-select-note-"))

  try {
    await build(rootPath)
    await run(createNoteRepository(rootPath))
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
}

async function writePlainNoteWithSidecar(
  rootPath: string,
  {
    key,
    title,
    relativePath,
    body,
    description = "Example description.",
  }: {
    key: string
    title: string
    relativePath: string
    body: string
    description?: string
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
        createdAt: "2026-05-21T10:15:00.000Z",
        updatedAt: "2026-05-21T10:15:00.000Z",
        archivedAt: null,
        namingVersion: 1,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  )
}

async function writeLegacyFrontmatterNote(
  rootPath: string,
  {
    frontmatterId,
    title,
    relativePath,
    body,
  }: {
    frontmatterId: string
    title: string
    relativePath: string
    body: string
  },
) {
  const notePath = path.join(rootPath, relativePath)

  await mkdir(path.dirname(notePath), { recursive: true })
  await writeFile(
    notePath,
    [
      "---",
      `id: ${frontmatterId}`,
      "schemaVersion: 1",
      `title: ${title}`,
      "mode: plain",
      "tags: []",
      "createdAt: 2026-05-21T10:15:00.000Z",
      "updatedAt: 2026-05-21T10:15:00.000Z",
      "---",
      body.trimEnd(),
      "",
    ].join("\n"),
    "utf8",
  )
}

test("selectNote resolves an exact sidecar key before considering slug matches", async () => {
  await withRepository(
    async (rootPath) => {
      await writePlainNoteWithSidecar(rootPath, {
        key: "project-retrospective",
        title: "Direct Key Match",
        relativePath: path.join("notes", "inbox", "project-retrospective.md"),
        body: "Direct key body.\n",
      })
      await writePlainNoteWithSidecar(rootPath, {
        key: "different-key",
        title: "Project Retrospective",
        relativePath: path.join("notes", "journal", "different-key.md"),
        body: "Slug body.\n",
      })
    },
    (repository) => {
      const selected = selectNote({ repository, selector: "project-retrospective" })

      assert.equal(selected.frontmatter.id, "project-retrospective")
      assert.equal(selected.sourcePath, path.join("notes", "inbox", "project-retrospective.md"))
      assert.equal(selected.frontmatter.title, "Direct Key Match")
    },
  )
})

test("selectNote resolves an exact managed-root-relative path as a fallback", async () => {
  await withRepository(
    async (rootPath) => {
      await writePlainNoteWithSidecar(rootPath, {
        key: "archive-key",
        title: "Archive Note",
        relativePath: path.join("notes", "archive", "archive-key.md"),
        body: "Archive body.\n",
      })
    },
    (repository) => {
      const selected = selectNote({ repository, selector: path.join("notes", "archive", "archive-key.md") })

      assert.equal(selected.frontmatter.id, "archive-key")
      assert.equal(selected.sourcePath, path.join("notes", "archive", "archive-key.md"))
    },
  )
})

test("selectNote rejects non-canonical normalized path aliases", async () => {
  await withRepository(
    async (rootPath) => {
      await writePlainNoteWithSidecar(rootPath, {
        key: "archive-key",
        title: "Archive Note",
        relativePath: path.join("notes", "archive", "archive-key.md"),
        body: "Archive body.\n",
      })
    },
    (repository) => {
      assert.throws(
        () =>
          selectNote({
            repository,
            selector: `notes${path.sep}journal${path.sep}..${path.sep}archive${path.sep}archive-key.md`,
          }),
        (error) => {
          assert.ok(error instanceof SelectorNotFoundError)
          assert.match(error.message, /Could not find a note matching selector 'notes[\\/]journal[\\/]\.\.[\\/]archive[\\/]archive-key\.md'\./)
          return true
        },
      )
    },
  )
})

test("selectNote resolves a legacy frontmatter note by basename instead of UUID frontmatter id", async () => {
  await withRepository(
    async (rootPath) => {
      await writeLegacyFrontmatterNote(rootPath, {
        frontmatterId: "123e4567-e89b-12d3-a456-426614174000",
        title: "Legacy UUID Note",
        relativePath: path.join("notes", "inbox", "human-key.md"),
        body: "Legacy body.\n",
      })
    },
    (repository) => {
      const selected = selectNote({ repository, selector: "human-key" })

      assert.equal(selected.frontmatter.id, "123e4567-e89b-12d3-a456-426614174000")
      assert.equal(selected.sourcePath, path.join("notes", "inbox", "human-key.md"))
    },
  )
})

test("selectNote rejects legacy frontmatter ids as user-facing selectors", async () => {
  await withRepository(
    async (rootPath) => {
      await writeLegacyFrontmatterNote(rootPath, {
        frontmatterId: "legacy-id-123",
        title: "Legacy ID Note",
        relativePath: path.join("notes", "inbox", "human-key.md"),
        body: "Legacy body.\n",
      })
    },
    (repository) => {
      assert.throws(
        () => selectNote({ repository, selector: "legacy-id-123" }),
        (error) => {
          assert.ok(error instanceof SelectorNotFoundError)
          assert.match(error.message, /Could not find a note matching selector 'legacy-id-123'\./)
          return true
        },
      )
    },
  )
})

test("selectNote resolves an exact key match even when a legacy frontmatter id collides with it", async () => {
  await withRepository(
    async (rootPath) => {
      await writePlainNoteWithSidecar(rootPath, {
        key: "foo",
        title: "Key Foo Note",
        relativePath: path.join("notes", "inbox", "foo.md"),
        body: "Key body.\n",
      })
      await writeLegacyFrontmatterNote(rootPath, {
        frontmatterId: "foo",
        title: "Legacy ID Foo Note",
        relativePath: path.join("notes", "journal", "legacy-human-key.md"),
        body: "Legacy body.\n",
      })
    },
    (repository) => {
      const selected = selectNote({ repository, selector: "foo" })

      assert.equal(selected.frontmatter.id, "foo")
      assert.equal(selected.sourcePath, path.join("notes", "inbox", "foo.md"))
    },
  )
})

test("selectNote rejects title-derived slug selectors", async () => {
  await withRepository(
    async (rootPath) => {
      await writePlainNoteWithSidecar(rootPath, {
        key: "project-retro",
        title: "Project Retrospective",
        relativePath: path.join("notes", "journal", "project-retro.md"),
        body: "Project body.\n",
      })
    },
    (repository) => {
      assert.throws(
        () => selectNote({ repository, selector: "project-retrospective" }),
        (error) => {
          assert.ok(error instanceof SelectorNotFoundError)
          assert.match(error.message, /Could not find a note matching selector 'project-retrospective'\./)
          return true
        },
      )
    },
  )
})

test("selectNote suggests close note keys when a selector does not match", async () => {
  await withRepository(
    async (rootPath) => {
      await writePlainNoteWithSidecar(rootPath, {
        key: "show-note",
        title: "Show Note",
        relativePath: path.join("notes", "inbox", "show-note.md"),
        body: "Show body.\n",
      })
      await writePlainNoteWithSidecar(rootPath, {
        key: "slow-note",
        title: "Slow Note",
        relativePath: path.join("notes", "journal", "slow-note.md"),
        body: "Slow body.\n",
      })
    },
    (repository) => {
      assert.throws(
        () => selectNote({ repository, selector: "shoe-note" }),
        (error) => {
          assert.ok(error instanceof SelectorNotFoundError)
          assert.match(error.message, /Could not find a note matching selector 'shoe-note'\./)
          assert.equal(error.hint, "Did you mean: show-note, slow-note?")
          return true
        },
      )
    },
  )
})
