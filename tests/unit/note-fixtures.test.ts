import test from "node:test"
import assert from "node:assert/strict"

import { parseNoteFile } from "../../src/storage/frontmatter"
import { noteMarkdown } from "../helpers/note-fixtures"

test("noteMarkdown escapes YAML-sensitive fixture values", () => {
  const markdown = noteMarkdown({
    id: "yaml-sensitive",
    title: "Title: with colon # and brackets [ok]",
    tags: ["alpha,beta", "quoted:value"],
    body: "Fixture body.\n",
  })

  const parsed = parseNoteFile(markdown, "tests/fixtures/generated.md")

  assert.equal(parsed.frontmatter.id, "yaml-sensitive")
  assert.equal(parsed.frontmatter.title, "Title: with colon # and brackets [ok]")
  assert.deepEqual(parsed.frontmatter.tags, ["alpha,beta", "quoted:value"])
  assert.equal(parsed.body, "Fixture body.\n")
})
