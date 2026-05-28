# Phase 4D — Search Everything Correctness/Readability/Responsive Preview Implementation Plan

> **For implementer:** Use TDD throughout. Write failing tests first. Watch them fail. Then implement the minimal code to pass.

**Goal:** Deliver Phase 4D Search Everything refinement: readable typed results, separated preview sections, responsive/optional preview visibility, safe command statuses, and resilient search-index failure handling without changing the Phase 4 storage contract.

**Architecture:** Build on the approved umbrella design in `docs/plans/2026-05-27-phase-4-search-editing-recovery-design.md`, specifically the Phase 4D Search Everything scope. Keep Search Everything as a TUI presentation/controller layer over existing core search services and note summaries. Reuse the Phase 4A contains matching utilities and Phase 4C responsive/runtime patterns; do not reintroduce fuzzy matching, heavy background work, or additional storage.

**Tech Stack:** Bun, TypeScript, OpenTUI, existing BlueNote core services, existing TUI controller/render adapters.

**Canonical scope guard:** This is **Phase 4D**, not any older Phase 3 TUI plan. Ignore historical Phase 3 wording unless the current Phase 4D plan explicitly cites it. Phase 4A, 4B, and 4C are already delivered; do not rename or rework their completed artifacts except for docs/status references required by this plan.

---

## Approved Phase 4D outcomes

From the approved Phase 4 umbrella design:

- Use the same contains-style matching contract as CLI search.
- Ensure non-selected results are readable and selected result is visually distinct.
- Visually separate input, result list, preview panel, and preview sections.
- Support note, content, folder, and command result types.
- Dispatch Enter by result type:
  - note/content opens editor,
  - folder opens manager,
  - command runs a wired handler or shows a safe unavailable status.
- Hide preview automatically when terminal height is too small.
- Add preview toggle shortcut.
- Keep Search Everything input responsive and back navigation working if search/index data is unavailable.

## Current implementation surfaces

- Adapter/results: `src/tui/adapters/search-everything-adapter.ts`
- State: `src/tui/state.ts`
- Controller: `src/tui/workspace-controller.ts`
- Renderer/routing: `src/tui/render-search-everything.ts`
- Runtime/bootstrap: `src/tui/app.ts`
- Theme: `src/tui/theme.ts`
- Unit tests:
  - `tests/unit/tui/search-everything-adapter.test.ts`
  - `tests/unit/tui/render-view-models.test.ts`
  - `tests/unit/tui/render-routing.test.ts`
  - `tests/unit/tui/workspace-controller.test.ts`
  - `tests/unit/tui/state.test.ts`
- Integration/smoke/docs tests:
  - `tests/integration/tui-workflow.test.ts`
  - `tests/integration/docs-phase3-tui.test.ts`
  - `tests/integration/cli-help.test.ts`
  - `scripts/smoke-opentui.ts`
  - `scripts/smoke-opentui-interactive.ts`
- Docs/status:
  - `README.md`
  - `docs/product/overview.md`
  - `docs/architecture/runtime-and-dependencies.md`
  - `docs/phases/phase-3-tui-workspace.md`
  - `docs/phases/phase-4-search-editing-and-recovery.md`
  - `docs/plans/2026-05-27-phase-4-search-editing-recovery-design.md`

---

## Task 1: Enrich Search Everything result/preview adapter metadata

**Files:**
- Modify: `src/tui/adapters/search-everything-adapter.ts`
- Test: `tests/unit/tui/search-everything-adapter.test.ts`

**Goal:** Make adapter output explicit enough for readable rendering without putting UI layout decisions in the adapter.

**Step 1: Write failing tests**

Add tests asserting:

1. Every result type exposes a stable display type label/icon intent without relying only on raw `kind` strings:
   - note: `note`
   - content: `content`
   - folder: `folder`
   - command: `command`
2. Preview output exposes typed sections instead of one undifferentiated `lines` array only. Expected section labels:
   - note: `Metadata`, `Description`
   - content: `Match`, `Excerpt`
   - folder: `Folder`, `Contents`
   - command: `Usage`, optionally `Shortcut`
3. Existing contains-style behavior remains unchanged:
   - numeric query `123` only matches actual fields containing `123`
   - subsequence-only query `abc` does not match `a-big-cat`
   - slash command `/ae` does not fuzzy-match `/archive`

