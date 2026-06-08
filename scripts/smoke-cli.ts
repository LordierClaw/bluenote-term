import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import { mkdir, mkdtemp, readFile, rm, stat, access } from "node:fs/promises"

import { assertManagedRootLayout, runBinCli } from "../tests/helpers/cli"

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const managedRoot = process.env.BLUENOTE_ROOT ?? (await mkdtemp(path.join(os.tmpdir(), "bluenote-smoke-cli-")))
const shouldCleanup = process.env.BLUENOTE_ROOT === undefined

function runOk(step: string, args: string[]) {
  const result = runBinCli(args, { rootPath: managedRoot })
  assert.equal(result.exitCode, 0, `${step} should exit 0; stderr=${result.stderr}`)
  assert.equal(result.stderr, "", `${step} should not write stderr`)
  return result
}

function createdNote(stdout: string): { key: string; relativePath: string } {
  const match = stdout.match(/^Created note\nKey: (?<key>.+)\nPath: (?<relativePath>.+\.md)\n$/)
  assert.ok(match?.groups, `unexpected create output: ${stdout}`)
  return { key: match.groups.key, relativePath: match.groups.relativePath }
}

async function readSidecar(key: string) {
  return JSON.parse(await readFile(path.join(managedRoot, ".data", "notes", `${key}.json`), "utf8")) as {
    archivedAt: string | null
    relativePath: string
    title: string
    type: "draft" | "normal" | "archived"
  }
}

try {
  const helpResult = runOk("bn --help", ["--help"])
  assert.match(helpResult.stdout, /BlueNote v/)
  assert.match(helpResult.stdout, /archive/)
  assert.match(helpResult.stdout, /tui\s+Launch the terminal UI workspace/)
  assert.match(helpResult.stdout, /ai\s+Configure and run opt-in AI description generation/)
  assert.match(helpResult.stdout, /Create a draft from body text or clipboard/)
  assert.doesNotMatch(helpResult.stdout, /notes\/inbox/)

  const aiHelpResult = runOk("bn ai --help", ["ai", "--help"])
  assert.match(aiHelpResult.stdout, /bn ai <command> \[options\]/)
  assert.match(aiHelpResult.stdout, /config set\s+\[--provider openai-compatible\] --base-url <url> --api-key <key> --model <model>/)
  assert.match(aiHelpResult.stdout, /config set\s+--provider codex --model <model>/)
  assert.match(aiHelpResult.stdout, /codex auth login\s+Authenticate Codex with device-code OAuth/)
  assert.match(aiHelpResult.stdout, /codex auth status\s+Show Codex auth status without secrets/)
  assert.match(aiHelpResult.stdout, /codex auth logout\s+Remove stored Codex auth while keeping AI config/)
  assert.match(aiHelpResult.stdout, /process-queue\s+\[--limit <n>\]/)

  const initResult = runOk("bn init", ["init"])
  assert.match(initResult.stdout, new RegExp(`Initialized BlueNote root: ${escapeRegExp(managedRoot)}`))

  const aiQueueResult = runOk("bn ai queue", ["ai", "queue"])
  assert.equal(aiQueueResult.stdout, "Pending AI jobs: 0\n")

  const aiConfigShowResult = runBinCli(["ai", "config", "show"], { rootPath: managedRoot })
  assert.equal(aiConfigShowResult.exitCode, 1)
  assert.equal(aiConfigShowResult.stdout, "")
  assert.match(aiConfigShowResult.stderr, /AI is not configured\./)

  await assertManagedRootLayout(managedRoot)

  const manifestPath = path.join(managedRoot, ".data", "manifest.json")
  const manifestStats = await stat(manifestPath)
  assert.equal(manifestStats.isFile(), true, ".data/manifest.json should exist after smoke init")
  await assert.rejects(() => access(path.join(managedRoot, ".state")), { code: "ENOENT" })
  await assert.rejects(() => access(path.join(managedRoot, ".bluenote")), { code: "ENOENT" })
  await assert.rejects(() => access(path.join(managedRoot, "notes", "inbox")), { code: "ENOENT" })

  await mkdir(path.join(managedRoot, "note", "work"), { recursive: true })

  const draft = createdNote(runOk("bn new draft", ["new", "Smoke draft body"]).stdout)
  assert.match(draft.relativePath, /^draft\/draft-[a-z0-9]{6}\.md$/)
  assert.equal(await readFile(path.join(managedRoot, draft.relativePath), "utf8"), "Smoke draft body")
  assert.equal((await readSidecar(draft.key)).type, "draft")

  const normal = createdNote(runOk("bn new normal", ["new", "--path", "note/work", "--title", "Smoke Meeting", "Smoke normal body"]).stdout)
  assert.match(normal.relativePath, /^note\/work\/smoke-meeting-[a-z0-9]{6}\.md$/)
  assert.equal(await readFile(path.join(managedRoot, normal.relativePath), "utf8"), "Smoke normal body")
  const normalSidecar = await readSidecar(normal.key)
  assert.equal(normalSidecar.type, "normal")
  assert.equal(normalSidecar.title, "Smoke Meeting")
  assert.equal(normalSidecar.relativePath, normal.relativePath)

  const listResult = runOk("bn list", ["list"])
  assert.match(listResult.stdout, new RegExp(`^Smoke Meeting\\t${escapeRegExp(normal.key)}\\tSmoke normal body\\tnote/work/${escapeRegExp(normal.key)}\\.md$`, "m"))
  assert.doesNotMatch(listResult.stdout, new RegExp(escapeRegExp(draft.key)))

  const listDraftsResult = runOk("bn list --drafts", ["list", "--drafts"])
  assert.match(listDraftsResult.stdout, new RegExp(escapeRegExp(draft.key)))
  assert.match(listDraftsResult.stdout, new RegExp(escapeRegExp(normal.key)))

  const showResult = runOk("bn show normal", ["show", normal.key])
  assert.match(showResult.stdout, new RegExp(`^Title: Smoke Meeting\nKey: ${escapeRegExp(normal.key)}\nPath: note/work/${escapeRegExp(normal.key)}\\.md\nDescription: Smoke normal body\n\nSmoke normal body$`))

  const archiveResult = runOk("bn archive normal", ["archive", normal.key])
  assert.equal(archiveResult.stdout, `Archived note: .data/archive/${normal.key}.md\n`)
  await assert.rejects(() => access(path.join(managedRoot, normal.relativePath)), { code: "ENOENT" })
  assert.equal(await readFile(path.join(managedRoot, ".data", "archive", `${normal.key}.md`), "utf8"), "Smoke normal body")
  const archivedSidecar = await readSidecar(normal.key)
  assert.equal(archivedSidecar.type, "archived")
  assert.equal(archivedSidecar.relativePath, `.data/archive/${normal.key}.md`)

  assert.equal(runOk("bn list after archive", ["list"]).stdout, "")

  console.log("CLI smoke check passed.")
} finally {
  if (shouldCleanup) {
    await rm(managedRoot, { recursive: true, force: true })
  }
}
