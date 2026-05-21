import test from "node:test"
import assert from "node:assert/strict"

import {
  AmbiguousSelectorError,
  InvalidFrontmatterError,
  RootNotInitializedError,
  UsageError,
} from "../../../src/core/errors"
import { formatCliError, runCli } from "../../../src/cli/entry"

test("CLI formatter maps validation/data errors to exit code 2", () => {
  const validationResult = formatCliError(new InvalidFrontmatterError("Invalid note schema"))
  const selectorResult = formatCliError(new AmbiguousSelectorError("Selector matched multiple notes"))

  assert.deepEqual(validationResult, {
    exitCode: 2,
    stdout: "",
    stderr: "Invalid note schema\n",
  })
  assert.deepEqual(selectorResult, {
    exitCode: 2,
    stdout: "",
    stderr: "Selector matched multiple notes\n",
  })
})

test("CLI formatter maps usage/operational errors to exit code 1", () => {
  const usageResult = formatCliError(new UsageError("Unknown command"))
  const operationalResult = formatCliError(
    new RootNotInitializedError("BlueNote root is not initialized.", {
      hint: "Run 'bn init' first.",
    }),
  )

  assert.deepEqual(usageResult, {
    exitCode: 1,
    stdout: "",
    stderr: "Unknown command\n",
  })
  assert.deepEqual(operationalResult, {
    exitCode: 1,
    stdout: "",
    stderr: "BlueNote root is not initialized.\nHint: Run 'bn init' first.\n",
  })
})

test("runCli routes AppError failures through the shared formatter", () => {
  const originalRoot = process.env.BLUENOTE_ROOT
  process.env.BLUENOTE_ROOT = ""

  try {
    const result = runCli(["init"], "0.1.0")

    assert.deepEqual(result, {
      exitCode: 1,
      stdout: "",
      stderr: "BLUENOTE_ROOT must not be empty.\n",
    })
  } finally {
    if (originalRoot === undefined) {
      delete process.env.BLUENOTE_ROOT
    } else {
      process.env.BLUENOTE_ROOT = originalRoot
    }
  }
})