**Suggested test command:**

```bash
bun test tests/unit/tui/search-everything-adapter.test.ts --test-name-pattern "display metadata|preview sections|subsequence|numeric|slash"
```

**Expected RED:** New display metadata/section assertions fail because the adapter currently exposes only raw `kind`, `title`, `subtitle`, and `lines`.

**Step 2: Implement minimal adapter changes**

- Add non-breaking fields to result/preview types, for example:
  - result row metadata: `typeLabel`, `typeIcon` or `typeMarker`
  - preview sections: `sections: Array<{ label: string; lines: string[] }>`
- Preserve existing `lines` for compatibility during this task unless all call sites are updated in the same diff.
- Do not add fuzzy matching or new result kinds.
- Do not read note bodies here beyond existing `searchNotes` content matches.

**Step 3: Verify**

```bash
bun test tests/unit/tui/search-everything-adapter.test.ts
bun run typecheck
```

**Step 4: Commit**

```bash
git add src/tui/adapters/search-everything-adapter.ts tests/unit/tui/search-everything-adapter.test.ts && git commit -m "feat: enrich search everything preview metadata"
```

---

## Task 2: Add Search Everything preview visibility/status state and safe command feedback

**Files:**
- Modify: `src/tui/state.ts`
- Modify: `src/tui/workspace-controller.ts`
- Test: `tests/unit/tui/state.test.ts`
- Test: `tests/unit/tui/workspace-controller.test.ts`

**Goal:** Track manual Search Everything preview visibility and visible command/search status without conflating it with Manager preview state.

**Step 1: Write failing tests**

Add tests asserting:

1. `SearchEverythingState` defaults `previewVisible` to `true` when Search Everything opens.
2. Toggling Search Everything preview visibility does not change Manager preview visibility.
3. Selecting an unwired command produces a visible safe status such as `Command unavailable: /archive` and keeps navigation/back recoverable.
4. Selecting a wired command still dispatches the handler or `/save` path and clears Search Everything as currently expected.
5. Destructive commands still respect dirty-editor confirmation before any status/handler action.

**Suggested test command:**

```bash
bun test tests/unit/tui/state.test.ts tests/unit/tui/workspace-controller.test.ts --test-name-pattern "Search Everything|command unavailable|preview visibility|dirty"
```

**Expected RED:** Preview visibility and status fields/methods do not exist; unwired command currently silently succeeds.

**Step 2: Implement minimal state/controller changes**

- Extend `SearchEverythingState` with:
  - `previewVisible?: boolean`
  - `status?: string | null`
- Normalize/cloned state should default `previewVisible` to `true` and `status` to `null`.
- Add controller API methods:
  - `toggleSearchPreview(): void`
  - `setSearchPreviewVisible(visible: boolean): void`
- In `runCommand` / `selectSearchResult`:
  - `/save` remains wired.
  - Explicit `deps.commandHandlers?.[commandName]` remains supported.
  - If no handler exists for a command, keep Search Everything open and set calm status: `Command unavailable: /name`.
  - Preserve dirty-destructive guard behavior.

**Step 3: Verify**

```bash
bun test tests/unit/tui/state.test.ts tests/unit/tui/workspace-controller.test.ts
bun run typecheck
```

**Step 4: Commit**

```bash
git add src/tui/state.ts src/tui/workspace-controller.ts tests/unit/tui/state.test.ts tests/unit/tui/workspace-controller.test.ts && git commit -m "feat: add search preview state and command status"
```

---

## Task 3: Redesign Search Everything view model for readability and responsive preview decisions

**Files:**
- Modify: `src/tui/render-search-everything.ts`
- Test: `tests/unit/tui/render-view-models.test.ts`

**Goal:** Move Search Everything view-model output from raw rows/preview text to explicit readable regions, selected/non-selected styles, preview sections, and responsive visibility decisions.

**Step 1: Write failing tests**

Add view-model tests asserting:

1. Non-selected results use readable normal text styling, not muted/low contrast.
2. Selected result has a distinct selected style/marker without overusing color across all metadata.
3. Rows expose separate fields for:
   - type label/icon
   - primary label
   - detail/path
   - selected/focus marker
4. Preview view model exposes sections with labels from Task 1.
5. Preview is hidden when either:
   - `state.search.previewVisible === false`, reason `manual`, or
   - provided terminal height is below an explicit threshold, reason `short-height`.
