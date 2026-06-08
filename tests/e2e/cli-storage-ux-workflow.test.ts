import { test } from "bun:test"
import assert from "node:assert/strict"
import path from "node:path"
import { access, readFile } from "node:fs/promises"

import { createManagedRootHarness, type CliRunResult } from "../helpers/cli"

test("CLI storage and UX workflow stays consistent through the real bin/bn.ts entrypoint", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-storage-ux-e2e-")

  const readSidecar = async (key: string) =>
    JSON.parse(await readFile(path.join(harness.rootPath, ".data", "notes", `${key}.json`), "utf8")) as {
      archivedAt: string | null
      createdAt: string
      description: string
      key: string
      namingVersion: number
      relativePath: string
      title: string
      type: "normal" | "draft" | "archived"
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

    await access(path.join(harness.rootPath, ".data", "notes"))

    const createFirstResult = runOk("bn new first", ["new", "--path", "note", "--title", "Workflow Alpha", "Alpha normal body"])
    assert.match(createFirstResult.stdout, /^Created note\nKey: workflow-alpha-[a-z0-9]{6}\nPath: note\/workflow-alpha-[a-z0-9]{6}\.md\n$/)

    const firstKeyMatch = createFirstResult.stdout.match(/^Created note\nKey: (workflow-alpha-[a-z0-9]{6})\nPath: (note\/(workflow-alpha-[a-z0-9]{6})\.md)\n$/)
    assert.ok(firstKeyMatch)
    assert.equal(firstKeyMatch[1], firstKeyMatch[3])
    const firstKey = firstKeyMatch[1]
    const firstRelativePath = firstKeyMatch[2]

    assert.equal(await readFile(path.join(harness.rootPath, firstRelativePath), "utf8"), "Alpha normal body")
    const firstSidecar = await readSidecar(firstKey)
    assert.equal(firstSidecar.type, "normal")
    assert.equal(firstSidecar.key, firstKey)
    assert.equal(firstSidecar.title, "Workflow Alpha")
    assert.equal(firstSidecar.description, "Alpha normal body")
    assert.equal(firstSidecar.relativePath, firstRelativePath)
    assert.equal(firstSidecar.archivedAt, null)
    assert.equal(firstSidecar.namingVersion, 1)
    assert.match(firstSidecar.createdAt, /^\d{4}-\d{2}-\d{2}T/)
    assert.match(firstSidecar.updatedAt, /^\d{4}-\d{2}-\d{2}T/)

    const draftResult = runOk("bn new draft", ["new", "Quick draft body"])
    assert.match(draftResult.stdout, /^Created note\nKey: draft-[a-z0-9]{6}\nPath: draft\/draft-[a-z0-9]{6}\.md\n$/)
    const draftRelativePath = draftResult.stdout.match(/Path: (draft\/draft-[a-z0-9]{6}\.md)/)?.[1]
    assert.ok(draftRelativePath)
    assert.equal(await readFile(path.join(harness.rootPath, draftRelativePath), "utf8"), "Quick draft body")
    const draftKey = path.basename(draftRelativePath, ".md")
    const draftSidecar = await readSidecar(draftKey)
    assert.equal(draftSidecar.type, "draft")

    const archiveDraftResult = harness.runBin(["archive", draftKey])
    assert.equal(archiveDraftResult.exitCode, 1)
    assert.equal(archiveDraftResult.stdout, "")
    assert.match(archiveDraftResult.stderr, /Could not find a note matching selector/)

    const archiveVisibleDraftResult = harness.runBin(["archive", "--drafts", draftKey])
    assert.equal(archiveVisibleDraftResult.exitCode, 1)
    assert.equal(archiveVisibleDraftResult.stdout, "")
    assert.match(archiveVisibleDraftResult.stderr, /Cannot archive non-normal note/)

    const noBodyResult = harness.runBin(["new"])
    assert.equal(noBodyResult.exitCode, 1)
    assert.equal(noBodyResult.stdout, "")
    assert.match(noBodyResult.stderr, /Missing note body/)

    const createSecondResult = runOk("bn new second", ["new", "--path", "note", "--title", "Workflow Beta", "Beta normal body"])
    const secondKeyMatch = createSecondResult.stdout.match(/^Created note\nKey: (workflow-beta-[a-z0-9]{6})\nPath: (note\/(workflow-beta-[a-z0-9]{6})\.md)\n$/)
    assert.ok(secondKeyMatch)
    assert.equal(secondKeyMatch[1], secondKeyMatch[3])
    const secondKey = secondKeyMatch[1]

    const listResult = runOk("bn list", ["list"])
    assert.match(listResult.stdout, new RegExp(`Workflow Alpha\\t${harness.escapeForRegExp(firstKey)}\\tAlpha normal body\\tnote/${harness.escapeForRegExp(firstKey)}\\.md`))
    assert.match(listResult.stdout, new RegExp(`Workflow Beta\\t${harness.escapeForRegExp(secondKey)}\\tBeta normal body\\tnote/${harness.escapeForRegExp(secondKey)}\\.md`))
    assert.doesNotMatch(listResult.stdout, /draft-[a-z0-9]{6}\tdraft-[a-z0-9]{6}\tQuick draft body\tdraft\/draft-[a-z0-9]{6}\.md/)

    const listDraftsResult = runOk("bn list --drafts", ["list", "--drafts"])
    assert.match(listDraftsResult.stdout, new RegExp(`Workflow Alpha\\t${harness.escapeForRegExp(firstKey)}\\tAlpha normal body\\tnote/${harness.escapeForRegExp(firstKey)}\\.md`))
    assert.match(listDraftsResult.stdout, /draft-[a-z0-9]{6}\tdraft-[a-z0-9]{6}\tQuick draft body\tdraft\/draft-[a-z0-9]{6}\.md/)

    const draftEditorScriptPath = await harness.writeFakeEditorScript("Edited draft body mentions comet flags.\n")
    const draftEditResult = runOk("bn edit draft", ["edit", "--drafts", draftKey], { EDITOR: draftEditorScriptPath })
    assert.equal(draftEditResult.stdout, `Edited note: draft/${draftKey}.md\n`)
    assert.equal(await readFile(path.join(harness.rootPath, draftRelativePath), "utf8"), "Edited draft body mentions comet flags.\n")

    const showDraftResult = runOk("bn show draft", ["show", "--drafts", draftKey])
    assert.match(showDraftResult.stdout, /Edited draft body mentions comet flags\./)

    const searchResult = runOk("bn search workflow beta", ["search", "workflow beta"])
    assert.match(searchResult.stdout, /Workflow Beta/)
    assert.match(searchResult.stdout, new RegExp(`  key: ${harness.escapeForRegExp(secondKey)}`))
    assert.match(searchResult.stdout, new RegExp(`  path: note/${harness.escapeForRegExp(secondKey)}\\.md`))
    assert.match(searchResult.stdout, /  match: title/)

    const showResult = runOk("bn show second", ["show", secondKey])
    assert.equal(
      showResult.stdout,
      [
        "Title: Workflow Beta",
        `Key: ${secondKey}`,
        `Path: note/${secondKey}.md`,
        "Description: Beta normal body",
        "",
        "Beta normal body",
      ].join("\n"),
    )

    const renamedBody = "# Workflow Beta Renamed\n\nRenamed workflow body mentions aurora signals.\n"
    const editorScriptPath = await harness.writeFakeEditorScript(renamedBody)
    const editResult = runOk("bn edit second", ["edit", secondKey], { EDITOR: editorScriptPath })
    const renamedKeyMatch = editResult.stdout.match(/Renamed key: .* -> (workflow-beta-renamed-[a-z0-9]{6})/)
    assert.ok(renamedKeyMatch)
    const renamedKey = renamedKeyMatch[1]
    assert.match(editResult.stdout, new RegExp(`Edited note: note/${harness.escapeForRegExp(renamedKey)}\\.md`))

    await assert.rejects(() => access(path.join(harness.rootPath, "note", `${secondKey}.md`)), { code: "ENOENT" })
    await assert.rejects(() => access(path.join(harness.rootPath, ".data", "notes", `${secondKey}.json`)), { code: "ENOENT" })

    const postEditShowResult = runOk("bn show renamed", ["show", renamedKey])
    assert.match(postEditShowResult.stdout, /^Title: Workflow Beta Renamed\n/m)
    assert.match(postEditShowResult.stdout, new RegExp(`^Key: ${harness.escapeForRegExp(renamedKey)}$`, "m"))
    assert.match(postEditShowResult.stdout, /Renamed workflow body mentions aurora signals\./)

    const archiveResult = runOk("bn archive renamed", ["archive", renamedKey])
    const archivedRelativePath = `.data/archive/${renamedKey}.md`
    const escapedArchivedRelativePath = harness.escapeForRegExp(archivedRelativePath)
    assert.match(archiveResult.stdout, new RegExp(`Archived note: ${escapedArchivedRelativePath}`))

    const archiveShowResult = runOk("bn show archived exact path", ["show", "--all", archivedRelativePath])
    assert.match(archiveShowResult.stdout, new RegExp(`^Path: ${escapedArchivedRelativePath}$`, "m"))
    const archiveArchivedResult = harness.runBin(["archive", `.data/archive/${renamedKey}.md`])
    assert.equal(archiveArchivedResult.exitCode, 1)
    assert.equal(archiveArchivedResult.stdout, "")
    assert.match(archiveArchivedResult.stderr, /Could not find a note matching selector/)
    const archivedSidecar = await readSidecar(renamedKey)
    assert.equal(archivedSidecar.type, "archived")
    assert.equal(archivedSidecar.relativePath, `.data/archive/${renamedKey}.md`)
    assert.match(archivedSidecar.archivedAt ?? "", /^\d{4}-\d{2}-\d{2}T/)

    const postArchiveDefaultList = runOk("bn list after archive hides archived", ["list"])
    assert.doesNotMatch(postArchiveDefaultList.stdout, new RegExp(harness.escapeForRegExp(renamedKey)))

    const allListResult = runOk("bn list --all after archive", ["list", "--all"])
    assert.match(allListResult.stdout, new RegExp(`Workflow Beta Renamed\\t${harness.escapeForRegExp(renamedKey)}\\t# Workflow Beta … mentions aurora signals\\.\\t\\.data/archive/${harness.escapeForRegExp(renamedKey)}\\.md`))

    const deleteResult = runOk("bn delete first", ["delete", firstKey, "--force"])
    assert.match(deleteResult.stdout, new RegExp(`Deleted note: note/${harness.escapeForRegExp(firstKey)}\\.md`))

    await assert.rejects(() => access(path.join(harness.rootPath, "note", `${firstKey}.md`)), { code: "ENOENT" })
    await assert.rejects(() => access(path.join(harness.rootPath, ".data", "notes", `${firstKey}.json`)), { code: "ENOENT" })

    const rebuildResult = runOk("bn rebuild", ["rebuild"])
    assert.equal(rebuildResult.stdout, "Rebuilt indexes for 2 note(s).\n")

    await access(path.join(harness.rootPath, ".data", "metadata.sqlite"))
    await access(path.join(harness.rootPath, ".data", "search-index.json"))

    const finalListResult = runOk("bn list after archive and delete", ["list"])
    assert.equal(finalListResult.stdout, "")

    const finalDraftsListResult = runOk("bn list --drafts after archive and delete", ["list", "--drafts"])
    assert.match(finalDraftsListResult.stdout, /draft-[a-z0-9]{6}\tdraft-[a-z0-9]{6}\tEdited draft body mentions comet flags\.\tdraft\/draft-[a-z0-9]{6}\.md/)

    const finalSearchResult = runOk("bn search aurora signals", ["search", "aurora", "signals"])
    assert.equal(finalSearchResult.stdout, 'No notes matched "aurora signals".\n')
  } finally {
    await harness.cleanup()
  }
}, 45_000)
