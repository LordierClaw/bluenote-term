import { test } from "bun:test"
import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import { mkdtemp, readFile, rm } from "node:fs/promises"

import { formatHelp, formatSearchMatches, runCli } from "../../src/cli/entry"

test("formatHelp lists all Phase 2 commands with actionable usage", () => {
  const help = formatHelp("0.1.0")

  assert.match(help, /BlueNote/)
  assert.match(help, /Local-first terminal notes for plain-note storage and selector-friendly workflows/)
  assert.match(help, /Usage:\n  bn <command> \[options\]/)
  assert.match(help, /--help/)
  assert.match(help, /--version/)
  assert.match(help, /init\s+Initialize the managed BlueNote root/)
  assert.match(help, /new\s+--title <title>\s+Create a new note in notes\/inbox and print its key\/path/)
  assert.match(help, /list\s+List active notes as title, key, description, and path/)
  assert.match(help, /show\s+<key\|path\|slug>\s+Print a matching note summary and body/)
  assert.match(help, /search\s+<query>/)
  assert.match(help, /edit\s+<key\|path\|slug>\s+Open a matching note in \$EDITOR/)
  assert.match(help, /archive\s+<key\|path\|slug>\s+Archive a matching note/)
  assert.match(help, /delete\s+<key\|path>\s+--force\s+Permanently remove a matching note and sidecar/)
  assert.match(help, /rebuild\s+Rebuild derived metadata and search indexes/)
  assert.match(help, /migrate\s+Convert legacy frontmatter notes into plain files \+ sidecars/)
  assert.match(help, /completion\s+<bash\|zsh\|fish>\s+Print shell completion setup/)
})

test("runCli returns version output for --version", () => {
  const result = runCli(["--version"], "0.1.0")

  assert.equal(result.exitCode, 0)
  assert.equal(result.stdout, "0.1.0\n")
  assert.equal(result.stderr, "")
})

test("runCli returns help output by default", () => {
  const result = runCli([], "0.1.0")

  assert.equal(result.exitCode, 0)
  assert.match(result.stdout, /BlueNote/)
  assert.equal(result.stderr, "")
})

test("runCli rejects unknown commands with guidance", () => {
  const result = runCli(["unknown"], "0.1.0")

  assert.equal(result.exitCode, 1)
  assert.match(result.stderr, /Unknown command: unknown/)
  assert.match(result.stderr, /Use --help/)
  assert.match(result.stderr, /available commands/)
})

test("runCli accepts injected create-note dependencies for deterministic new-note tests", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-cli-entry-new-"))
  const previousRoot = process.env.BLUENOTE_ROOT

  process.env.BLUENOTE_ROOT = rootPath

  try {
    const result = runCli(
      ["new", "--title", "Example"],
      "0.1.0",
      {
        createNoteOptions: {
          clock: {
            now() {
              return new Date("2026-05-24T12:00:00.000Z")
            },
          },
          randomSource: () => 0x12345678,
        },
      },
    )

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.equal(result.stdout, "Created note\nKey: example-51u7i0\nPath: notes/inbox/example-51u7i0.md\n")
    assert.equal(await readFile(path.join(rootPath, "notes", "inbox", "example-51u7i0.md"), "utf8"), "")
  } finally {
    if (previousRoot === undefined) {
      delete process.env.BLUENOTE_ROOT
    } else {
      process.env.BLUENOTE_ROOT = previousRoot
    }

    await rm(rootPath, { recursive: true, force: true })
  }
})

test("runCli rejects delete without --force", () => {
  const result = runCli(["delete", "example-note"], "0.1.0")

  assert.equal(result.exitCode, 1)
  assert.equal(result.stdout, "")
  assert.match(result.stderr, /Deleting notes requires --force\./)
  assert.match(result.stderr, /Run bn delete <key\|path> --force to confirm permanent removal\./)
})

test("formatSearchMatches renders grouped note blocks with optional excerpts", () => {
  const output = formatSearchMatches("moonbeam", [
    {
      key: "moonbeam-title",
      title: "Moonbeam Launch",
      relativePath: path.join("notes", "inbox", "moonbeam-title.md"),
      match: { source: "title", label: "title" },
    },
    {
      key: "content-match",
      title: "Incident Notes",
      relativePath: path.join("notes", "journal", "content-match.md"),
      match: { source: "content", label: "content line 2", excerpt: "...Second line mentions moonbeam during deployment..." },
    },
  ])

  assert.match(output, /^Moonbeam Launch\n  key: moonbeam-title\n  path: notes[\\/]inbox[\\/]moonbeam-title\.md\n  match: title/m)
  assert.match(output, /Incident Notes\n  key: content-match\n  path: notes[\\/]journal[\\/]content-match\.md\n  match: content line 2\n  excerpt:\n    \.\.\.Second line mentions moonbeam during deployment\.\.\./)
})

test("formatSearchMatches returns a calm no-result message", () => {
  assert.equal(formatSearchMatches("saturn", []), 'No notes matched "saturn".\n')
})
