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

test("bn list shows existing note summaries", async () => {
  const managedRoot = await mkdtemp(path.join(os.tmpdir(), "bluenote-cli-list-"))

  try {
    await writeNote(
      managedRoot,
      path.join("notes", "inbox", "alpha.md"),
      `---\nid: note-alpha\nschemaVersion: 1\ntitle: Alpha Note\nmode: plain\ntags: []\ncreatedAt: 2026-05-21T10:15:00.000Z\nupdatedAt: 2026-05-21T10:15:00.000Z\n---\nAlpha body.\n`,
    )
    await writeNote(
      managedRoot,
      path.join("notes", "journal", "beta.md"),
      `---\nid: note-beta\nschemaVersion: 1\ntitle: Beta Note\nmode: plain\ntags: []\ncreatedAt: 2026-05-21T11:15:00.000Z\nupdatedAt: 2026-05-21T11:15:00.000Z\n---\nBeta body.\n`,
    )

    const result = runCli(["list"], managedRoot)

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr.toString(), "")
    assert.match(result.stdout.toString(), /note-alpha\s+Alpha Note\s+notes\/inbox\/alpha\.md/)
    assert.match(result.stdout.toString(), /note-beta\s+Beta Note\s+notes\/journal\/beta\.md/)
  } finally {
    await rm(managedRoot, { recursive: true, force: true })
  }
})

test("bn show <selector> prints the matching note", async () => {
  const managedRoot = await mkdtemp(path.join(os.tmpdir(), "bluenote-cli-show-"))
  const markdown = `---\nid: show-note\nschemaVersion: 1\ntitle: Example Show Note\nmode: plain\ntags: []\ncreatedAt: 2026-05-21T10:15:00.000Z\nupdatedAt: 2026-05-21T10:15:00.000Z\n---\nVisible body.\n`

  try {
    await writeNote(managedRoot, path.join("notes", "inbox", "show-note.md"), markdown)

    const result = runCli(["show", "show-note"], managedRoot)

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr.toString(), "")
    assert.equal(result.stdout.toString(), markdown)
  } finally {
    await rm(managedRoot, { recursive: true, force: true })
  }
})
