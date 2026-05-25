import { test } from "bun:test"
import assert from "node:assert/strict"
import path from "node:path"
import { readFile } from "node:fs/promises"

import { assertManagedRootLayout, createManagedRootHarness, runCli } from "../helpers/cli"

const workspaceRoot = path.resolve(import.meta.dir, "../..")
const packageJsonPath = path.join(workspaceRoot, "package.json")

test("bn --help prints the Phase 2 command surface plus the Phase 3 tui entrypoint", () => {
  const result = runCli(["--help"])

  assert.equal(result.exitCode, 0)
  assert.equal(result.stderr.toString(), "")

  const output = result.stdout.toString()
  for (const command of ["init", "new", "list", "show", "search", "edit", "archive", "delete", "rebuild", "migrate", "completion"]) {
    assert.match(output, new RegExp(`(^|\\n)  ${command}(\\s|$)`, "m"))
  }

  assert.match(output, /(^|\n)  tui(\s|$)/m)
  assert.match(output, /tui\s+Launch the Phase 3 terminal shell \(shows a friendly startup state when no root exists\)/)
})

test("package.json smoke:cli runs the dedicated smoke script", async () => {
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
    scripts?: Record<string, string>
  }

  assert.equal(packageJson.scripts?.["smoke:cli"], "bun run ./scripts/smoke-cli.ts")
})

test("smoke-cli script exercises --help and init against a temporary root", async () => {
  const harness = await createManagedRootHarness("bluenote-smoke-cli-")

  try {
    const result = harness.runScript("scripts/smoke-cli.ts")

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.match(result.stdout, /CLI smoke check passed\./)

    await assertManagedRootLayout(harness.rootPath)
  } finally {
    await harness.cleanup()
  }
})