6. Hidden preview emits a compact status/hint and does not require preview sections.
7. Shortcuts include `Alt+P preview hide/show` along with existing type/select/Enter/Esc hints, because plain `p` remains printable search input.
8. The view model keeps exactly one input region, one result list region, and optionally one preview region.

**Suggested test command:**

```bash
bun test tests/unit/tui/render-view-models.test.ts --test-name-pattern "Search Everything"
```

**Expected RED:** Existing view model has raw result rows, no preview visibility reason, no preview sections, and no preview toggle shortcut.

**Step 2: Implement minimal view-model changes**

- Add constants, for example:
  - `SEARCH_PREVIEW_MIN_HEIGHT = 20`
- Extend `buildSearchEverythingViewModel(state, results, options?)` with `height?: number`.
- Compute effective preview visibility:
  - manual hidden if `state.search?.previewVisible === false`
  - responsive hidden if height is present and below threshold
  - otherwise visible
- Preserve `InputRenderable` ownership contract: one focused input only.
- Keep style intents within existing restrained palette tokens from `tuiTheme`; do not add decorative color roles unless a separate approved theme plan says so.

**Step 3: Verify**

```bash
bun test tests/unit/tui/render-view-models.test.ts
bun run typecheck
```

**Step 4: Commit**

```bash
git add src/tui/render-search-everything.ts tests/unit/tui/render-view-models.test.ts && git commit -m "feat: refine search everything view model"
```

---

## Task 4: Render Search Everything readable regions and hidden preview state

**Files:**
- Modify: `src/tui/render-search-everything.ts`
- Test: `tests/unit/tui/render-view-models.test.ts`
- Test: `tests/unit/tui/render-routing.test.ts`

**Goal:** Make the actual renderer follow the refined Search Everything view model.

**Step 1: Write failing tests**

Add renderer tests asserting:

1. Root chrome is minimal and does not paint a heavy full-screen title frame beyond the needed screen identity/input context.
2. Input, result list, and preview regions are visually separated by region IDs and compact headings/status text.
3. Result rows render readable non-selected labels/details and selected row marker/style.
4. Preview renders section labels and section lines separately.
5. When preview is hidden, the preview region is omitted or replaced with one compact hidden-status row; it must not render stale preview content.
6. Narrow/short rendering keeps search input and result rows routable.

**Suggested test command:**

```bash
bun test tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-routing.test.ts --test-name-pattern "Search Everything|search renderer"
```

**Expected RED:** Existing renderer always builds the preview pane and renders raw preview lines.

**Step 2: Implement minimal renderer changes**

- Render from the Task 3 view model only; avoid duplicate preview calculations in renderer code.
- Preserve the existing `InputRenderableEvents.INPUT`, `CHANGE`, and `ENTER` wiring.
- Use semantic row contents such as `[note] Daily Plan`, but keep output plain enough for terminal snapshots and tests.
- Do not introduce multi-color noise; prefer the existing primary/secondary/muted/focused palette.

**Step 3: Verify**

```bash
bun test tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-routing.test.ts
bun run typecheck
```

**Step 4: Commit**

```bash
git add src/tui/render-search-everything.ts tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-routing.test.ts && git commit -m "feat: render readable search everything layout"
```

---

## Task 5: Wire Search Everything preview toggle and runtime height responsiveness

**Files:**
- Modify: `src/tui/app.ts`
- Modify: `src/tui/render-search-everything.ts`
- Test: `tests/unit/tui/render-routing.test.ts`
- Test: `scripts/smoke-opentui-interactive.ts`

**Goal:** Connect real terminal height and the `p` preview toggle through runtime routing and smoke coverage.

**Step 1: Write failing tests**

Add tests asserting:

1. `routeSearchEverythingKey("p", controller)` toggles Search Everything preview, while printable search input behavior remains intact for other letters.
2. `Ctrl+P` still toggles Search Everything overlay globally.
3. Runtime passes effective terminal height into `renderSearchEverythingScreen`.
4. Interactive smoke can:
   - open Search Everything,
   - type a query,
   - toggle preview off/on with `p`,
   - resize tmux to short height and observe responsive preview hidden,
   - restore height and see preview return unless manually hidden,
   - Escape back to the invoking screen.

