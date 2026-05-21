import test from "node:test"
import assert from "node:assert/strict"

import {
  AmbiguousSelectorError,
  InvalidFrontmatterError,
  RootNotInitializedError,
  UsageError,
} from "../../../src/core/errors"
import { formatCliError } from "../../../src/cli/entry"

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
