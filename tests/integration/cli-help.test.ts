import { test } from "bun:test"
import assert from "node:assert/strict"
import path from "node:path"
import { readFile } from "node:fs/promises"

import { createManagedRootHarness, runBinCli } from "../helpers/cli"

const workspaceRoot = path.resolve(import.meta.dir, "../..")
const packageJsonPath = path.join(workspaceRoot, "package.json")
const readWorkspaceFile = (relativePath: string) => readFile(path.join(workspaceRoot, relativePath), "utf8")

test("bn --help prints the full CLI surface", () => {
  const result = runBinCli(["--help"])

  assert.equal(result.exitCode, 0)
  assert.equal(result.stderr.toString(), "")

  const output = result.stdout.toString()
  assert.match(output, /BlueNote v0\.1\.0/)
  assert.match(output, /Usage:/)
  assert.match(output, /bn <command> \[options\]/)

  for (const command of ["init", "new", "list", "show", "search", "edit", "archive", "delete", "rebuild", "tui", "ai"]) {
    assert.match(output, new RegExp(`(^|\\n)\\s*${command}(\\s|$)`, "m"))
  }
  assert.doesNotMatch(output, /(^|\n)\s*migrate(\s|$)/m)
})

test("bn ai help and config commands describe opt-in provider behavior without network calls", async () => {
  const harness = await createManagedRootHarness("bluenote-ai-help-")

  try {
    const helpResult = harness.run(["ai", "--help"])
    assert.equal(helpResult.exitCode, 0)
    assert.equal(helpResult.stderr, "")
    assert.match(helpResult.stdout, /Usage:\n  bn ai <command> \[options\]/)
    assert.match(helpResult.stdout, /config set\s+\[--provider openai-compatible\] --base-url <url> --api-key <key> --model <model>/)
    assert.match(helpResult.stdout, /config set\s+--provider codex --model <model>/)
    assert.match(helpResult.stdout, /codex auth login\s+Authenticate Codex with device-code OAuth/)
    assert.match(helpResult.stdout, /codex auth status\s+Show Codex auth status without secrets/)
    assert.match(helpResult.stdout, /codex auth logout\s+Remove stored Codex auth while keeping AI config/)
    assert.doesNotMatch(helpResult.stdout, /Codex generation is intentionally setup-required|auth setup required|safe placeholder/i)
    assert.match(helpResult.stdout, /describe\s+<key\|path>\s+Generate and automatically apply a note description/)
    assert.match(helpResult.stdout, /process-queue\s+\[--limit <n>\]\s+Process queued description refreshes/)

    const queueResult = harness.run(["ai", "queue"])
    assert.equal(queueResult.exitCode, 0)
    assert.equal(queueResult.stderr, "")
    assert.equal(queueResult.stdout, "Pending AI jobs: 0\n")

    const configResult = harness.run(["ai", "config", "show"])
    assert.equal(configResult.exitCode, 1)
    assert.equal(configResult.stdout, "")
    assert.match(configResult.stderr, /AI is not configured\./)
    assert.match(configResult.stderr, /Run bn ai config set --base-url <url> --api-key <key> --model <model>\./)
    assert.match(configResult.stderr, /For Codex, run bn ai config set --provider codex --model <model>\./)
  } finally {
    await harness.cleanup()
  }
}, 15_000)

