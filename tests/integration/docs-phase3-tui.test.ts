import { test } from "bun:test"
import assert from "node:assert/strict"
import path from "node:path"
import { readFile } from "node:fs/promises"

const workspaceRoot = path.resolve(import.meta.dir, "../..")

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(workspaceRoot, relativePath), "utf8")
}

function assertRefinedTuiBehavior(content: string): void {
  assert.match(content, /two-column/i)
  assert.match(content, /browser/i)
  assert.match(content, /preview/i)
  assert.match(content, /right|→/i)
  assert.match(content, /left|←/i)
  assert.match(content, /open/i)
  assert.match(content, /back/i)
  assert.match(content, /Ctrl\+F/i)
  assert.match(content, /find/i)
  assert.match(content, /750\s*ms/i)
  assert.match(content, /autosave/i)
  assert.match(content, /single-input|single input|one input/i)
  assert.match(content, /result-list|result list/i)
  assert.match(content, /Escape/i)
  assert.match(content, /Ctrl\+\[/i)
  assert.match(content, /restrained blue|blue palette|blue theme/i)
  assert.match(content, /focus/i)
  assert.match(content, /muted/i)
  assert.doesNotMatch(content, /warning\/success|success states|semantic colors|semantic colour/i)
  assert.match(content, /chrome/i)
  assert.match(content, /typing|input regression|editor input/i)
  assert.match(content, /\bn\b.*new|new.*\bn\b|create note/i)
  assert.match(content, /\bd\b.*delete|delete.*\bd\b/i)
  assert.match(content, /confirm|confirmation/i)
  assert.match(content, /plain Markdown/i)
  assert.match(content, /without required frontmatter|no .*frontmatter|do not gain frontmatter/i)
}

function assertMinimalManagerChrome(content: string): void {
  assert.match(content, /minimal manager|minimal .*Manager|Manager .*minimal/i)
  assert.match(content, /current folder|folder panel|folder path/i)
  assert.match(content, /preview context|preview/i)
  assert.doesNotMatch(content, /Manager[^\n.]*topbar[^\n.]*(?:current path|current folder path|focused item|selected item|hovered path)/i)
  assert.match(content, /short action hints|compact .*hints|minimal .*hints/i)
  assert.doesNotMatch(content, /BlueNote Manager|BlueNote TUI|branded title screen|decorative title/i)
}

function assertDeliveredPhase4BEditorBehavior(content: string): void {
  assert.match(content, /real editor body input|inline body editing|live typing/i)
  assert.match(content, /visible cursor|cursor marker|cursor/i)
  assert.match(content, /Ctrl\+S save|explicit save|save status/i)
  assert.match(content, /autosave status|autosave/i)
  assert.match(content, /Alt\+Z wrap|wrap toggle|wrap mode/i)
  assert.match(content, /responsive bottom bar|responsive .*status|bottom bar.*responsive/i)
  assert.match(content, /Line .*Col|cursor position|line\/column/i)
}

function assertPhase4BNotAdvertisedIncomplete(content: string): void {
  assert.doesNotMatch(content, /Phase 4B[^\n.]*continues|continues with Phase 4B|Phase 4B[^\n.]*follow-on/i)
  assert.doesNotMatch(content, /Phase 4B[^\n.]*incomplete|incomplete[^\n.]*Phase 4B/i)
  assert.doesNotMatch(content, /Phase 4B[^\n.]*upcoming|upcoming[^\n.]*Phase 4B/i)
}

function assertDeliveredPhase4CManagerBehavior(content: string): void {
  assert.match(content, /Phase 4C[^\n.]*Manager performance\/responsive layout\/style|Phase 4C[^\n.]*Manager performance, responsive layout, and style/i)
  assert.match(content, /accepted|delivered|complete/i)
  assert.match(content, /preview[^\n.]*auto-hide|auto-hide[^\n.]*preview|hide preview automatically/i)
  assert.match(content, /manual[^\n.]*preview[^\n.]*toggle|preview[^\n.]*manual[^\n.]*toggle|toggle preview manually/i)
  assertMinimalManagerChrome(content)
}

function assertPhase4CNotAdvertisedUpcoming(content: string): void {
  assert.doesNotMatch(content, /Phase 4C[^\n.]*upcoming|upcoming[^\n.]*Phase 4C/i)
  assert.doesNotMatch(content, /Phase 4C[^\n.]*remain[s]? upcoming|remain[s]? upcoming[^\n.]*Phase 4C/i)
  assert.doesNotMatch(content, /roadmap continues with Phase 4C|continues with Phase 4C/i)
}

function assertDeliveredPhase4DSearchEverythingBehavior(content: string): void {
  assert.match(content, /Phase 4D[^\n.]*Search Everything[^\n.]*readability|Phase 4D[^\n.]*Search Everything[^\n.]*responsive/i)
  assert.match(content, /accepted|delivered|complete/i)
  assert.match(content, /contains-style|contains style/i)
  assert.match(content, /readable[^\n.]*typed[^\n.]*results|typed[^\n.]*results[^\n.]*readable/i)
  assert.match(content, /separated?[^\n.]*preview[^\n.]*sections|preview[^\n.]*sections[^\n.]*separated?/i)
  assert.match(content, /responsive[^\n.]*preview[^\n.]*auto-hide|preview[^\n.]*auto-hide[^\n.]*responsive|hide preview automatically/i)
  assert.match(content, /Alt\+P[^\n.]*preview[^\n.]*toggle|preview[^\n.]*toggle[^\n.]*Alt\+P/i)
  assert.match(content, /safe[^\n.]*unavailable[^\n.]*command[^\n.]*status|command[^\n.]*safe[^\n.]*unavailable[^\n.]*status/i)
}

function assertPhase4DNotAdvertisedUpcoming(content: string): void {
  assert.doesNotMatch(content, /Phase 4D[^\n.]*upcoming|upcoming[^\n.]*Phase 4D/i)
  assert.doesNotMatch(content, /Phase 4D[^\n.]*next after 4C|after 4C[^\n.]*Phase 4D|next[^\n.]*Phase 4D/i)
  assert.doesNotMatch(content, /does not promise[^\n.]*Phase 4D[^\n.]*implemented/i)
}

function assertNeutralNextPhaseMarker(content: string): void {
  assert.match(content, /phase-4-next-hardening-subplan/i)
  assert.match(content, /scratch[^\n.]*archive[^\n.]*future hardening|scratch[^\n.]*archive[^\n.]*not yet planned/i)
}

function assertDeliveredPhase4ESaveContract(content: string): void {
  assert.match(content, /Phase 4E[^\n.]*autosave[^\n.]*atomicity|Phase 4E[^\n.]*save[^\n.]*atomicity|Phase 4E[^\n.]*safe note-body/i)
  assert.match(content, /accepted|delivered|complete/i)
  assert.match(content, /autosave[^\n.]*manual[^\n.]*Ctrl\+S[^\n.]*same[^\n.]*safe note-body write path|manual[^\n.]*Ctrl\+S[^\n.]*autosave[^\n.]*same[^\n.]*safe note-body write path/i)
  assert.match(content, /failed saves?[^\n.]*keep[^\n.]*buffer dirty|buffer dirty[^\n.]*retry later/i)
  assert.match(content, /retry later|retry on the next autosave or manual save/i)
  assert.match(content, /no recovery-copy workflow|does not create recovery copies|no recovery copies/i)
  assert.match(content, /stale temp files?[^\n.]*BlueNote-owned[^\n.]*internal implementation detail|BlueNote-owned[^\n.]*stale temp files?[^\n.]*internal/i)
}

function assertPhase4ENotAdvertisedUpcoming(content: string): void {
  assert.doesNotMatch(content, /4E[^\n.]*not yet planned|not yet planned[^\n.]*4E/i)
  assert.doesNotMatch(content, /Phase 4E[^\n.]*upcoming|upcoming[^\n.]*Phase 4E/i)
}

function assertDeliveredPhase4FTuiCleanupBehavior(content: string): void {
  assert.match(content, /Phase 4F[^\n.]*TUI cleanup[^\n.]*navigation[^\n.]*save|Phase 4F[^\n.]*cleanup[^\n.]*navigation[^\n.]*filtering[^\n.]*save/i)
  assert.match(content, /accepted|delivered|complete/i)
  assert.match(content, /Manager[^\n.]*topbar[^\n.]*filtered count|filtered count[^\n.]*Manager[^\n.]*topbar/i)
  assert.match(content, /open(?:ed)?-note[^\n.]*full-path[^\n.]*bottom path|open-note bottom path[^\n.]*currently opened note full path|bottom path[^\n.]*currently opened note full path/i)
  assert.match(content, /empty\/calm placeholder[^\n.]*no note is open|no note is open[^\n.]*empty\/calm placeholder/i)
  assert.doesNotMatch(content, /(?:open-note\s+)?bottom path[^\n.]*selected note path|(?:open-note\s+)?bottom path[^\n.]*open\/selected note path|(?:open-note\s+)?bottom path[^\n.]*focused note path|(?:open-note\s+)?bottom path[^\n.]*hovered path/i)
  assert.match(content, /filtered result[^\n.]*navigation|navigation[^\n.]*filtered result|filtered results?[^\n.]*open/i)
  assert.match(content, /editor[^\n.]*border[^\n.]*removed|removed[^\n.]*editor[^\n.]*border|without[^\n.]*editor[^\n.]*border/i)
  assert.match(content, /Editor body[^\n.]*title[^\n.]*removed|removed[^\n.]*Editor body[^\n.]*title|without[^\n.]*Editor body[^\n.]*title/i)
  assert.match(content, /editor[^\n.]*topbar[^\n.]*note[^\n.]*path[^\n.]*modified|topbar[^\n.]*note[^\n.]*path[^\n.]*modified/i)
  assert.match(content, /bottom bar[^\n.]*Line[^\n.]*Col[^\n.]*wrap[^\n.]*save|Line[^\n.]*Col[^\n.]*wrap[^\n.]*save[^\n.]*bottom bar/i)
  assert.match(content, /autosave[^\n.]*manager switching after edit|manager switching after edit[^\n.]*autosave|switch(?:ing)?[^\n.]*notes?[^\n.]*after[^\n.]*autosave/i)
}

function assertPhase4FNotAdvertisedUpcoming(content: string): void {
  assert.doesNotMatch(content, /Phase 4F[^\n.]*upcoming|upcoming[^\n.]*Phase 4F/i)
  assert.doesNotMatch(content, /Phase 4F[^\n.]*not yet planned|not yet planned[^\n.]*Phase 4F/i)
}

function assertDataStorageAndContainsSearchContract(content: string): void {
  assert.match(content, /plain Markdown/i)
  assert.match(content, /\.data\/notes\//)
  assert.match(content, /\.data\/metadata\.sqlite/)
  assert.match(content, /\.data\/search-index\.json/)
  assert.match(content, /contains-style|contains style/i)
  assert.match(content, /123.*contain|contain.*123/i)
  assert.doesNotMatch(content, /\.state\/metadata\.sqlite|\.state\/search-index\.json/)
  assert.doesNotMatch(content, /fuzzy search|fuzzy-style search|fuzzy matching/i)
}

function assertNoCanonicalStateSidecars(content: string): void {
  assert.doesNotMatch(content, /canonical[^\n.]*\.state\/notes\//i)
  assert.doesNotMatch(content, /\.state\/notes\/[^\n.]*canonical/i)
}

test("README documents the refined Phase 3 TUI workspace behavior", async () => {
  const readme = await readRepoFile("README.md")

  assert.match(readme, /bn tui/)
  assert.match(readme, /Manager/i)
  assert.match(readme, /Editor/i)
  assert.match(readme, /Search Everything/i)
  assert.match(readme, /shell completion/i)
  assert.match(readme, /not a TUI action/i)
  assertRefinedTuiBehavior(readme)
  assertMinimalManagerChrome(readme)
  assertDeliveredPhase4BEditorBehavior(readme)
  assertPhase4BNotAdvertisedIncomplete(readme)
  assertDeliveredPhase4CManagerBehavior(readme)
  assertPhase4CNotAdvertisedUpcoming(readme)
  assertDeliveredPhase4DSearchEverythingBehavior(readme)
  assertPhase4DNotAdvertisedUpcoming(readme)
  assertDeliveredPhase4ESaveContract(readme)
  assertPhase4ENotAdvertisedUpcoming(readme)
  assertDeliveredPhase4FTuiCleanupBehavior(readme)
  assertPhase4FNotAdvertisedUpcoming(readme)
  assertNeutralNextPhaseMarker(readme)
})

test("product and phase docs describe refined Manager, Editor, and Search Everything Phase 3 scope", async () => {
  const overview = await readRepoFile("docs/product/overview.md")
  const phase = await readRepoFile("docs/phases/phase-3-tui-workspace.md")

  for (const content of [overview, phase]) {
    assert.match(content, /bn tui/)
    assert.match(content, /Manager/i)
    assert.match(content, /Editor/i)
    assert.match(content, /Search Everything/i)
    assertRefinedTuiBehavior(content)
    assertMinimalManagerChrome(content)
  }

  assert.match(phase, /plain Markdown/i)
  assert.match(phase, /without required frontmatter|no .*frontmatter/i)
  assert.match(phase, /command entries/i)
  assert.match(phase, /only .*\/save.* wired|\/save.* only .*wired/i)
  assert.doesNotMatch(phase, /command\/action layer covering the available CLI workflows/i)
  assertDeliveredPhase4BEditorBehavior(phase)
  assertPhase4BNotAdvertisedIncomplete(phase)
  assertDeliveredPhase4CManagerBehavior(phase)
  assertPhase4CNotAdvertisedUpcoming(phase)
  assertDeliveredPhase4DSearchEverythingBehavior(phase)
  assertPhase4DNotAdvertisedUpcoming(phase)
  assertDeliveredPhase4ESaveContract(overview)
  assertDeliveredPhase4ESaveContract(phase)
  assertPhase4ENotAdvertisedUpcoming(overview)
  assertPhase4ENotAdvertisedUpcoming(phase)
  assertDeliveredPhase4FTuiCleanupBehavior(overview)
  assertDeliveredPhase4FTuiCleanupBehavior(phase)
  assertPhase4FNotAdvertisedUpcoming(overview)
  assertPhase4FNotAdvertisedUpcoming(phase)
  assertNeutralNextPhaseMarker(overview)
  assertNeutralNextPhaseMarker(phase)
})

test("smoke contracts cover delivered Phase 4F TUI cleanup regressions and status metadata", async () => {
  const smoke = await readRepoFile("scripts/smoke-opentui.ts")
  const interactiveSmoke = await readRepoFile("scripts/smoke-opentui-interactive.ts")

  assert.match(smoke, /phase-4f-tui-cleanup-navigation-save-bugs/i)
  assert.match(smoke, /phase-4-next-hardening-subplan/i)
  assertPhase4BNotAdvertisedIncomplete(smoke)
  assertPhase4CNotAdvertisedUpcoming(smoke)
  assertPhase4DNotAdvertisedUpcoming(smoke)
  assertPhase4ENotAdvertisedUpcoming(smoke)
  assertPhase4FNotAdvertisedUpcoming(smoke)

  assert.match(interactiveSmoke, /editor-input-regression-token/)
  assert.match(interactiveSmoke, /cursor-probe/)
  assert.match(interactiveSmoke, /Alt\+Z wrap|wrap/i)
  assert.match(interactiveSmoke, /responsive resize|responsive bottom/i)
  assert.match(interactiveSmoke, /autosave-persist/)
  assert.match(interactiveSmoke, /manager opens switch target with Enter after autosave/i)
  assert.match(interactiveSmoke, /manager opens switch target with Arrow Right after autosave/i)
  assert.match(interactiveSmoke, /manual-save-persist/)
  assert.match(interactiveSmoke, /actual note file/i)
  assert.match(interactiveSmoke, /Saved/)
})

test("Phase 4 docs mark 4F delivered and identify neutral hardening follow-up", async () => {
  const docs = await Promise.all([
    readRepoFile("docs/phases/phase-4-search-editing-and-recovery.md"),
  ])

  for (const content of docs) {
    assertDeliveredPhase4CManagerBehavior(content)
    assertPhase4CNotAdvertisedUpcoming(content)
    assertDeliveredPhase4DSearchEverythingBehavior(content)
    assertPhase4DNotAdvertisedUpcoming(content)
    assertDeliveredPhase4ESaveContract(content)
    assertPhase4ENotAdvertisedUpcoming(content)
    assertDeliveredPhase4FTuiCleanupBehavior(content)
    assertPhase4FNotAdvertisedUpcoming(content)
    assertNeutralNextPhaseMarker(content)
  }
})

test("runtime docs identify OpenTUI as the refined Phase 3 workspace runtime", async () => {
  const runtime = await readRepoFile("docs/architecture/runtime-and-dependencies.md")

  assert.match(runtime, /@opentui\/core/)
  assert.match(runtime, /Phase 3/i)
  assert.match(runtime, /bn tui/)
  assert.match(runtime, /Manager/i)
  assert.match(runtime, /Editor/i)
  assert.match(runtime, /Search Everything/i)
  assertRefinedTuiBehavior(runtime)
  assertDeliveredPhase4DSearchEverythingBehavior(runtime)
  assertDeliveredPhase4ESaveContract(runtime)
  assertPhase4ENotAdvertisedUpcoming(runtime)
  assertDeliveredPhase4FTuiCleanupBehavior(runtime)
  assertPhase4FNotAdvertisedUpcoming(runtime)
})

test("active docs describe canonical data storage and contains search contracts", async () => {
  const docs = await Promise.all([
    readRepoFile("README.md"),
    readRepoFile("docs/product/overview.md"),
    readRepoFile("docs/architecture/managed-root-layout.md"),
    readRepoFile("docs/architecture/note-format-and-indexing.md"),
    readRepoFile("docs/architecture/runtime-and-dependencies.md"),
    readRepoFile("docs/phases/phase-4-search-editing-and-recovery.md"),
  ])

  for (const content of docs) {
    assertDataStorageAndContainsSearchContract(content)
    assertNoCanonicalStateSidecars(content)
    assertPhase4BNotAdvertisedIncomplete(content)
    assertPhase4CNotAdvertisedUpcoming(content)
    assertPhase4ENotAdvertisedUpcoming(content)
  }
})
