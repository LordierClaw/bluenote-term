import { test } from "bun:test"
import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"

import { formatHelp, formatSearchMatches, runCli } from "../../src/cli/entry"

test("formatHelp lists the public commands without removed command or release-stage wording", () => {
  const help = formatHelp("0.1.0")

  assert.match(help, /BlueNote/)
  assert.match(help, /Local-first terminal notes for plain-note storage and selector-friendly workflows/)
  assert.match(help, /Usage:\n  bn <command> \[options\]/)
  assert.match(help, /--help/)
  assert.match(help, /--version/)
  assert.match(help, /init\s+Initialize the managed BlueNote root/)
  assert.match(help, /new\s+\[--title <title>\] \[--path note\/<folder>\] \[--clipboard\] <body>/)
  assert.doesNotMatch(help, /new\s+--title <title>\s+Create a new note in note\/ and print its key\/path/)
  assert.match(help, /list\s+\[--drafts\|--all\]\s+List notes as title, key, description, and path/)
  assert.match(help, /show\s+\[--drafts\|--all\] <key\|path>\s+Print a matching note summary and body/)
  assert.match(help, /search\s+\[--drafts\|--all\] <query>/)
  assert.match(help, /edit\s+\[--drafts\|--all\] <key\|path>\s+Open a matching note in \$EDITOR/)
  assert.match(help, /archive\s+\[--drafts\|--all\] <key\|path>\s+Archive a matching normal note/)
  assert.match(help, /delete\s+\[--drafts\|--all\] <key\|path> --force\s+Permanently remove a matching note and sidecar/)
  assert.match(help, /rebuild\s+Rebuild derived metadata and search indexes/)
  assert.doesNotMatch(help, /migrate\s+Convert frontmatter notes into plain files \+ sidecars/)
  assert.doesNotMatch(help, new RegExp("completion|Pha" + "se\\s+[0-9]", "i"))
  assert.match(help, /tui\s+Launch the terminal UI workspace/)
})

test("runCli rejects the removed completion command", () => {
  const result = runCli(["completion", "bash"], "0.1.0")

  assert.equal(result.exitCode, 1)
  assert.match(result.stderr, /Unknown command: completion/)
  assert.equal(result.stdout, "")
})

