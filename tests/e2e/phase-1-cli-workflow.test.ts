import test from "node:test"
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
    assert.match(newResult.stdout, /^Created note: notes\/inbox\/.+\.md\n$/)

    const createdRelativePath = newResult.stdout.trim().replace(/^Created note: /, "")
    const createdAbsolutePath = path.join(harness.rootPath, createdRelativePath)
    const createdMarkdown = await readFile(createdAbsolutePath, "utf8")
    assert.match(createdMarkdown, /title: Workflow Example/)

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

    await access(path.join(harness.rootPath, ".bluenote", "metadata.sqlite"))
    await access(path.join(harness.rootPath, ".bluenote", "search-index.json"))

    const listResult = runOk("bn list", ["list"])
    assert.match(listResult.stdout, /Workflow Example\s+notes[\\/]inbox[\\/]/)
    assert.match(listResult.stdout, /reference-note\s+Reference Note\s+notes[\\/]journal[\\/]reference-note\.md/)

    const searchResult = runOk("bn search zebra tokens", ["search", "zebra", "tokens"])
    assert.match(searchResult.stdout, /reference-note\s+Reference Note\s+notes[\\/]journal[\\/]reference-note\.md/)

    const showResult = runOk("bn show reference-note", ["show", "reference-note"])
    assert.equal(showResult.stdout, await readFile(path.join(harness.rootPath, secondNoteRelativePath), "utf8"))

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
    assert.match(postEditSearchResult.stdout, /reference-note\s+Reference Note Edited\s+notes[\\/]journal[\\/]reference-note\.md/)

    const archiveResult = runOk("bn archive reference-note", ["archive", "reference-note"])
    assert.match(archiveResult.stdout, /Archived note: notes[\\/]archive[\\/]reference-note\.md/)

    const archivedRelativePath = path.join("notes", "archive", "reference-note.md")
    assert.equal(await Bun.file(path.join(harness.rootPath, secondNoteRelativePath)).exists(), false)
    const archivedMarkdown = await readFile(path.join(harness.rootPath, archivedRelativePath), "utf8")
    assert.match(archivedMarkdown, timestampFieldPattern("archivedAt"))
    assert.match(archivedMarkdown, /Edited zebra tokens stay searchable before archive\./)

    const finalListResult = runOk("bn list after archive", ["list"])
    assert.match(finalListResult.stdout, /Workflow Example\s+notes[\\/]inbox[\\/]/)
    assert.doesNotMatch(finalListResult.stdout, /reference-note/)

    const finalSearchResult = runOk("bn search after archive", ["search", "Edited zebra tokens"])
    assert.equal(finalSearchResult.stdout, "")
  } finally {
    await harness.cleanup()
  }
})
