import { test } from "bun:test"
import assert from "node:assert/strict"
import path from "node:path"
import { readFile } from "node:fs/promises"

import { assertManagedRootLayout, createManagedRootHarness, runCli } from "../helpers/cli"

const workspaceRoot = path.resolve(import.meta.dir, "../..")
const packageJsonPath = path.join(workspaceRoot, "package.json")

test("bn --help prints the visible command surface without removed command or release-stage wording", () => {
  const result = runCli(["--help"])

  assert.equal(result.exitCode, 0)
  assert.equal(result.stderr.toString(), "")

  const output = result.stdout.toString()
  for (const command of ["init", "new", "list", "show", "search", "edit", "archive", "delete", "rebuild", "migrate", "tui"]) {
    assert.match(output, new RegExp(`(^|\\n)  ${command}(\\s|$)`, "m"))
  }

  assert.match(output, /tui\s+Launch the terminal UI workspace/)
  assert.doesNotMatch(output, new RegExp("completion|Pha" + "se\\s+[0-9]", "i"))
})

test("project verification commands cover CLI plus import-only OpenTUI checks", async () => {
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
    scripts?: Record<string, string>
  }
  assert.equal(packageJson.scripts?.lint, "biome lint --diagnostic-level=error .")
  assert.equal(packageJson.scripts?.["smoke:cli"], "bun run ./scripts/smoke-cli.ts")
  assert.equal(packageJson.scripts?.["smoke:opentui"], "bun run ./scripts/smoke-opentui.ts")
  assert.match(packageJson.scripts?.check ?? "", /bun run lint/)
  assert.doesNotMatch(packageJson.scripts?.check ?? "", /smoke:opentui:interactive|qa:visual:tui/)
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
