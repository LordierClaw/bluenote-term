import { test } from "bun:test"
import assert from "node:assert/strict"
import path from "node:path"
import { access, readFile } from "node:fs/promises"

import termPackage from "../../packages/term/package.json"
import { createManagedRootHarness, runCli, type CliRunResult } from "../helpers/cli"
import { escapeRegExp } from "../helpers/regexp"
import { noteMarkdown, timestampFieldPattern } from "../helpers/note-fixtures"

test("CLI help describes the Phase 7 note layout for new notes", () => {
  const result = runCli(["--help"])

  assert.equal(result.exitCode, 0)
  assert.equal(result.stderr, "")
  assert.doesNotMatch(result.stdout, /notes\/inbox/)
  assert.match(result.stdout, /Create a draft from body text or clipboard/)
})

test("real bin keeps the full CLI help and note command flow", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-bin-phase7-")

  try {
    const help = harness.runBin(["--help"])
    assert.equal(help.exitCode, 0)
    assert.equal(help.stderr, "")
    assert.match(help.stdout, new RegExp(`BlueNote v${escapeRegExp(termPackage.version)}`))
    assert.match(help.stdout, /\n  new\s+\[--title <title>\]/)

    const created = harness.runBin(["new", "Root bin draft body"])
    assert.equal(created.exitCode, 0)
    assert.equal(created.stderr, "")
    assert.match(created.stdout, /^Created note\nKey: .+\nPath: draft\/.+\.md\n$/)
  } finally {
    await harness.cleanup()
  }
}, 45_000)

test("CLI workflow stays consistent across init, create, rebuild, list, search, show, edit, and archive", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-e2e-")

  const runOk = (step: string, args: string[], extraEnv?: Record<string, string | undefined>): CliRunResult => {
    const result = harness.run(args, extraEnv)

    assert.equal(result.exitCode, 0, `${step} should exit 0`)
    assert.equal(result.stderr, "", `${step} should not write stderr`)

    return result
  }

  try {
    const initResult = runOk("bn init", ["init"])
    assert.match(initResult.stdout, new RegExp(`Initialized BlueNote root: ${harness.escapeForRegExp(harness.rootPath)}`))

    for (const relativePath of ["note", "draft", path.join(".data", "archive"), path.join(".data", "notes"), path.join(".data", "ai")]) {
      await access(path.join(harness.rootPath, relativePath))
    }

    for (const relativePath of [path.join("notes", "inbox"), path.join("notes", "journal"), path.join("notes", "archive")]) {
      await assert.rejects(access(path.join(harness.rootPath, relativePath)), `${relativePath} should not be created by bn init`)
    }

    const newResult = runOk("bn new", ["new", "--title", "Workflow Example", "Workflow example body"])
    assert.match(newResult.stdout, /^Created note\nKey: .+\nPath: draft\/.+\.md\n$/)

    const createdRelativePathMatch = newResult.stdout.match(/^Created note\nKey: .+\nPath: (draft\/.+\.md)\n$/)
    const createdRelativePath = createdRelativePathMatch?.[1]
    assert.notEqual(createdRelativePath, undefined)
    const createdAbsolutePath = path.join(harness.rootPath, createdRelativePath ?? "")
    const createdMarkdown = await readFile(createdAbsolutePath, "utf8")
    assert.equal(createdMarkdown, "Workflow example body")

    const missingPathResult = harness.run(["new", "--path", "note/missing", "--title", "Bad", "body"])
    assert.equal(missingPathResult.exitCode, 1)
    assert.equal(missingPathResult.stdout, "")
    assert.match(missingPathResult.stderr, /existing folder under note\//)

    const secondNoteRelativePath = "note/reference-note.md"
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
    assert.doesNotMatch(listResult.stdout, /Workflow Example\s+workflow-example-[a-z0-9]+\s+Workflow example body\s+draft[\\/]workflow-example-[a-z0-9]+\.md/)
    assert.match(listResult.stdout, /Reference Note\s+reference-note\s+Reference zebra tokens remain searchable while active\.\s+note[\\/]reference-note\.md/)

    const listDraftsResult = runOk("bn list --drafts", ["list", "--drafts"])
    assert.match(listDraftsResult.stdout, /Workflow Example\s+workflow-example-[a-z0-9]+\s+Workflow example body\s+draft[\\/]workflow-example-[a-z0-9]+\.md/)

    const searchResult = runOk("bn search zebra tokens", ["search", "zebra", "tokens"])
    assert.match(searchResult.stdout, /Reference Note/)
    assert.match(searchResult.stdout, /key: reference-note/)
    assert.match(searchResult.stdout, /path: note[\\/]reference-note\.md/)
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
    assert.match(editResult.stdout, /Edited note: note[\\/]reference-note\.md/)
    assert.equal(await readFile(path.join(harness.rootPath, secondNoteRelativePath), "utf8"), editedMarkdown)

    const postEditSearchResult = runOk("bn search Edited zebra tokens", ["search", "Edited zebra tokens"])
    assert.match(postEditSearchResult.stdout, /Reference Note/)
    assert.match(postEditSearchResult.stdout, /key: reference-note/)
    assert.match(postEditSearchResult.stdout, /path: note[\\/]reference-note\.md/)
    assert.match(postEditSearchResult.stdout, /match: content(?: line \d+)?/)
    assert.match(postEditSearchResult.stdout, /excerpt:/)
    assert.match(postEditSearchResult.stdout, /Edited zebra tokens stay searchable before archive/)

    const archiveResult = runOk("bn archive reference-note", ["archive", "reference-note"])
    assert.match(archiveResult.stdout, /Archived note: \.data[\\/]archive[\\/]reference-note\.md/)

    const archivedRelativePath = path.join(".data", "archive", "reference-note.md")
    assert.equal(await Bun.file(path.join(harness.rootPath, secondNoteRelativePath)).exists(), false)
    const archivedMarkdown = await readFile(path.join(harness.rootPath, archivedRelativePath), "utf8")
    assert.equal(archivedMarkdown, editedMarkdown)

    const archivedSidecar = JSON.parse(
      await readFile(path.join(harness.rootPath, ".data", "notes", "reference-note.json"), "utf8"),
    )
    assert.match(`archivedAt: ${archivedSidecar.archivedAt}`, timestampFieldPattern("archivedAt"))

    const finalListResult = runOk("bn list --drafts after archive", ["list", "--drafts"])
    assert.match(finalListResult.stdout, /Workflow Example\s+workflow-example-[a-z0-9]+\s+Workflow example body\s+draft[\\/]workflow-example-[a-z0-9]+\.md/)
    assert.doesNotMatch(finalListResult.stdout, /reference-note/)

    const finalSearchResult = runOk("bn search after archive", ["search", "Edited zebra tokens"])
    assert.equal(finalSearchResult.stdout, 'No notes matched "Edited zebra tokens".\n')
  } finally {
    await harness.cleanup()
  }
}, 30_000)
