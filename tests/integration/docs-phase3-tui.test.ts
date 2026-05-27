import { test } from "bun:test"
import assert from "node:assert/strict"
import path from "node:path"
import { readFile } from "node:fs/promises"

const workspaceRoot = path.resolve(import.meta.dir, "../..")

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(workspaceRoot, relativePath), "utf8")
}

function assertRefinedTuiBehavior(content: string): void {
  assert.match(content, /two-column/i)
  assert.match(content, /browser/i)
  assert.match(content, /preview/i)
  assert.match(content, /right|→/i)
  assert.match(content, /left|←/i)
  assert.match(content, /open/i)
  assert.match(content, /back/i)
  assert.match(content, /Ctrl\+F/i)
  assert.match(content, /find/i)
  assert.match(content, /750\s*ms/i)
  assert.match(content, /autosave/i)
  assert.match(content, /single-input|single input|one input/i)
  assert.match(content, /result-list|result list/i)
  assert.match(content, /Escape/i)
  assert.match(content, /Ctrl\+\[/i)
  assert.match(content, /restrained blue|blue palette|blue theme/i)
  assert.match(content, /focus/i)
  assert.match(content, /muted/i)
  assert.doesNotMatch(content, /warning\/success|success states|semantic colors|semantic colour/i)
  assert.match(content, /chrome/i)
  assert.match(content, /typing|input regression|editor input/i)
  assert.match(content, /\bn\b.*new|new.*\bn\b|create note/i)
  assert.match(content, /\bd\b.*delete|delete.*\bd\b/i)
  assert.match(content, /confirm|confirmation/i)
  assert.match(content, /plain Markdown/i)
  assert.match(content, /without required frontmatter|no .*frontmatter|do not gain frontmatter/i)
}

function assertMinimalManagerChrome(content: string): void {
  assert.match(content, /minimal manager|minimal .*Manager|Manager .*minimal/i)
  assert.match(content, /current folder|current path|folder path/i)
  assert.match(content, /focused item|selected item|hovered path/i)
  assert.match(content, /short action hints|compact .*hints|minimal .*hints/i)
  assert.doesNotMatch(content, /BlueNote Manager|BlueNote TUI|branded title screen|decorative title/i)
}

function assertDataStorageAndContainsSearchContract(content: string): void {
  assert.match(content, /plain Markdown/i)
  assert.match(content, /\.data\/notes\//)
  assert.match(content, /\.data\/metadata\.sqlite/)
  assert.match(content, /\.data\/search-index\.json/)
  assert.match(content, /contains-style|contains style/i)
  assert.match(content, /123.*contain|contain.*123/i)
  assert.doesNotMatch(content, /\.state\/notes\//)
  assert.doesNotMatch(content, /\.state\/metadata\.sqlite|\.state\/search-index\.json/)
  assert.doesNotMatch(content, /fuzzy search|fuzzy-style search|fuzzy matching/i)
}

test("README documents the refined Phase 3 TUI workspace behavior", async () => {
  const readme = await readRepoFile("README.md")

  assert.match(readme, /bn tui/)
  assert.match(readme, /Manager/i)
  assert.match(readme, /Editor/i)
  assert.match(readme, /Search Everything/i)
  assert.match(readme, /shell completion/i)
  assert.match(readme, /not a TUI action/i)
  assertRefinedTuiBehavior(readme)
  assertMinimalManagerChrome(readme)
})

test("product and phase docs describe refined Manager, Editor, and Search Everything Phase 3 scope", async () => {
  const overview = await readRepoFile("docs/product/overview.md")
  const phase = await readRepoFile("docs/phases/phase-3-tui-workspace.md")

  for (const content of [overview, phase]) {
    assert.match(content, /bn tui/)
    assert.match(content, /Manager/i)
    assert.match(content, /Editor/i)
    assert.match(content, /Search Everything/i)
    assertRefinedTuiBehavior(content)
    assertMinimalManagerChrome(content)
  }

  assert.match(phase, /plain Markdown/i)
  assert.match(phase, /without required frontmatter|no .*frontmatter/i)
  assert.match(phase, /command entries/i)
  assert.match(phase, /only .*\/save.* wired|\/save.* only .*wired/i)
  assert.doesNotMatch(phase, /command\/action layer covering the available CLI workflows/i)
})

test("runtime docs identify OpenTUI as the refined Phase 3 workspace runtime", async () => {
  const runtime = await readRepoFile("docs/architecture/runtime-and-dependencies.md")

  assert.match(runtime, /@opentui\/core/)
  assert.match(runtime, /Phase 3/i)
  assert.match(runtime, /bn tui/)
  assert.match(runtime, /Manager/i)
  assert.match(runtime, /Editor/i)
  assert.match(runtime, /Search Everything/i)
  assertRefinedTuiBehavior(runtime)
})

test("active docs describe canonical data storage and contains search contracts", async () => {
  const docs = await Promise.all([
    readRepoFile("README.md"),
    readRepoFile("docs/product/overview.md"),
    readRepoFile("docs/architecture/managed-root-layout.md"),
    readRepoFile("docs/architecture/note-format-and-indexing.md"),
    readRepoFile("docs/architecture/runtime-and-dependencies.md"),
    readRepoFile("docs/phases/phase-4-search-editing-and-recovery.md"),
  ])

  for (const content of docs) {
    assertDataStorageAndContainsSearchContract(content)
  }
})