test("runCli rejects the removed migrate command", () => {
  const result = runCli(["migrate"], "0.1.0")

  assert.equal(result.exitCode, 1)
  assert.match(result.stderr, /Unknown command: migrate/)
  assert.equal(result.stdout, "")
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

test("runCli returns new-note subcommand help", () => {
  const result = runCli(["new", "--help"], "0.1.0")

  assert.equal(result.exitCode, 0)
  assert.equal(result.stderr, "")
  assert.match(result.stdout, /Usage:\n  bn new \[--title <title>\] \[--path note\/<folder>\] \[--clipboard\] <body>/)
  assert.match(result.stdout, /Without --path, creates a draft under draft\//)
  assert.match(result.stdout, /With --path note\/<folder> and --title, creates a normal note/)
})

test("runCli rejects unknown commands with guidance", () => {
  const result = runCli(["unknown"], "0.1.0")

  assert.equal(result.exitCode, 1)
  assert.match(result.stderr, /Unknown command: unknown/)
  assert.match(result.stderr, /Use --help/)
  assert.match(result.stderr, /available commands/)
})

test("runCli delegates tui to an injectable TUI runner and returns its result", () => {
  let callCount = 0

  const result = runCli(["tui"], "0.1.0", {
    tuiRunner() {
      callCount += 1

      return {
        exitCode: 0,
        stdout: "TUI runner launched.\n",
        stderr: "",
      }
    },
  })

  assert.equal(callCount, 1)
  assert.equal(result.exitCode, 0)
  assert.equal(result.stdout, "TUI runner launched.\n")
  assert.equal(result.stderr, "")
})

test("runCli creates an untitled draft from positional body with deterministic create-note dependencies", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-cli-entry-new-"))
  const previousRoot = process.env.BLUENOTE_ROOT

  process.env.BLUENOTE_ROOT = rootPath

  try {
    const result = runCli(
      ["new", "Plain body text"],
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
    assert.equal(result.stdout, "Created note\nKey: draft-51u7i0\nPath: draft/draft-51u7i0.md\n")
    assert.equal(await readFile(path.join(rootPath, "draft", "draft-51u7i0.md"), "utf8"), "Plain body text")
  } finally {
    if (previousRoot === undefined) {
      delete process.env.BLUENOTE_ROOT
    } else {
      process.env.BLUENOTE_ROOT = previousRoot
    }

    await rm(rootPath, { recursive: true, force: true })
  }
})

test("runCli creates a title-derived draft when --title and positional body are provided", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-cli-entry-new-title-draft-"))
  const previousRoot = process.env.BLUENOTE_ROOT

  process.env.BLUENOTE_ROOT = rootPath

  try {
    const result = runCli(["new", "--title", "Idea", "Draft body"], "0.1.0", {
      createNoteOptions: {
        clock: { now: () => new Date("2026-05-24T12:00:00.000Z") },
        randomSource: () => 0x12345678,
      },
    })

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.equal(result.stdout, "Created note\nKey: idea-51u7i0\nPath: draft/idea-51u7i0.md\n")
    assert.equal(await readFile(path.join(rootPath, "draft", "idea-51u7i0.md"), "utf8"), "Draft body")
  } finally {
    if (previousRoot === undefined) {
      delete process.env.BLUENOTE_ROOT
    } else {
      process.env.BLUENOTE_ROOT = previousRoot
    }

    await rm(rootPath, { recursive: true, force: true })
  }
})

test("runCli creates a normal note under an existing note folder when --path, --title, and body are provided", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-cli-entry-new-normal-"))
  const previousRoot = process.env.BLUENOTE_ROOT

  process.env.BLUENOTE_ROOT = rootPath

  try {
    runCli(["init"], "0.1.0")
    await mkdir(path.join(rootPath, "note", "work"), { recursive: true })

    const result = runCli(["new", "--path", "note/work", "--title", "Meeting", "Meeting body"], "0.1.0", {
      createNoteOptions: {
        clock: { now: () => new Date("2026-05-24T12:00:00.000Z") },
        randomSource: () => 0x12345678,
      },
    })

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.equal(result.stdout, "Created note\nKey: meeting-51u7i0\nPath: note/work/meeting-51u7i0.md\n")
    assert.equal(await readFile(path.join(rootPath, "note", "work", "meeting-51u7i0.md"), "utf8"), "Meeting body")
  } finally {
    if (previousRoot === undefined) {
      delete process.env.BLUENOTE_ROOT
    } else {
      process.env.BLUENOTE_ROOT = previousRoot
    }

    await rm(rootPath, { recursive: true, force: true })
  }
})

test("runCli rejects invalid new-note body source and path combinations", () => {
  const cases: Array<{ args: string[]; pattern: RegExp }> = [
    { args: ["new", "--path", "note/work", "body"], pattern: /--path requires --title/ },
    { args: ["new", "--path", "draft", "--title", "Bad", "body"], pattern: /--path must point to an existing folder under note\// },
    { args: ["new", "--path", "note/missing", "--title", "Bad", "body"], pattern: /existing folder under note\// },
    { args: ["new"], pattern: /Missing note body/ },
    { args: ["new", "body", "--clipboard"], pattern: /Choose either positional body or --clipboard/ },
  ]

  for (const { args, pattern } of cases) {
    const result = runCli(args, "0.1.0")
    assert.equal(result.exitCode, 1)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, pattern)
  }
})

test("runCli reads body from injected clipboard runtime and rejects empty or unavailable clipboard", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-cli-entry-new-clipboard-"))
  const previousRoot = process.env.BLUENOTE_ROOT

  process.env.BLUENOTE_ROOT = rootPath

  try {
    const created = runCli(["new", "--clipboard"], "0.1.0", {
      clipboard: { readText: () => "Clipboard body" },
      createNoteOptions: {
        clock: { now: () => new Date("2026-05-24T12:00:00.000Z") },
        randomSource: () => 0x12345678,
      },
    })

    assert.equal(created.exitCode, 0)
    assert.equal(await readFile(path.join(rootPath, "draft", "draft-51u7i0.md"), "utf8"), "Clipboard body")

    const empty = runCli(["new", "--clipboard"], "0.1.0", {
      clipboard: { readText: () => "" },
    })
    assert.equal(empty.exitCode, 1)
    assert.match(empty.stderr, /Clipboard is empty or unavailable/)

    const unavailable = runCli(["new", "--clipboard"], "0.1.0", {
      clipboard: { readText: () => { throw new Error("no clipboard") } },
    })
    assert.equal(unavailable.exitCode, 1)
    assert.match(unavailable.stderr, /Clipboard is empty or unavailable/)
  } finally {
    if (previousRoot === undefined) {
      delete process.env.BLUENOTE_ROOT
    } else {
      process.env.BLUENOTE_ROOT = previousRoot
    }

    await rm(rootPath, { recursive: true, force: true })
  }
})

test("runCli selector commands default to normal notes and accept draft/all visibility flags", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-cli-entry-selector-visibility-"))
  const previousRoot = process.env.BLUENOTE_ROOT
  const previousEditor = process.env.EDITOR

  process.env.BLUENOTE_ROOT = rootPath

  try {
    runCli(["init"], "0.1.0")
    const editorScriptPath = path.join(rootPath, "noop-editor.sh")
    await writeFile(editorScriptPath, "#!/usr/bin/env bash\nexit 0\n", "utf8")
    await chmod(editorScriptPath, 0o755)
    process.env.EDITOR = editorScriptPath

    const draft = runCli(["new", "Draft body"], "0.1.0", {
      createNoteOptions: { randomSource: () => 0x12345678 },
    })
    assert.equal(draft.exitCode, 0)
    const draftKey = draft.stdout.match(/^Key: (?<key>.+)$/m)?.groups?.key
    assert.ok(draftKey)

    const normal = runCli(["new", "--path", "note", "--title", "Normal", "Normal body"], "0.1.0", {
      createNoteOptions: { randomSource: () => 0xabcdef12 },
    })
    assert.equal(normal.exitCode, 0)
    const normalKey = normal.stdout.match(/^Key: (?<key>.+)$/m)?.groups?.key
    assert.ok(normalKey)

    const defaultDraftShow = runCli(["show", draftKey], "0.1.0")
    assert.equal(defaultDraftShow.exitCode, 1)
    assert.match(defaultDraftShow.stderr, /Could not find a note matching selector/)

    const draftShow = runCli(["show", "--drafts", draftKey], "0.1.0")
    assert.equal(draftShow.exitCode, 0)
    assert.match(draftShow.stdout, /Path: draft\/draft-51u7i0\.md/)

    const draftEdit = runCli(["edit", "--drafts", draftKey], "0.1.0")
    assert.equal(draftEdit.exitCode, 0)
    assert.match(draftEdit.stdout, /Edited note: draft\/draft-51u7i0\.md/)

    const defaultDraftDelete = runCli(["delete", draftKey, "--force"], "0.1.0")
    assert.equal(defaultDraftDelete.exitCode, 1)
    assert.match(defaultDraftDelete.stderr, /Could not find a note matching selector/)

    const draftDelete = runCli(["delete", "--drafts", draftKey, "--force"], "0.1.0")
    assert.equal(draftDelete.exitCode, 0)
    assert.match(draftDelete.stdout, /Deleted note: draft\/draft-51u7i0\.md/)

    const archived = runCli(["archive", normalKey], "0.1.0")
    assert.equal(archived.exitCode, 0)

    const defaultArchivedShow = runCli(["show", normalKey], "0.1.0")
    assert.equal(defaultArchivedShow.exitCode, 1)
    assert.match(defaultArchivedShow.stderr, /Could not find a note matching selector/)

    const archivedShow = runCli(["show", "--all", normalKey], "0.1.0")
    assert.equal(archivedShow.exitCode, 0)
    assert.match(archivedShow.stdout, /Path: \.data\/archive\/normal-[a-z0-9]+\.md/)

    const extraSelector = runCli(["show", "--drafts", "one", "two"], "0.1.0")
    assert.equal(extraSelector.exitCode, 1)
    assert.match(extraSelector.stderr, /Too many selectors for show/)
  } finally {
    if (previousRoot === undefined) {
      delete process.env.BLUENOTE_ROOT
    } else {
      process.env.BLUENOTE_ROOT = previousRoot
    }
    if (previousEditor === undefined) {
      delete process.env.EDITOR
    } else {
      process.env.EDITOR = previousEditor
    }

    await rm(rootPath, { recursive: true, force: true })
  }
})

