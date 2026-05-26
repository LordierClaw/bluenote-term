import { test } from "bun:test"
import assert from "node:assert/strict"
import path from "node:path"
import { readFile } from "node:fs/promises"

const workspaceRoot = path.resolve(import.meta.dir, "../..")

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(workspaceRoot, relativePath), "utf8")
}

test("README documents the Phase 3 TUI workspace launch and screen model", async () => {
  const readme = await readRepoFile("README.md")

  assert.match(readme, /bn tui/)
  assert.match(readme, /Manager/i)
  assert.match(readme, /Editor/i)
  assert.match(readme, /Search Everything/i)
  assert.match(readme, /shell completion/i)
  assert.match(readme, /not a TUI action/i)
})

test("product and phase docs describe separate Manager, Editor, and Search Everything Phase 3 scope", async () => {
  const overview = await readRepoFile("docs/product/overview.md")
  const phase = await readRepoFile("docs/phases/phase-3-tui-workspace.md")

  for (const content of [overview, phase]) {
    assert.match(content, /bn tui/)
    assert.match(content, /Manager/i)
    assert.match(content, /Editor/i)
    assert.match(content, /Search Everything/i)
  }

  assert.match(phase, /plain Markdown/i)
  assert.match(phase, /without required frontmatter|no .*frontmatter/i)
  assert.match(phase, /command entries/i)
  assert.match(phase, /only .*\/save.* wired|\/save.* only .*wired/i)
  assert.doesNotMatch(phase, /command\/action layer covering the available CLI workflows/i)
})

test("runtime docs identify OpenTUI as the Phase 3 workspace runtime", async () => {
  const runtime = await readRepoFile("docs/architecture/runtime-and-dependencies.md")

  assert.match(runtime, /@opentui\/core/)
  assert.match(runtime, /Phase 3/i)
  assert.match(runtime, /bn tui/)
  assert.match(runtime, /Manager/i)
  assert.match(runtime, /Editor/i)
  assert.match(runtime, /Search Everything/i)
})
