import { test } from "bun:test"
import assert from "node:assert/strict"
import path from "node:path"
import { access, readFile } from "node:fs/promises"

import { createManagedRootHarness, type CliRunResult } from "../helpers/cli"
import { noteMarkdown, timestampFieldPattern } from "../helpers/note-fixtures"

test("Phase 1 CLI workflow stays consistent across init, create, rebuild, list, search, show, edit, and archive", async () => {
  const harness = await createManagedRootHarness("bluenote-phase-1-e2e-")

  const runOk = (step: string, args: string[], extraEnv?: Record<string, string | undefined>): CliRunResult => {
    const result = harness.run(args, extraEnv)

    assert.equal(result.exitCode, 0, `${step} should exit 0`)
    assert.equal(result.stderr, "", `${step} should not write stderr`)

    return result
  }

  try {
    const initResult = runOk("bn init", ["init"])
    assert.match(initResult.stdout, new RegExp(`Initialized BlueNote root: ${harness.escapeForRegExp(harness.rootPath)}`))

    const newResult = runOk("bn new", ["new", "--title", "Workflow Example"])
    assert.match(newResult.stdout, /^Created note\nKey: .+\nPath: notes\/inbox\/.+\.md\n$/)

    const createdRelativePathMatch = newResult.stdout.match(/^Created note\nKey: .+\nPath: (notes\/inbox\/.+\.md)\n$/)
    const createdRelativePath = createdRelativePathMatch?.[1]
    assert.notEqual(createdRelativePath, undefined)
    const createdAbsolutePath = path.join(harness.rootPath, createdRelativePath ?? "")
    const createdMarkdown = await readFile(createdAbsolutePath, "utf8")
    assert.equal(createdMarkdown, "")

    const secondNoteRelativePath = path.join("notes", "journal", "reference-note.md")
    await harness.writeNote(secondNoteRelativePath, noteMarkdown({
      id: "reference-note",
      title: "Reference Note",
      body: "Reference zebra tokens remain searchable while active.\n",
      createdAt: "2026-05-21T10:15:00.000Z",
      updatedAt: "2026-05-21T10:15:00.000Z",
    }))

    const rebuildResult = runOk("bn rebuild", ["rebuild"])
    assert.match(rebuildResult.stdout, /Rebuilt indexes for 2 note\(s\)\./)

    await access(path.join(harness.rootPath, ".data", "metadata.sqlite"))
    await access(path.join(harness.rootPath, ".data", "search-index.json"))

    const listResult = runOk("bn list", ["list"])
    assert.match(listResult.stdout, /Workflow Example\s+workflow-example-[a-z0-9]+\s+\s*notes[\\/]inbox[\\/]workflow-example-[a-z0-9]+\.md/)
    assert.match(listResult.stdout, /Reference Note\s+reference-note\s+Reference zebra tokens remain searchable while active\.\s+notes[\\/]journal[\\/]reference-note\.md/)

    const searchResult = runOk("bn search zebra tokens", ["search", "zebra", "tokens"])
    assert.match(searchResult.stdout, /Reference Note/)
    assert.match(searchResult.stdout, /key: reference-note/)
    assert.match(searchResult.stdout, /path: notes[\\/]journal[\\/]reference-note\.md/)
    assert.match(searchResult.stdout, /match: description/)

    const showResult = runOk("bn show reference-note", ["show", "reference-note"])
    assert.equal(
      showResult.stdout,
      [
        "Title: Reference Note",
        "Key: reference-note",
        `Path: ${secondNoteRelativePath.replaceAll(path.sep, "/")}`,
        "Description: Reference zebra tokens … searchable while active.",
        "",
        "Reference zebra tokens remain searchable while active.",
        "",
      ].join("\n"),
    )

    const editedMarkdown = noteMarkdown({
      id: "reference-note",
      title: "Reference Note Edited",
      body: "Edited zebra tokens stay searchable before archive.\n",
      createdAt: "2026-05-21T10:15:00.000Z",
      updatedAt: "2026-05-21T11:45:00.000Z",
    })
    const editorScriptPath = await harness.writeFakeEditorScript(editedMarkdown)

    const editResult = runOk("bn edit reference-note", ["edit", "reference-note"], { EDITOR: editorScriptPath })
    assert.match(editResult.stdout, /Edited note: notes[\\/]journal[\\/]reference-note\.md/)
    assert.equal(await readFile(path.join(harness.rootPath, secondNoteRelativePath), "utf8"), editedMarkdown)

    const postEditSearchResult = runOk("bn search Edited zebra tokens", ["search", "Edited zebra tokens"])
    assert.match(postEditSearchResult.stdout, /Reference Note/)
    assert.match(postEditSearchResult.stdout, /key: reference-note/)
    assert.match(postEditSearchResult.stdout, /path: notes[\\/]journal[\\/]reference-note\.md/)
    assert.match(postEditSearchResult.stdout, /match: content(?: line \d+)?/)
    assert.match(postEditSearchResult.stdout, /excerpt:/)
    assert.match(postEditSearchResult.stdout, /Edited zebra tokens stay searchable before archive/)

    const archiveResult = runOk("bn archive reference-note", ["archive", "reference-note"])
    assert.match(archiveResult.stdout, /Archived note: notes[\\/]archive[\\/]reference-note\.md/)

    const archivedRelativePath = path.join("notes", "archive", "reference-note.md")
    assert.equal(await Bun.file(path.join(harness.rootPath, secondNoteRelativePath)).exists(), false)
    const archivedMarkdown = await readFile(path.join(harness.rootPath, archivedRelativePath), "utf8")
    assert.equal(archivedMarkdown, editedMarkdown)

    const archivedSidecar = JSON.parse(
      await readFile(path.join(harness.rootPath, ".data", "notes", "reference-note.json"), "utf8"),
    )
    assert.match(`archivedAt: ${archivedSidecar.archivedAt}`, timestampFieldPattern("archivedAt"))

    const finalListResult = runOk("bn list after archive", ["list"])
    assert.match(finalListResult.stdout, /Workflow Example\s+workflow-example-[a-z0-9]+\s+\s*notes[\\/]inbox[\\/]workflow-example-[a-z0-9]+\.md/)
    assert.doesNotMatch(finalListResult.stdout, /reference-note/)

    const finalSearchResult = runOk("bn search after archive", ["search", "Edited zebra tokens"])
    assert.equal(finalSearchResult.stdout, 'No notes matched "Edited zebra tokens".\n')
  } finally {
    await harness.cleanup()
  }
}, 20_000)
