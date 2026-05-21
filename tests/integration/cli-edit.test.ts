import test from "node:test"
import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"

const workspaceRoot = path.resolve(import.meta.dir, "../..")
const cliPath = path.join(workspaceRoot, "bin", "bn.ts")

function runCli(args: string[], managedRoot: string, editor?: string) {
  return Bun.spawnSync(["bun", "run", cliPath, ...args], {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      BLUENOTE_ROOT: managedRoot,
      ...(editor ? { EDITOR: editor } : {}),
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

test("bn edit <selector> launches the editor for the resolved note and rebuilds derived state", async () => {
  const managedRoot = await mkdtemp(path.join(os.tmpdir(), "bluenote-cli-edit-"))
  const relativePath = path.join("notes", "inbox", "edit-note.md")
  const initialMarkdown = `---\nid: edit-note\nschemaVersion: 1\ntitle: Editable Note\nmode: plain\ntags: []\ncreatedAt: 2026-05-21T10:15:00.000Z\nupdatedAt: 2026-05-21T10:15:00.000Z\n---\nOriginal body.\n`
  const updatedMarkdown = `---\nid: edit-note\nschemaVersion: 1\ntitle: Edited Note\nmode: plain\ntags: []\ncreatedAt: 2026-05-21T10:15:00.000Z\nupdatedAt: 2026-05-21T11:45:00.000Z\n---\nUpdated body with zebra tokens.\n`
  const editorScriptPath = path.join(managedRoot, "fake-editor.sh")

  try {
    await writeNote(managedRoot, relativePath, initialMarkdown)
    await writeFile(
      editorScriptPath,
      `#!/bin/sh\ncat <<'EOF' > "$1"\n${updatedMarkdown}EOF\n`,
      "utf8",
    )
    await chmod(editorScriptPath, 0o755)

    const rebuildResult = runCli(["rebuild"], managedRoot)
    assert.equal(rebuildResult.exitCode, 0)
    assert.equal(rebuildResult.stderr.toString(), "")

    const editResult = runCli(["edit", "edit-note"], managedRoot, editorScriptPath)

    assert.equal(editResult.exitCode, 0)
    assert.equal(editResult.stderr.toString(), "")
    assert.match(editResult.stdout.toString(), /Edited note: notes[\\/]inbox[\\/]edit-note\.md/)

    const showResult = runCli(["show", "edit-note"], managedRoot)
    assert.equal(showResult.exitCode, 0)
    assert.equal(showResult.stdout.toString(), updatedMarkdown)

    const searchResult = runCli(["search", "zebra tokens"], managedRoot)
    assert.equal(searchResult.exitCode, 0)
    assert.match(searchResult.stdout.toString(), /edit-note\s+Edited Note\s+notes[\\/]inbox[\\/]edit-note\.md/)
  } finally {
    await rm(managedRoot, { recursive: true, force: true })
  }
})

test("bn edit fails when $EDITOR is unset", async () => {
  const managedRoot = await mkdtemp(path.join(os.tmpdir(), "bluenote-cli-edit-missing-editor-"))

  try {
    await writeNote(
      managedRoot,
      path.join("notes", "inbox", "present.md"),
      `---\nid: present-note\nschemaVersion: 1\ntitle: Present Note\nmode: plain\ntags: []\ncreatedAt: 2026-05-21T10:15:00.000Z\nupdatedAt: 2026-05-21T10:15:00.000Z\n---\nVisible body.\n`,
    )

    const result = runCli(["edit", "present-note"], managedRoot)

    assert.equal(result.exitCode, 1)
    assert.equal(result.stdout.toString(), "")
    assert.match(result.stderr.toString(), /EDITOR is not set/)
  } finally {
    await rm(managedRoot, { recursive: true, force: true })
  }
})
