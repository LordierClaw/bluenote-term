import test from "node:test"
import assert from "node:assert/strict"
import path from "node:path"

import { AmbiguousSelectorError } from "../../../src/core/errors"
import { selectNote } from "../../../src/core/select-note"
import { createNoteRepository } from "../../../src/storage/note-repository"

const fixtureRoot = path.resolve(import.meta.dir, "../../fixtures/ambiguous-selectors")

test("selectNote prefers an exact ID match over a slug match", () => {
  const repository = createNoteRepository(fixtureRoot)

  const selected = selectNote({ repository, selector: "alpha-selector" })

  assert.equal(selected.frontmatter.id, "alpha-selector")
  assert.equal(selected.sourcePath, path.join("notes", "inbox", "id-match.md"))
})

test("selectNote resolves an exact managed-root-relative path", () => {
  const repository = createNoteRepository(fixtureRoot)

  const selected = selectNote({ repository, selector: path.join("notes", "archive", "path-match.md") })

  assert.equal(selected.frontmatter.id, "archive-path")
  assert.equal(selected.sourcePath, path.join("notes", "archive", "path-match.md"))
})

test("selectNote resolves a unique title-derived slug match", () => {
  const repository = createNoteRepository(fixtureRoot)

  const selected = selectNote({ repository, selector: "project-retrospective" })

  assert.equal(selected.frontmatter.id, "project-retro")
  assert.equal(selected.sourcePath, path.join("notes", "journal", "project-retro.md"))
})

test("selectNote raises AmbiguousSelectorError when a slug matches multiple notes", () => {
  const repository = createNoteRepository(fixtureRoot)

  assert.throws(
    () => selectNote({ repository, selector: "shared-title" }),
    (error) => {
      assert.ok(error instanceof AmbiguousSelectorError)
      assert.match(error.message, /Ambiguous note selector: shared-title/)
      assert.match(error.message, /notes[\\/]inbox[\\/]shared-a\.md/)
      assert.match(error.message, /notes[\\/]archive[\\/]shared-b\.md/)
      return true
    },
  )
})
