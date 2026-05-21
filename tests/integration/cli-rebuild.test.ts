import test from "node:test"
import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import { cp, mkdtemp, mkdir, readFile, rm } from "node:fs/promises"

const workspaceRoot = path.resolve(import.meta.dir, "../..")
const cliPath = path.join(workspaceRoot, "bin", "bn.ts")
const fixturesRoot = path.join(workspaceRoot, "tests", "fixtures")

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

test("bn rebuild scans notes and writes derived artifacts under .bluenote", async () => {
  const managedRoot = await mkdtemp(path.join(os.tmpdir(), "bluenote-cli-rebuild-"))

  try {
    await writeNote(
      managedRoot,
      path.join("notes", "inbox", "alpha.md"),
      `---\nid: note-alpha\nschemaVersion: 1\ntitle: Alpha Note\nmode: plain\ntags: []\ncreatedAt: 2026-05-21T10:15:00.000Z\nupdatedAt: 2026-05-21T10:15:00.000Z\n---\nAlpha body.\n`,
    )

    const firstResult = runCli(["rebuild"], managedRoot)

    assert.equal(firstResult.exitCode, 0)
    assert.equal(firstResult.stderr.toString(), "")
    assert.match(firstResult.stdout.toString(), /Rebuilt indexes for 1 note\(s\)\./)

    const metadataPath = path.join(managedRoot, ".bluenote", "metadata.sqlite")
    const searchPath = path.join(managedRoot, ".bluenote", "search-index.json")

    assert.equal(await Bun.file(metadataPath).exists(), true)
    assert.equal(await Bun.file(searchPath).exists(), true)

    await rm(metadataPath, { force: true })
    await rm(searchPath, { force: true })

    const secondResult = runCli(["rebuild"], managedRoot)

    assert.equal(secondResult.exitCode, 0)
    assert.equal(secondResult.stderr.toString(), "")
    assert.equal(await Bun.file(metadataPath).exists(), true)
    assert.equal(await Bun.file(searchPath).exists(), true)
  } finally {
    await rm(managedRoot, { recursive: true, force: true })
  }
})

test("bn rebuild exits 2 and reports duplicate IDs as validation failures", async () => {
  const managedRoot = await mkdtemp(path.join(os.tmpdir(), "bluenote-cli-rebuild-duplicate-"))

  try {
    await cp(path.join(fixturesRoot, "duplicate-ids"), path.join(managedRoot, "notes"), { recursive: true })

    const result = runCli(["rebuild"], managedRoot)

    assert.equal(result.exitCode, 2)
    assert.equal(result.stdout.toString(), "")
    assert.match(result.stderr.toString(), /Validation failed while rebuilding indexes\./)
    assert.match(result.stderr.toString(), /Duplicate note id 'duplicate-note'/)
    assert.match(result.stderr.toString(), /duplicate-a\.md/)
    assert.match(result.stderr.toString(), /duplicate-b\.md/)
  } finally {
    await rm(managedRoot, { recursive: true, force: true })
  }
})

test("bn rebuild exits 2 and surfaces exact invalid frontmatter file errors", async () => {
  const managedRoot = await mkdtemp(path.join(os.tmpdir(), "bluenote-cli-rebuild-invalid-"))

  try {
    await mkdir(path.join(managedRoot, "notes", "inbox"), { recursive: true })
    const invalidFixturePath = path.join(fixturesRoot, "invalid-frontmatter", "missing-title.md")
    await Bun.write(
      path.join(managedRoot, "notes", "inbox", "missing-title.md"),
      await readFile(invalidFixturePath, "utf8"),
    )

    const result = runCli(["rebuild"], managedRoot)

    assert.equal(result.exitCode, 2)
    assert.equal(result.stdout.toString(), "")
    assert.match(result.stderr.toString(), /Validation failed while rebuilding indexes\./)
    assert.match(result.stderr.toString(), /notes[\\/]inbox[\\/]missing-title\.md/)
    assert.match(result.stderr.toString(), /missing required field 'title'/)
  } finally {
    await rm(managedRoot, { recursive: true, force: true })
  }
})
