import { test } from "bun:test"
import assert from "node:assert/strict"
import path from "node:path"
import { access, readFile } from "node:fs/promises"

import { createManagedRootHarness, type CliRunResult } from "../helpers/cli"

test("Phase 2 CLI workflow stays consistent through the real bin/bn.ts entrypoint", async () => {
  const harness = await createManagedRootHarness("bluenote-phase-2-e2e-")

  const readSidecar = async (key: string) =>
    JSON.parse(await readFile(path.join(harness.rootPath, ".state", "notes", `${key}.json`), "utf8")) as {
      archivedAt: string | null
      createdAt: string
      description: string
      key: string
      namingVersion: number
      relativePath: string
      title: string
      updatedAt: string
    }

  const runOk = (step: string, args: string[], extraEnv?: Record<string, string | undefined>): CliRunResult => {
    const result = harness.runBin(args, extraEnv)

    assert.equal(result.exitCode, 0, `${step} should exit 0`)
    assert.equal(result.stderr, "", `${step} should not write stderr`)

    return result
  }

  try {
    const initResult = runOk("bn init", ["init"])
    assert.match(initResult.stdout, new RegExp(`Initialized BlueNote root: ${harness.escapeForRegExp(harness.rootPath)}`))

    await access(path.join(harness.rootPath, ".state", "notes"))

    const createFirstResult = runOk("bn new first", ["new", "--title", "Workflow Alpha"])
    assert.match(createFirstResult.stdout, /^Created note\nKey: workflow-alpha-[a-z0-9]{6}\nPath: notes\/inbox\/workflow-alpha-[a-z0-9]{6}\.md\n$/)

    const firstKeyMatch = createFirstResult.stdout.match(/^Created note\nKey: (workflow-alpha-[a-z0-9]{6})\nPath: (notes\/inbox\/(workflow-alpha-[a-z0-9]{6})\.md)\n$/)
    assert.ok(firstKeyMatch)
    assert.equal(firstKeyMatch[1], firstKeyMatch[3])
    const firstKey = firstKeyMatch[1]
    const firstRelativePath = firstKeyMatch[2]

    assert.equal(await readFile(path.join(harness.rootPath, firstRelativePath), "utf8"), "")
    const firstSidecar = await readSidecar(firstKey)
    assert.equal(firstSidecar.key, firstKey)
    assert.equal(firstSidecar.title, "Workflow Alpha")
    assert.equal(firstSidecar.description, "")
    assert.equal(firstSidecar.relativePath, firstRelativePath)
    assert.equal(firstSidecar.archivedAt, null)
    assert.equal(firstSidecar.namingVersion, 1)
    assert.match(firstSidecar.createdAt, /^\d{4}-\d{2}-\d{2}T/)
    assert.match(firstSidecar.updatedAt, /^\d{4}-\d{2}-\d{2}T/)

    const createSecondResult = runOk("bn new second", ["new", "--title", "Workflow Beta"])
    const secondKeyMatch = createSecondResult.stdout.match(/^Created note\nKey: (workflow-beta-[a-z0-9]{6})\nPath: (notes\/inbox\/(workflow-beta-[a-z0-9]{6})\.md)\n$/)
    assert.ok(secondKeyMatch)
    assert.equal(secondKeyMatch[1], secondKeyMatch[3])
    const secondKey = secondKeyMatch[1]

    const listResult = runOk("bn list", ["list"])
    assert.match(listResult.stdout, new RegExp(`Workflow Alpha\\t${harness.escapeForRegExp(firstKey)}\\t\\tnotes/inbox/${harness.escapeForRegExp(firstKey)}\\.md`))
    assert.match(listResult.stdout, new RegExp(`Workflow Beta\\t${harness.escapeForRegExp(secondKey)}\\t\\tnotes/inbox/${harness.escapeForRegExp(secondKey)}\\.md`))

    const searchResult = runOk("bn search workflow beta", ["search", "workflow beta"])
    assert.match(searchResult.stdout, /Workflow Beta/)
    assert.match(searchResult.stdout, new RegExp(`  key: ${harness.escapeForRegExp(secondKey)}`))
    assert.match(searchResult.stdout, new RegExp(`  path: notes/inbox/${harness.escapeForRegExp(secondKey)}\\.md`))
    assert.match(searchResult.stdout, /  match: title/)

    const showResult = runOk("bn show second", ["show", secondKey])
    assert.equal(
      showResult.stdout,
      [
        "Title: Workflow Beta",
        `Key: ${secondKey}`,
        `Path: notes/inbox/${secondKey}.md`,
        "Description: ",
        "",
        "",
      ].join("\n"),
    )

    const renamedBody = "# Workflow Beta Renamed\n\nRenamed workflow body mentions aurora signals.\n"
    const editorScriptPath = await harness.writeFakeEditorScript(renamedBody)
    const editResult = runOk("bn edit second", ["edit", secondKey], { EDITOR: editorScriptPath })
    const renamedKeyMatch = editResult.stdout.match(/Renamed key: .* -> (workflow-beta-renamed-[a-z0-9]{6})/)
    assert.ok(renamedKeyMatch)
    const renamedKey = renamedKeyMatch[1]
    assert.match(editResult.stdout, new RegExp(`Edited note: notes/inbox/${harness.escapeForRegExp(renamedKey)}\\.md`))

    await assert.rejects(() => access(path.join(harness.rootPath, "notes", "inbox", `${secondKey}.md`)), { code: "ENOENT" })
    await assert.rejects(() => access(path.join(harness.rootPath, ".state", "notes", `${secondKey}.json`)), { code: "ENOENT" })

    const postEditShowResult = runOk("bn show renamed", ["show", renamedKey])
    assert.match(postEditShowResult.stdout, /^Title: Workflow Beta Renamed\n/m)
    assert.match(postEditShowResult.stdout, new RegExp(`^Key: ${harness.escapeForRegExp(renamedKey)}$`, "m"))
    assert.match(postEditShowResult.stdout, /Renamed workflow body mentions aurora signals\./)

    const archiveResult = runOk("bn archive renamed", ["archive", renamedKey])
    assert.match(archiveResult.stdout, new RegExp(`Archived note: notes/archive/${harness.escapeForRegExp(renamedKey)}\\.md`))

    const archiveShowResult = runOk("bn show archived renamed", ["show", renamedKey])
    assert.match(archiveShowResult.stdout, new RegExp(`^Path: notes/archive/${harness.escapeForRegExp(renamedKey)}\\.md$`, "m"))
    const archivedSidecar = await readSidecar(renamedKey)
    assert.equal(archivedSidecar.relativePath, `notes/archive/${renamedKey}.md`)
    assert.match(archivedSidecar.archivedAt ?? "", /^\d{4}-\d{2}-\d{2}T/)

    const deleteResult = runOk("bn delete first", ["delete", firstKey, "--force"])
    assert.match(deleteResult.stdout, new RegExp(`Deleted note: notes/inbox/${harness.escapeForRegExp(firstKey)}\\.md`))

    await assert.rejects(() => access(path.join(harness.rootPath, "notes", "inbox", `${firstKey}.md`)), { code: "ENOENT" })
    await assert.rejects(() => access(path.join(harness.rootPath, ".state", "notes", `${firstKey}.json`)), { code: "ENOENT" })

    const rebuildResult = runOk("bn rebuild", ["rebuild"])
    assert.equal(rebuildResult.stdout, "Rebuilt indexes for 1 note(s).\n")

    await access(path.join(harness.rootPath, ".state", "metadata.sqlite"))
    await access(path.join(harness.rootPath, ".state", "search-index.json"))

    const finalListResult = runOk("bn list after archive and delete", ["list"])
    assert.equal(finalListResult.stdout, "")

    const finalSearchResult = runOk("bn search aurora signals", ["search", "aurora", "signals"])
    assert.equal(finalSearchResult.stdout, 'No notes matched "aurora signals".\n')
  } finally {
    await harness.cleanup()
  }
})