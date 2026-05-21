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

    const rebuildResult = runCli(["rebuild"], managedRoot)

    assert.equal(rebuildResult.exitCode, 0)
    assert.equal(rebuildResult.stderr.toString(), "")

    const result = runCli(["list"], managedRoot)

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr.toString(), "")
    assert.match(result.stdout.toString(), /note-alpha\s+Alpha Note\s+notes[\\/]inbox[\\/]alpha\.md/)
    assert.match(result.stdout.toString(), /note-beta\s+Beta Note\s+notes[\\/]journal[\\/]beta\.md/)
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

test("bn show preserves the stored note formatting exactly", async () => {
  const managedRoot = await mkdtemp(path.join(os.tmpdir(), "bluenote-cli-show-formatting-"))
  const markdown = `---
title: "Formatting Example"
id: formatting-note
schemaVersion: 1
mode: plain
tags: [alpha, beta]
createdAt: "2026-05-21T10:15:00.000Z"
updatedAt: "2026-05-21T10:15:00.000Z"
---

Body line one.

Body line two.
`

  try {
    await writeNote(managedRoot, path.join("notes", "inbox", "formatting-note.md"), markdown)

    const result = runCli(["show", "formatting-note"], managedRoot)

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr.toString(), "")
    assert.equal(result.stdout.toString(), markdown)
  } finally {
    await rm(managedRoot, { recursive: true, force: true })
  }
})

test("bn show resolves a title-derived slug selector", async () => {
  const managedRoot = await mkdtemp(path.join(os.tmpdir(), "bluenote-cli-show-slug-"))
  const markdown = `---\nid: slug-note\nschemaVersion: 1\ntitle: Example Show Note\nmode: plain\ntags: []\ncreatedAt: 2026-05-21T10:15:00.000Z\nupdatedAt: 2026-05-21T10:15:00.000Z\n---\nVisible body.\n`

  try {
    await writeNote(managedRoot, path.join("notes", "inbox", "slug-note.md"), markdown)

    const result = runCli(["show", "  ExAmPlE-sHoW-nOtE  "], managedRoot)

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr.toString(), "")
    assert.equal(result.stdout.toString(), markdown)
  } finally {
    await rm(managedRoot, { recursive: true, force: true })
  }
})

test("bn show resolves a managed-root-relative path selector", async () => {
  const managedRoot = await mkdtemp(path.join(os.tmpdir(), "bluenote-cli-show-path-"))
  const relativePath = path.join("notes", "journal", "show-path.md")
  const markdown = `---\nid: path-note\nschemaVersion: 1\ntitle: Path Show Note\nmode: plain\ntags: []\ncreatedAt: 2026-05-21T10:15:00.000Z\nupdatedAt: 2026-05-21T10:15:00.000Z\n---\nPath body.\n`

  try {
    await writeNote(managedRoot, relativePath, markdown)

    const result = runCli(["show", relativePath], managedRoot)

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr.toString(), "")
    assert.equal(result.stdout.toString(), markdown)
  } finally {
    await rm(managedRoot, { recursive: true, force: true })
  }
})

test("bn show surfaces ambiguous selector failures", async () => {
  const managedRoot = await mkdtemp(path.join(os.tmpdir(), "bluenote-cli-show-ambiguous-"))

  try {
    await writeNote(
      managedRoot,
      path.join("notes", "inbox", "shared-a.md"),
      `---\nid: shared-a\nschemaVersion: 1\ntitle: Shared Title\nmode: plain\ntags: []\ncreatedAt: 2026-05-21T10:19:00.000Z\nupdatedAt: 2026-05-21T10:19:00.000Z\n---\nShared A body.\n`,
    )
    await writeNote(
      managedRoot,
      path.join("notes", "archive", "shared-b.md"),
      `---\nid: shared-b\nschemaVersion: 1\ntitle: Shared Title\nmode: plain\ntags: []\ncreatedAt: 2026-05-21T10:20:00.000Z\nupdatedAt: 2026-05-21T10:20:00.000Z\n---\nShared B body.\n`,
    )

    const result = runCli(["show", "shared-title"], managedRoot)

    assert.equal(result.exitCode, 2)
    assert.equal(result.stdout.toString(), "")
    assert.match(result.stderr.toString(), /Ambiguous note selector: shared-title\./)
    assert.match(result.stderr.toString(), /notes[\\/]inbox[\\/]shared-a\.md/)
    assert.match(result.stderr.toString(), /notes[\\/]archive[\\/]shared-b\.md/)
    assert.match(result.stderr.toString(), /Hint: Use a note ID or managed-root-relative path to disambiguate\./)
  } finally {
    await rm(managedRoot, { recursive: true, force: true })
  }
})

test("bn show reports selector-not-found errors", async () => {
  const managedRoot = await mkdtemp(path.join(os.tmpdir(), "bluenote-cli-show-missing-"))

  try {
    await writeNote(
      managedRoot,
      path.join("notes", "inbox", "present.md"),
      `---\nid: present-note\nschemaVersion: 1\ntitle: Present Note\nmode: plain\ntags: []\ncreatedAt: 2026-05-21T10:15:00.000Z\nupdatedAt: 2026-05-21T10:15:00.000Z\n---\nVisible body.\n`,
    )

    const result = runCli(["show", "does-not-exist"], managedRoot)

    assert.equal(result.exitCode, 1)
    assert.equal(result.stdout.toString(), "")
    assert.match(result.stderr.toString(), /Could not find a note matching selector 'does-not-exist'\./)
    assert.match(result.stderr.toString(), /Hint: Use bn list to inspect available notes\./)
  } finally {
    await rm(managedRoot, { recursive: true, force: true })
  }
})

test("bn show requires a selector argument", async () => {
  const managedRoot = await mkdtemp(path.join(os.tmpdir(), "bluenote-cli-show-usage-"))

  try {
    const result = runCli(["show"], managedRoot)

    assert.equal(result.exitCode, 1)
    assert.equal(result.stdout.toString(), "")
    assert.match(result.stderr.toString(), /Missing required selector for show\./)
    assert.match(result.stderr.toString(), /Hint: Run bn show <id\|path\|slug>\./)
  } finally {
    await rm(managedRoot, { recursive: true, force: true })
  }
})
