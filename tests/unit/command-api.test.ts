import { test } from "bun:test"
import assert from "node:assert/strict"

import termPackage from "../../packages/term/package.json"
import { runCommand, runTuiCommand, type RunTuiCommandOptions } from "../../packages/term/src/command"

function createBufferedIO(): { stdout: string; stderr: string; io: NonNullable<RunTuiCommandOptions["io"]> } {
  const buffer = { stdout: "", stderr: "" }

  return {
    ...buffer,
    io: {
      stdout: { write: (chunk: string) => { buffer.stdout += chunk } },
      stderr: { write: (chunk: string) => { buffer.stderr += chunk } },
    },
    get stdout() {
      return buffer.stdout
    },
    get stderr() {
      return buffer.stderr
    },
  }
}

test("bluenote-term package metadata exposes the reusable command API", () => {
  assert.deepEqual(termPackage.exports["."], {
    types: "./src/command.ts",
    import: "./src/command.ts",
  })
  assert.deepEqual(termPackage.exports["./command"], {
    types: "./src/command.ts",
    import: "./src/command.ts",
  })
})

test("runCommand exposes the full reusable terminal command API", async () => {
  const bufferedIO = createBufferedIO()

  const exitCode = await runCommand(["--version"], {
    io: bufferedIO.io,
    version: "9.8.7-test",
  })

  assert.equal(exitCode, 0)
  assert.equal(bufferedIO.stdout, "9.8.7-test\n")
  assert.equal(bufferedIO.stderr, "")
})

test("runTuiCommand launches the TUI provider for distribution callers", async () => {
  const bufferedIO = createBufferedIO()
  let calls = 0

  const exitCode = await runTuiCommand([], {
    io: bufferedIO.io,
    tuiRunner: async () => {
      calls += 1

      return {
        exitCode: 1,
        stdout: "tui stdout\n",
        stderr: "tui stderr\n",
      }
    },
  })

  assert.equal(calls, 1)
  assert.equal(exitCode, 1)
  assert.equal(bufferedIO.stdout, "tui stdout\n")
  assert.equal(bufferedIO.stderr, "tui stderr\n")
})

test("runCommand preserves the existing bin tui subcommand path", async () => {
  const bufferedIO = createBufferedIO()
  let calls = 0

  const exitCode = await runCommand(["tui"], {
    io: bufferedIO.io,
    tuiRunner: async () => {
      calls += 1

      return {
        exitCode: 0,
        stdout: "bin tui stdout\n",
        stderr: "",
      }
    },
  })

  assert.equal(calls, 1)
  assert.equal(exitCode, 0)
  assert.equal(bufferedIO.stdout, "bin tui stdout\n")
  assert.equal(bufferedIO.stderr, "")
})