test("current docs document the Phase 6 opt-in AI description workflow", async () => {
  const [readme, overview, rootLayout, noteFormat, runtime, designLanguage, phaseDoc, consolidatedPlan] = await Promise.all([
    readWorkspaceFile("README.md"),
    readWorkspaceFile("docs/product/overview.md"),
    readWorkspaceFile("docs/architecture/managed-root-layout.md"),
    readWorkspaceFile("docs/architecture/note-format-and-indexing.md"),
    readWorkspaceFile("docs/architecture/runtime-and-dependencies.md"),
    readWorkspaceFile("docs/product/design-language.md"),
    readWorkspaceFile("docs/phases/phase-6-ai-suggestion.md"),
    readWorkspaceFile("docs/plans/2026-06-05-phase-6-ai-suggestion-consolidated-plan.md"),
  ])

  assert.match(readme, /`bluenote ai config set --base-url <url> --api-key <key> --model <model>`/)
  assert.match(readme, /`bluenote ai config set --provider codex --model <model>`/)
  assert.match(readme, /`bluenote ai codex auth login`/)
  assert.match(readme, /`bluenote ai codex auth status`/)
  assert.match(readme, /`bluenote ai codex auth logout`/)
  assert.match(readme, /`bluenote ai describe <key\|path>`/)
  assert.match(readme, /`bluenote ai queue`/)
  assert.match(readme, /`bluenote ai process-queue \[--limit <n>\]`/)
  assert.match(readme, /API key is stored in plaintext under `\.data\/ai\/config\.json`/)
  assert.match(readme, /Codex auth state is stored root-locally at `\.data\/ai\/codex-auth\.json` and is sensitive app state/)
  assert.match(readme, /Core CLI, storage, search, and TUI workflows continue to work offline/)
  assert.match(readme, /After note changes, BlueNote records cheap local queue updates under `\.data\/ai\/queue\.json`; normal create\/edit\/autosave paths do not perform network calls/)
  assert.match(readme, /Manual save and autosave never call the configured provider API/)
  assert.match(readme, /All TUI AI work runs in the background/)
  assert.match(readme, /do not block startup, rendering, typing, editing, navigation, note switching, saves, autosave, or quit/)
  assert.match(readme, /The TUI never starts `bluenote ai codex auth login` automatically/)
  assert.match(readme, /CLI AI commands such as `bluenote ai describe` and `bluenote ai process-queue` remain foreground command executions/)
  assert.match(readme, /OpenAI-compatible API-key providers remain supported/)
  assert.match(readme, /Codex provider now supports root-local `bluenote ai codex auth login`, `bluenote ai codex auth status`, and `bluenote ai codex auth logout`/)
  assert.doesNotMatch(readme, /Codex generation is intentionally setup-required|auth\/manual validation are separate setup steps|prepared for later manual setup|Show Codex auth setup status without running real auth/)
  assert.match(readme, /Pending AI work is durable in `\.data\/ai\/queue\.json` and is recovered on TUI startup/)
  assert.match(readme, /Freshness is tracked with `ai\.description\.lastProcessedAt` timestamp metadata in the note sidecar/)
  assert.match(readme, /Generated descriptions must be one short sentence under 10 words/)
  assert.match(readme, /10-second editor idle timer/)
  assert.match(readme, /5-second manager idle timer/)
  assert.match(readme, /Normal note-management and foreground AI CLI commands now live in the distribution CLI/)
  assert.match(readme, /`bluenote new`/)
  assert.match(readme, /`bluenote list`/)
  assert.match(readme, /`bluenote ai queue`/)
  assert.match(readme, /`bluenote ai process-queue`/)
  assert.doesNotMatch(readme, /--content <text>/)
  assert.doesNotMatch(readme, /bun run \.\/bin\/bn\.ts (init|new|list|search|show|edit|archive|delete|rebuild|ai)/)
  assert.doesNotMatch(readme, /`new \[--title <title>\] \[--path note\/<folder>\] \[--clipboard\] <body>`/)
  assert.doesNotMatch(readme, /`show \[--drafts\|--all\] <key\|path>`/)
  assert.doesNotMatch(readme, /`edit \[--drafts\|--all\] <key\|path>`/)
  assert.match(readme, /`Ctrl\+PageDown` and `Ctrl\+PageUp` switch to the next or previous note in the same folder/)
  assert.match(readme, /shows a temporary blue index label such as `03\/10` before the title/)

  assert.match(rootLayout, /note\/\s+# normal user notes/)
  assert.match(rootLayout, /draft\/\s+# draft notes/)
  assert.match(rootLayout, /`\.data\/archive\/` stores archived note files/)
  assert.doesNotMatch(rootLayout, /^├── notes\/|^├── scratches\/|^├── templates\/|^│   ├── inbox\/|^│   ├── journal\//m)
  assert.match(rootLayout, /\.data\/ai\//)
  assert.match(rootLayout, /config\.json/)
  assert.match(rootLayout, /prompts\//)
  assert.match(rootLayout, /describe-note\.md/)
  assert.match(rootLayout, /queue\.json/)
  assert.match(rootLayout, /codex-auth\.json\s+# sensitive root-local Codex auth state/)
  assert.match(rootLayout, /`\.data\/ai\/codex-auth\.json` is sensitive root-local app state/)
  assert.match(rootLayout, /TUI also schedules idle\/background processing/)
  assert.match(rootLayout, /auth\/setup checks do not block startup/)
  assert.match(rootLayout, /pending AI work is durable and recovered on TUI startup/)
  assert.match(rootLayout, /ai\.description\.lastProcessedAt/)
  assert.match(noteFormat, /AI-generated descriptions are automatically written to `\.data\/notes\/<key>\.json`/)
  assert.match(noteFormat, /"type": "normal"/)
  assert.match(noteFormat, /"relativePath": "note\/example-title-51u7i0\.md"/)
  assert.match(noteFormat, /legacy frontmatter and the old `notes\/` tree are not part of the Phase 7 storage contract/)
  assert.doesNotMatch(noteFormat, /notes\/inbox/)
  assert.doesNotMatch(await readWorkspaceFile("src/tui/render-search-everything.ts"), /notes\/inbox/)
  assert.match(noteFormat, /OpenAI-compatible provider keys in `\.data\/ai\/config\.json` are plaintext/)
  assert.match(noteFormat, /Codex provider auth state lives at `\.data\/ai\/codex-auth\.json` and is sensitive root-local app state/)
  assert.match(noteFormat, /TUI also schedules idle\/background processing/)
  assert.match(noteFormat, /All TUI AI provider work remains background\/non-blocking/)
  assert.match(noteFormat, /TUI startup recovers pending stale-description work/)
  assert.match(noteFormat, /timestamp-only freshness metadata at `ai\.description\.lastProcessedAt`/)
  assert.match(noteFormat, /one short sentence under 10 words/)
  assert.doesNotMatch(noteFormat, /Users manually run `bn ai describe <key\|path>` for one note or `bn ai process-queue \[--limit <n>\]` for pending jobs/)
  assert.doesNotMatch(noteFormat, /experimental Codex provider config|real auth setup is performed separately/)
  assert.doesNotMatch(noteFormat, /migration compatibility, not canonical storage|Legacy `\.state\/` directories are used only as migration input/)

  assert.doesNotMatch(overview, /AI processing or model calls\n/)
  assert.doesNotMatch(overview, /automatic AI daemon\/autostart processing/)
  assert.match(overview, /Phase 6 adds opt-in AI description generation/)
  assert.match(overview, /OpenAI-compatible API-key providers remain supported/)
  assert.match(overview, /AI requires a configured provider and network access/)
  assert.match(overview, /save and autosave paths never call the provider API/)
  assert.match(overview, /all TUI AI work is non-blocking/)
  assert.match(overview, /Codex provider now has root-local `bn ai codex auth login`, `bn ai codex auth status`, and `bn ai codex auth logout`/)
  assert.match(overview, /The TUI never starts Codex login automatically/)
  assert.match(overview, /`\.data\/ai\/codex-auth\.json` is sensitive root-local app state/)
  assert.doesNotMatch(overview, /setup-required provider\/auth seam|Codex auth\/API use is setup-required|real Codex device-auth\/API transport before manual setup/)
  assert.match(overview, /On TUI startup, BlueNote scans sidecar `updatedAt` against `ai\.description\.lastProcessedAt`/)
  assert.match(overview, /timestamp-only sidecar freshness metadata/)
  assert.match(overview, /Generated descriptions are one short sentence under 10 words/)
  assert.match(overview, /plain Markdown normal note files under `note\/` and drafts under `draft\/`/)
  assert.match(overview, /Phase 7 fresh-root storage with no legacy `notes\/` tree migration path/)
  assert.match(overview, /CLI flows for `init`, `new`, `list`, `show`, `search`, `edit`, `archive`, `delete`, `rebuild`, and `tui`/)
  assert.match(overview, /Normal notes remain plain Markdown under `note\/`, drafts remain plain Markdown under `draft\/`, and archived note bodies move to hidden `\.data\/archive\/` storage/)
  assert.doesNotMatch(overview, /plain Markdown note files under `notes\/`|Notes remain plain Markdown under `notes\/`|CLI flows for .*`migrate`/)
  assert.match(designLanguage, /note\/inbox\/visual-polish\.md/)
  assert.doesNotMatch(designLanguage, /notes\/inbox\/visual-polish\.md/)

  assert.match(runtime, /Manual save and autosave never call the configured provider API/)
  assert.match(runtime, /AI processing runs in idle background tasks/)
  assert.match(runtime, /does not block startup, rendering, editor input, navigation, note switching, save\/autosave, status refreshes, or quit/)
  assert.match(runtime, /Provider selection is abstracted behind the AI client factory/)
  assert.match(runtime, /OpenAI-compatible API-key providers remain supported/)
  assert.match(runtime, /Codex provider uses root-local auth state and CLI-managed `bn ai codex auth login\/status\/logout` commands/)
  assert.match(runtime, /TUI status and background work never start Codex login automatically/)
  assert.match(runtime, /10-second editor idle timer/)
  assert.match(runtime, /5-second manager idle timer/)
  assert.match(runtime, /queue processing starts as soon as possible without blocking input/)
  assert.doesNotMatch(runtime, /setup-required provider\/auth seam before real manual auth validation/)

  assert.match(consolidatedPlan, /Manual QA artifacts belong in ignored `\.tmp\/` locations and must not commit secrets/)
  assert.match(consolidatedPlan, /Do not commit secrets, auth caches, device codes, API keys, bearer tokens, JWT-like strings/)
  assert.match(consolidatedPlan, /Codex auth follows stable official\/OpenAI\/Codex contracts where practical/)
  assert.match(consolidatedPlan, /If a required real Codex generation\/auth contract cannot be verified from official\/stable sources, stop and document the blocker/)
  assert.match(consolidatedPlan, /OpenAI-compatible API-key provider remains supported/)
  assert.match(consolidatedPlan, /TUI startup, rendering, input, typing, navigation, note switching, Manager opening, save, autosave, quit, and dispose do not await provider calls/)

  assert.match(phaseDoc, /Phase 6 — AI Suggestion/)
  assert.match(phaseDoc, /plaintext/)
  assert.match(phaseDoc, /automatic description updates/)
  assert.match(phaseDoc, /one short sentence under 10 words/)
  assert.match(phaseDoc, /10-second editor idle timer/)
  assert.match(phaseDoc, /5-second manager idle timer/)
  assert.doesNotMatch(phaseDoc, /3-second idle timer/)
  assert.doesNotMatch(phaseDoc, /10-second idle period/)
  assert.match(phaseDoc, /CLI AI commands such as `bn ai describe` and `bn ai process-queue` remain foreground command executions/)
  assert.match(phaseDoc, /Pending AI work is durable in `\.data\/ai\/queue\.json`/)
  assert.match(phaseDoc, /TUI startup recovery scans sidecar `updatedAt` against `ai\.description\.lastProcessedAt`/)
})

test("release workflow publishes the packages/term npm package from a published GitHub Release", async () => {
  const [releaseWorkflow, termPackageText] = await Promise.all([
    readWorkspaceFile(".github/workflows/release.yml"),
    readWorkspaceFile("packages/term/package.json"),
  ])
  const termPackage = JSON.parse(termPackageText) as {
    version: string
    dependencies: Record<string, string>
  }
  const releaseTag = `v${termPackage.version}`

  assert.match(releaseWorkflow, /release:\s*\n\s*types:\s*\[published\]/)
  assert.match(releaseWorkflow, /working-directory:\s*packages\/term/)
  assert.match(releaseWorkflow, /npm pack --dry-run --json/)
  assert.match(releaseWorkflow, /npm publish --access public/)
  assert.match(releaseWorkflow, /bun run package:release/)
  assert.match(releaseWorkflow, /gh release upload .*linux-x64\.tar\.gz --clobber/)
  assert.match(releaseWorkflow, /gh release upload .*windows-x64\.zip --clobber/)
  assert.match(releaseWorkflow, /build-release-linux/)
  assert.match(releaseWorkflow, /build-release-windows/)
  assert.match(releaseWorkflow, /needs:\s*[\r\n\s-]*verify[\r\n\s-]*build-release-linux[\r\n\s-]*build-release-windows/)
  assert.match(releaseWorkflow, /permissions:\s*\n\s*actions:\s*read\s*\n\s*contents:\s*write\s*\n\s*id-token:\s*write/)
  assert.match(releaseWorkflow, /require\('\.\/packages\/term\/package\.json'\)\.version/)
  assert.match(releaseWorkflow, /RELEASE_TAG=\"v\$\{PACKAGE_VERSION\}\"/)
  assert.match(releaseWorkflow, /Release tag \$\{RELEASE_TAG_NAME\} does not match packages\/term\/package\.json version/)
  assert.match(releaseWorkflow, /Require successful push CI workflow for release commit/)
  assert.match(releaseWorkflow, /REQUIRED_WORKFLOW_NAME:\s*CI/)
  assert.match(releaseWorkflow, /if: github\.event_name == 'release' && github\.event\.action == 'published'/)
  assert.equal(termPackage.dependencies["@lordierclaw/bluenote-core"], "latest")
})

test("package version matches the current release asset version", async () => {
  const packageJson = JSON.parse(await readWorkspaceFile("packages/term/package.json")) as {
    version?: string
  }
  const releaseDocs = await readWorkspaceFile("docs/workflow/releases.md")

  assert.match(packageJson.version ?? "", /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/)
  assert.match(releaseDocs, /bluenote-v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?-windows-x64\.zip/)
  assert.match(releaseDocs, /bluenote-v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?-linux-x64\.tar\.gz/)
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

test("bin still runs the legacy full CLI note commands used by local release builds", async () => {
  const harness = await createManagedRootHarness("bluenote-smoke-cli-")

  try {
    const initResult = harness.runBin(["init"])
    assert.equal(initResult.exitCode, 0)
    assert.equal(initResult.stderr, "")
    assert.match(initResult.stdout, /Initialized BlueNote root:/)

    const result = harness.runBin(["new", "Release build note body"])
    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.match(result.stdout, /^Created note\nKey: .+\nPath: draft\/.+\.md\n$/)
  } finally {
    await harness.cleanup()
  }
}, 45_000)
