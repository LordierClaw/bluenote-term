import { test } from "bun:test"
import assert from "node:assert/strict"

import { EditorLaunchError } from "../../../src/core/errors"
import { launchEditor, parseEditorCommand, resolveEditorCommand } from "../../../src/platform/editor"

test("resolveEditorCommand returns the configured $EDITOR value", () => {
  assert.equal(resolveEditorCommand({ EDITOR: "/tmp/fake-editor" }), "/tmp/fake-editor")
})

test("resolveEditorCommand raises EditorLaunchError when $EDITOR is missing", () => {
  assert.throws(
    () => resolveEditorCommand({}),
    (error) => {
      assert.ok(error instanceof EditorLaunchError)
      assert.match(error.message, /EDITOR is not set/)
      return true
    },
  )
})

test("parseEditorCommand supports editor commands with quoted arguments", () => {
  assert.deepEqual(parseEditorCommand('bun "/tmp/fake editor.ts" --flag'), ["bun", "/tmp/fake editor.ts", "--flag"])
})

test("launchEditor invokes the launcher with the resolved editor command and note path", () => {
  const calls: string[][] = []

  launchEditor("/tmp/note.md", {
    env: { EDITOR: "/tmp/fake-editor" },
    launcher(command: string[]) {
      calls.push(command)
      return { exitCode: 0 }
    },
  })

  assert.deepEqual(calls, [["/tmp/fake-editor", "/tmp/note.md"]])
})
