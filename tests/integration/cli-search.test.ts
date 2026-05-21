import test from "node:test"
import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import { mkdir, mkdtemp, rm } from "node:fs/promises"

const workspaceRoot = path.resolve(import.meta.dir, "../..")
const cliPath = path.join(workspaceRoot, "bin", "bn.ts")

function runCli(args: string[], managedRoot: string) {
  return Bun.spawnSync(["bun", "run", cliPath, ...args], {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      BLUENOTE_ROOT: managedRoot,
    },
    stdout: "pipe",
    stderr: "pipe",
  })
}

async function writeNote(rootPath: string, relativePath: string, markdown: string) {
  const notePath = path.join(rootPath, relativePath)
  await mkdir(path.dirname(notePath), { recursive: true })
  await Bun.write(notePath, markdown)
}

test("bn search <query> returns ranked matches with title and path snippets", async () => {
  const managedRoot = await mkdtemp(path.join(os.tmpdir(), "bluenote-cli-search-"))

  try {
    await writeNote(
      managedRoot,
      path.join("notes", "inbox", "project-comet.md"),
      `---\nid: note-comet\nschemaVersion: 1\ntitle: Project Comet\nmode: plain\ntags: [space]\ncreatedAt: 2026-05-21T10:15:00.000Z\nupdatedAt: 2026-05-21T10:15:00.000Z\n---\nProject comet planning notes.\n`,
    )
    await writeNote(
      managedRoot,
      path.join("notes", "journal", "nebula.md"),
      `---\nid: note-nebula\nschemaVersion: 1\ntitle: Nebula Retrospective\nmode: plain\ntags: [space]\ncreatedAt: 2026-05-21T11:15:00.000Z\nupdatedAt: 2026-05-21T11:15:00.000Z\n---\nThis body mentions project comet once.\n`,
    )

    const rebuildResult = runCli(["rebuild"], managedRoot)
    assert.equal(rebuildResult.exitCode, 0)

    const result = runCli(["search", "project", "comet"], managedRoot)

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr.toString(), "")
    const stdout = result.stdout.toString()
    assert.match(stdout, /^note-comet\s+Project Comet\s+notes[\\/]inbox[\\/]project-comet\.md/m)
    assert.match(stdout, /note-nebula\s+Nebula Retrospective\s+notes[\\/]journal[\\/]nebula\.md/)
    assert.ok(stdout.indexOf("note-comet") < stdout.indexOf("note-nebula"))
  } finally {
    await rm(managedRoot, { recursive: true, force: true })
  }
})

test("bn list and bn search prefer derived index data when available", async () => {
  const managedRoot = await mkdtemp(path.join(os.tmpdir(), "bluenote-cli-search-index-preferred-"))

  try {
    await writeNote(
      managedRoot,
      path.join("notes", "inbox", "alpha.md"),
      `---\nid: note-alpha\nschemaVersion: 1\ntitle: Alpha Note\nmode: plain\ntags: []\ncreatedAt: 2026-05-21T10:15:00.000Z\nupdatedAt: 2026-05-21T10:15:00.000Z\n---\nAlpha body mentions comet.\n`,
    )

    const rebuildResult = runCli(["rebuild"], managedRoot)
    assert.equal(rebuildResult.exitCode, 0)

    await rm(path.join(managedRoot, "notes"), { recursive: true, force: true })

    const listResult = runCli(["list"], managedRoot)
    assert.equal(listResult.exitCode, 0)
    assert.match(listResult.stdout.toString(), /note-alpha\s+Alpha Note\s+notes[\\/]inbox[\\/]alpha\.md/)

    const searchResult = runCli(["search", "comet"], managedRoot)
    assert.equal(searchResult.exitCode, 0)
    assert.match(searchResult.stdout.toString(), /note-alpha\s+Alpha Note\s+notes[\\/]inbox[\\/]alpha\.md/)
  } finally {
    await rm(managedRoot, { recursive: true, force: true })
  }
})

test("bn search returns actionable rebuild guidance when derived indexes are missing", async () => {
  const managedRoot = await mkdtemp(path.join(os.tmpdir(), "bluenote-cli-search-missing-index-"))

  try {
    await writeNote(
      managedRoot,
      path.join("notes", "inbox", "alpha.md"),
      `---\nid: note-alpha\nschemaVersion: 1\ntitle: Alpha Note\nmode: plain\ntags: []\ncreatedAt: 2026-05-21T10:15:00.000Z\nupdatedAt: 2026-05-21T10:15:00.000Z\n---\nAlpha body mentions comet.\n`,
    )

    const result = runCli(["search", "comet"], managedRoot)

    assert.equal(result.exitCode, 2)
    assert.equal(result.stdout.toString(), "")
    assert.match(result.stderr.toString(), /Derived indexes are unavailable\./)
    assert.match(result.stderr.toString(), /Hint: Run bn rebuild to recreate \.bluenote artifacts from note files\./)
  } finally {
    await rm(managedRoot, { recursive: true, force: true })
  }
})