**Suggested test command:**

```bash
bun test tests/unit/tui/render-routing.test.ts --test-name-pattern "Search Everything|preview"
bun run smoke:opentui:interactive
```

**Expected RED:** `p` is currently printable search input, and runtime currently does not pass height to the Search Everything renderer.

**Step 2: Implement minimal runtime/routing changes**

- Route `p` as preview toggle only when Search Everything input is not intended to accept `p`? Resolve carefully:
  - Preferred contract: use `Ctrl+P` for overlay, `Alt+P` or a non-text key if plain `p` conflicts with typing.
  - If implementing plain `p`, preserve text input by routing only a documented control sequence or explicit mode shortcut.
  - If a conflict appears in RED tests, choose a non-printable shortcut and update the plan note/docs in this task before committing.
- Pass `height` to `renderSearchEverythingScreen` from `renderWorkspace`, similar to Phase 4C width handling.
- Preserve single focused input after rerenders.

**Shortcut decision locked for this plan:** Use `Alt+P` (`"\u001bp"`) for Search Everything preview toggle to avoid stealing printable `p` from the search query input. Display it as `Alt+P preview hide/show`.

**Step 3: Verify**

```bash
bun test tests/unit/tui/render-routing.test.ts
bun run smoke:opentui:interactive
bun run typecheck
```

**Step 4: Commit**

```bash
git add src/tui/app.ts src/tui/render-search-everything.ts tests/unit/tui/render-routing.test.ts scripts/smoke-opentui-interactive.ts && git commit -m "feat: wire search preview responsiveness"
```

---

## Task 6: Keep Search Everything usable when search/index data fails

**Files:**
- Modify: `src/tui/workspace-controller.ts`
- Modify: `src/tui/adapters/search-everything-adapter.ts` if needed
- Test: `tests/unit/tui/workspace-controller.test.ts`
- Test: `tests/integration/tui-workflow.test.ts`

**Goal:** Search Everything remains responsive and navigable if content search throws because indexes are missing/corrupt; note summary, folder, and command results still work where available.

**Step 1: Write failing tests**

Add tests asserting:

1. If `deps.searchNotes(query)` throws, `updateSearchQuery(query)` does not throw.
2. Search state remains open with query preserved and a calm status such as `Search index unavailable; showing notes, folders, and commands only`.
3. Note/folder/command results derived from summaries/commands still appear if they match.
4. Escape/back still returns to the invoking screen.
5. Integration path with a simulated `searchNotes` failure still lets a folder/note result be selected or lets the user cancel.

**Suggested test command:**

```bash
bun test tests/unit/tui/workspace-controller.test.ts tests/integration/tui-workflow.test.ts --test-name-pattern "Search Everything|search index unavailable|cancel"
```

**Expected RED:** Existing rebuild/search path propagates search failures.

**Step 2: Implement minimal error handling**

- Catch search failures around Search Everything result rebuild, not inside unrelated core search code.
- Preserve input responsiveness by updating state before attempting result rebuild.
- Build partial results from `noteSummaries` and commands when content search fails.
- Set visible `state.search.status` and include it in the view model from Task 3.
- Do not hide or swallow errors for CLI `bn search`; this is TUI Search Everything resilience only.

**Step 3: Verify**

```bash
bun test tests/unit/tui/workspace-controller.test.ts tests/integration/tui-workflow.test.ts
bun run typecheck
```

**Step 4: Commit**

```bash
git add src/tui/workspace-controller.ts src/tui/adapters/search-everything-adapter.ts tests/unit/tui/workspace-controller.test.ts tests/integration/tui-workflow.test.ts && git commit -m "fix: keep search everything responsive on index errors"
```

---

## Task 7: Update docs, smoke metadata, and user-facing Search Everything contract

**Files:**
- Modify: `README.md`
- Modify: `docs/product/overview.md`
- Modify: `docs/architecture/runtime-and-dependencies.md`
- Modify: `docs/phases/phase-3-tui-workspace.md`
- Modify: `docs/phases/phase-4-search-editing-and-recovery.md`
- Modify: `docs/plans/2026-05-27-phase-4-search-editing-recovery-design.md`
- Modify: `src/tui/app.ts`
- Modify: `scripts/smoke-opentui.ts`
- Modify: `tests/integration/docs-phase3-tui.test.ts`
- Modify: `tests/integration/cli-help.test.ts` if bootstrap/help metadata expectations change