test("runCli treats visibility flags as search options only before the query", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-cli-entry-search-flags-"))
  const previousRoot = process.env.BLUENOTE_ROOT

  process.env.BLUENOTE_ROOT = rootPath

  try {
    runCli(["init"], "0.1.0")
    const created = runCli(["new", "--path", "note", "--title", "Alpha", "body"], "0.1.0", {
      createNoteOptions: {
        randomSource: () => 0x12345678,
      },
    })
    assert.equal(created.exitCode, 0)
    const rebuilt = runCli(["rebuild"], "0.1.0")
    assert.equal(rebuilt.exitCode, 0)

    const result = runCli(["search", "alpha", "--all"], "0.1.0")

    assert.equal(result.exitCode, 0)
    assert.equal(result.stdout, 'No notes matched "alpha --all".\n')
    assert.equal(result.stderr, "")
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
      relativePath: "notes/inbox/moonbeam-title.md",
      match: { source: "title", label: "title" },
    },
    {
      key: "content-match",
      title: "Incident Notes",
      relativePath: "notes/journal/content-match.md",
      match: { source: "content", label: "content line 2", excerpt: "...Second line mentions moonbeam during deployment..." },
    },
  ])

  assert.match(output, /^Moonbeam Launch\n  key: moonbeam-title\n  path: notes[\\/]inbox[\\/]moonbeam-title\.md\n  match: title/m)
  assert.match(output, /Incident Notes\n  key: content-match\n  path: notes[\\/]journal[\\/]content-match\.md\n  match: content line 2\n  excerpt:\n    \.\.\.Second line mentions moonbeam during deployment\.\.\./)
})

test("formatSearchMatches returns a calm no-result message", () => {
  assert.equal(formatSearchMatches("saturn", []), 'No notes matched "saturn".\n')
})
