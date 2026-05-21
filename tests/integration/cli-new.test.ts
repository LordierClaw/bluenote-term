import test from "node:test"
import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises"

import { parseNoteFile } from "../../src/storage/frontmatter"
import { MANAGED_ROOT_LAYOUT } from "../../src/storage/root-layout"

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

test("bn new --title \"Example\" creates a note, initializes the managed root, and returns a created path", async () => {
  const managedRoot = await mkdtemp(path.join(os.tmpdir(), "bluenote-cli-new-"))

  try {
    const result = runCli(["new", "--title", "Example"], managedRoot)

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr.toString(), "")
    assert.match(result.stdout.toString(), /^Created note: notes\/inbox\/.+\.md\n$/)

    for (const relativePath of MANAGED_ROOT_LAYOUT) {
      const stats = await stat(path.join(managedRoot, relativePath))
      assert.equal(stats.isDirectory(), true, `${relativePath} should be a directory`)
    }

    const noteFiles = await readdir(path.join(managedRoot, "notes", "inbox"))
    assert.equal(noteFiles.length, 1)

    const notePath = path.join(managedRoot, "notes", "inbox", noteFiles[0])
    const markdown = await readFile(notePath, "utf8")
    const parsedNote = parseNoteFile(markdown, path.join("notes", "inbox", noteFiles[0]))

    assert.equal(parsedNote.frontmatter.title, "Example")
    assert.equal(parsedNote.frontmatter.schemaVersion, 1)
    assert.equal(parsedNote.frontmatter.mode, "plain")
    assert.deepEqual(parsedNote.frontmatter.tags, [])
    assert.equal(parsedNote.frontmatter.id.endsWith(".md"), false)
    assert.equal(parsedNote.body, "")
  } finally {
    await rm(managedRoot, { recursive: true, force: true })
  }
})

test("repeated note creation produces distinct IDs", async () => {
  const managedRoot = await mkdtemp(path.join(os.tmpdir(), "bluenote-cli-new-distinct-"))

  try {
    const firstResult = runCli(["new", "--title", "Example"], managedRoot)
    const secondResult = runCli(["new", "--title", "Example"], managedRoot)

    assert.equal(firstResult.exitCode, 0)
    assert.equal(secondResult.exitCode, 0)

    const noteFiles = await readdir(path.join(managedRoot, "notes", "inbox"))
    assert.equal(noteFiles.length, 2)

    const firstMarkdown = await readFile(path.join(managedRoot, "notes", "inbox", noteFiles[0]), "utf8")
    const secondMarkdown = await readFile(path.join(managedRoot, "notes", "inbox", noteFiles[1]), "utf8")
    const firstParsed = parseNoteFile(firstMarkdown, path.join("notes", "inbox", noteFiles[0]))
    const secondParsed = parseNoteFile(secondMarkdown, path.join("notes", "inbox", noteFiles[1]))

    assert.notEqual(firstParsed.frontmatter.id, secondParsed.frontmatter.id)
  } finally {
    await rm(managedRoot, { recursive: true, force: true })
  }
})

test("bn new surfaces repository filesystem failures as CLI errors", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "bluenote-cli-new-error-"))
  const blockedRoot = path.join(tempRoot, "blocked-root")

  try {
    await writeFile(blockedRoot, "not a directory")

    const result = runCli(["new", "--title", "Example"], blockedRoot)

    assert.equal(result.exitCode, 1)
    assert.equal(result.stdout.toString(), "")
    assert.equal(
      result.stderr.toString(),
      [
        "Could not initialize BlueNote root at '" + path.resolve(blockedRoot) + "'.",
        "Hint: Ensure BLUENOTE_ROOT points to a writable directory path.",
        "",
      ].join("\n"),
    )
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
})
