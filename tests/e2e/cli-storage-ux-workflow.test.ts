import { test } from "bun:test"
import assert from "node:assert/strict"

import termPackage from "../../packages/term/package.json"
import { createManagedRootHarness } from "../helpers/cli"
import { escapeRegExp } from "../helpers/regexp"

test("real bin/bn.ts entrypoint keeps the full CLI surface for release artifacts", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-storage-ux-e2e-")

  try {
    const helpResult = harness.runBin(["--help"])
    assert.equal(helpResult.exitCode, 0)
    assert.equal(helpResult.stderr, "")
    assert.match(helpResult.stdout, new RegExp(`BlueNote v${escapeRegExp(termPackage.version)}`))
    assert.match(helpResult.stdout, /Usage:/)
    assert.match(helpResult.stdout, /bn <command> \[options\]/)
    assert.match(helpResult.stdout, /init\s+Initialize the managed BlueNote root/)
    assert.match(helpResult.stdout, /new\s+\[--title <title>\] \[--path note\/<folder>\] \[--clipboard\] <body>/)

    const initResult = harness.runBin(["init"])
    assert.equal(initResult.exitCode, 0)
    assert.equal(initResult.stderr, "")
    assert.match(initResult.stdout, /Initialized BlueNote root:/)

    const newResult = harness.runBin(["new", "Portable release body"])
    assert.equal(newResult.exitCode, 0)
    assert.equal(newResult.stderr, "")
    assert.match(newResult.stdout, /^Created note\nKey: .+\nPath: draft\/.+\.md\n$/)
  } finally {
    await harness.cleanup()
  }
}, 90_000)