**Goal:** Align docs/status surfaces after Phase 4D is delivered and identify the next Phase 4 follow-up without overwriting historical intent.

**Step 1: Write failing docs/status tests**

Add/update tests asserting:

1. Phase 4D is marked accepted/delivered after implementation.
2. Docs describe Search Everything readability/responsiveness:
   - contains semantics
   - readable typed results
   - separated preview sections
   - responsive preview auto-hide
   - manual `Alt+P` preview toggle
   - safe unavailable command status
3. Smoke metadata moves from current 4C status to a Phase 4D delivered status.
4. `nextPhase` no longer says Phase 4D. If no approved next subplan exists, use a neutral next marker such as `phase-4-next-hardening-subplan` and keep docs clear that 4E/scratch/autosave/archive hardening is not yet planned.

**Suggested test command:**

```bash
bun test tests/integration/docs-phase3-tui.test.ts tests/integration/cli-help.test.ts
bun run smoke:opentui
```

**Expected RED:** Docs/smoke currently advertise 4C delivered and 4D next.

**Step 2: Implement docs/status changes**

- Update `getTuiBootstrapInfo()` status to `phase-4d-search-everything-readability-responsive-preview`.
- Update `nextPhase` to a neutral approved-roadmap marker unless a more specific approved Phase 4E exists in docs.
- Update smoke assertions accordingly.
- Keep wording scoped; do not claim scratch/today/templates, archive hardening, or crash recovery are delivered.

**Step 3: Verify**

```bash
bun test tests/integration/docs-phase3-tui.test.ts tests/integration/cli-help.test.ts
bun run smoke:opentui
bun run typecheck
```

**Step 4: Commit**

```bash
git add README.md docs/product/overview.md docs/architecture/runtime-and-dependencies.md docs/phases/phase-3-tui-workspace.md docs/phases/phase-4-search-editing-and-recovery.md docs/plans/2026-05-27-phase-4-search-editing-recovery-design.md src/tui/app.ts scripts/smoke-opentui.ts tests/integration/docs-phase3-tui.test.ts tests/integration/cli-help.test.ts && git commit -m "docs: document phase 4d search refinement"
```

---

## Task 8: Final Phase 4D verification and reviews

**Files:**
- No planned code changes unless reviews find blockers.

**Goal:** Prove Phase 4D is complete, reviewed, and safe to keep on the current branch.

**Step 1: Run focused Phase 4D suite**

```bash
bun test tests/unit/tui/search-everything-adapter.test.ts \
  tests/unit/tui/state.test.ts \
  tests/unit/tui/workspace-controller.test.ts \
  tests/unit/tui/render-view-models.test.ts \
  tests/unit/tui/render-routing.test.ts \
  tests/integration/tui-workflow.test.ts
```

Expected: PASS.

**Step 2: Run full repo gate**

```bash
bun run typecheck
bun test
bun run smoke:opentui
bun run smoke:opentui:interactive
bun run smoke:cli
git status --short --branch
```

Expected: PASS; working tree clean after any needed commits.

**Step 3: Final reviews**

Dispatch final spec and quality reviewers with:

- Exact plan file: `docs/plans/2026-05-28-phase-4d-search-everything-readability-responsive-preview-implementation.md`
- Approved umbrella design: `docs/plans/2026-05-27-phase-4-search-editing-recovery-design.md`
- Review range from the Phase 4D plan commit through HEAD.
- Require explicit checks for:
  - no fuzzy search reintroduced,
  - Search Everything input remains writable,
  - preview toggle does not steal printable `p`,
  - hidden preview does not render stale preview content,
  - unavailable commands are safe/visible,
  - index/search failure keeps back navigation working,
  - docs/smoke status matches implementation.

**Step 4: Fix blockers, re-run verification, and commit if needed**

Any Critical/Important review issue must be fixed before marking Task 8 complete.

**Step 5: Handoff**

If the user says to keep the branch, report:

- branch name,
- clean/dirty status,
- base branch,
- verification commands passed,
- latest commit,
- known follow-ups.

---

## Execution mode

Recommended execution mode: **Subagent-driven**, one implementer and two reviewers per task, because Phase 4D spans state, controller, renderer, runtime smoke, docs, and interaction contracts.
