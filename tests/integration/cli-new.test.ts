import test from "node:test"
import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises"

import { parseNoteFile } from "../../src/storage/frontmatter"

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

test("bn new --title \"Example\" creates a note and returns a created path", async () => {
  const managedRoot = await mkdtemp(path.join(os.tmpdir(), "bluenote-cli-new-"))

  try {
    const initResult = runCli(["init"], managedRoot)
    assert.equal(initResult.exitCode, 0)

    const result = runCli(["new", "--title", "Example"], managedRoot)

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr.toString(), "")
    assert.match(result.stdout.toString(), /^Created note: notes\/inbox\/.+\.md\n$/)

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
    const initResult = runCli(["init"], managedRoot)
    assert.equal(initResult.exitCode, 0)

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
