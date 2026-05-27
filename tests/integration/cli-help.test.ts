import { test } from "bun:test"
import assert from "node:assert/strict"
import path from "node:path"
import { readFile } from "node:fs/promises"

import { assertManagedRootLayout, createManagedRootHarness, runCli } from "../helpers/cli"

const workspaceRoot = path.resolve(import.meta.dir, "../..")
const packageJsonPath = path.join(workspaceRoot, "package.json")
const agentGuidePath = path.join(workspaceRoot, "AGENTS.md")
const developmentWorkflowPath = path.join(workspaceRoot, "docs/workflow/development-workflow.md")
const interactiveSmokePath = path.join(workspaceRoot, "scripts/smoke-opentui-interactive.ts")

test("bn --help prints the visible Phase 2 command surface and Phase 3 TUI launch command", () => {
  const result = runCli(["--help"])

  assert.equal(result.exitCode, 0)
  assert.equal(result.stderr.toString(), "")

  const output = result.stdout.toString()
  for (const command of ["init", "new", "list", "show", "search", "edit", "archive", "delete", "rebuild", "migrate", "completion", "tui"]) {
    assert.match(output, new RegExp(`(^|\\n)  ${command}(\\s|$)`, "m"))
  }

  assert.match(output, /tui\s+Launch the Phase 3 TUI workspace/)
})

test("project verification commands cover CLI plus import-only and interactive OpenTUI checks", async () => {
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
    scripts?: Record<string, string>
  }
  const agentGuide = await readFile(agentGuidePath, "utf8")
  const developmentWorkflow = await readFile(developmentWorkflowPath, "utf8")

  assert.equal(packageJson.scripts?.["smoke:cli"], "bun run ./scripts/smoke-cli.ts")
  assert.equal(packageJson.scripts?.["smoke:opentui"], "bun run ./scripts/smoke-opentui.ts")
  assert.equal(packageJson.scripts?.["smoke:opentui:interactive"], "bun run ./scripts/smoke-opentui-interactive.ts")
  assert.match(packageJson.scripts?.check ?? "", /bun run smoke:opentui:interactive/)
  assert.match(agentGuide, /Run `bun run smoke:opentui:interactive`/)
  assert.match(developmentWorkflow, /^bun run smoke:opentui:interactive$/m)
})

test("interactive OpenTUI smoke covers live manager create and delete flows", async () => {
  const smokeScript = await readFile(interactiveSmokePath, "utf8")

  assert.match(smokeScript, /expectPaneExcludes\(managerPane, "BlueNote"/)
  assert.match(smokeScript, /Live Smoke Manager Note/)
  assert.match(smokeScript, /manager create opens editor/)
  assert.match(smokeScript, /manager delete confirmation/)
  assert.match(smokeScript, /manager delete cancellation/)
  assert.match(smokeScript, /expectNoteArtifactsDeleted/)
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
