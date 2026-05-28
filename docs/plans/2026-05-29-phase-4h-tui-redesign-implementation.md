# Phase 4H TUI Design-Language Redesign Implementation Plan

> **For implementer:** Use TDD throughout. Write failing tests first. Watch them fail. Then implement. Do not implement this plan until the user explicitly approves it.

**Goal:** Apply the canonical `Quiet Blue Dashboard` design language to BlueNote’s Manager, Editor, Search Everything, prompt/task-sheet, status, and responsive TUI surfaces.

**Architecture:** Keep the existing three-screen TUI architecture: Manager, Editor, and Search Everything remain presentation/input layers over existing core services. Add semantic theme roles and shared rendering helpers first, then migrate each screen to use design-language roles instead of raw cyan/border-heavy styling.

**Tech Stack:** Bun, TypeScript, OpenTUI, existing `src/tui/*` render/controller files, existing unit/integration/smoke test harnesses, `computer-use-linux` focused-terminal screenshot QA.

**Canonical design-language:** `docs/product/design-language.md`

**Evidence corpus:** `/tmp/bluenote-phase4h-screens/` and `/tmp/bluenote-phase4h-observations.md`.

---

## Non-goals

- No storage model changes.
- No frontmatter.
- No AI features, sync, hosted backend, account system, or cloud assumptions.
- No new broad command surface.
- No implementation of currently-unwired destructive/maintenance slash commands unless separately planned.
- No user-configurable theme system in this phase; define the base design language first.

---

## Acceptance criteria

- `docs/product/design-language.md` remains the source of truth for visual decisions.
- Cyan/accent is no longer used as the default border for every passive panel.
- Every screen has one obvious focused element.
- Editor is calmer than Manager/Search.
- Manager/Search use intentional dashboard structure rather than large blank cyan boxes.
- Create/find/delete prompts use task-sheet structure.
- Delete is clearly destructive and names target/consequence.
- Titles/body dominate metadata.
- Shortcut rows are progressive and lower visual weight than content.
- Small terminals simplify layout; large terminals add useful context.
- Unicode/wide-character screenshots remain readable.
- Verification passes:
  - `bun run typecheck`
  - `bun test`
  - `bun run smoke:opentui`
  - `bun run smoke:opentui:interactive`
  - `bun run smoke:cli`
  - focused-terminal screenshot QA for Manager, Editor, Search, prompts, and Unicode.

---

## Task 1: Semantic theme tokens

**Files:**
- Modify: `src/tui/theme.ts`
- Modify tests as needed: `tests/unit/tui/render-view-models.test.ts`, `tests/unit/tui/render-routing.test.ts`

**Step 1: Write failing tests**
- Add/adjust tests asserting the theme exposes semantic roles for:
  - subtle border
  - focus border
  - panel surface
  - raised panel surface
  - text primary/secondary/muted
  - status success/warning/danger/info
- Assert pending/dirty uses warning and failed save uses danger.

**Step 2: Run test — confirm failure**

```bash
bun test tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-routing.test.ts
```

Expected: fail because semantic roles do not exist or are not wired.

**Step 3: Implement semantic tokens**
- Expand `TuiColorIntent` / `tuiTheme` roles by meaning.
- Preserve existing color values where reasonable, but stop using primary accent as the generic panel border role.

**Step 4: Run targeted tests**

```bash
bun test tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-routing.test.ts
bun run typecheck
```

**Step 5: Commit**

```bash
git add src/tui/theme.ts tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-routing.test.ts && git commit -m "feat: add semantic tui design tokens"
```

---

## Task 2: Shared chrome and shortcut hierarchy

**Files:**
- Modify: `src/tui/render-manager.ts`
- Modify: `src/tui/render-editor.ts`
- Modify: `src/tui/render-search-everything.ts`
- Modify or create shared helper under `src/tui/` if needed, for example `src/tui/render-chrome.ts`
- Tests: `tests/unit/tui/render-routing.test.ts`, `tests/unit/tui/render-view-models.test.ts`

**Step 1: Write failing tests**
- Assert footer hints render as prioritized key/action pairs such as `[Enter] Open`, `[n] New`, `[?] More` or equivalent render chunks.
- Assert secondary shortcuts are omitted/demoted on narrow/typing states.
- Assert topbar/status uses semantic roles and no cyan-border fallback.

**Step 2: Run targeted tests**

```bash
bun test tests/unit/tui/render-routing.test.ts tests/unit/tui/render-view-models.test.ts
```

Expected: fail against current dense equal-weight shortcut rows.

**Step 3: Implement shared chrome/hint helpers**
- Centralize key/action chunk formatting.
- Apply muted default text with accent only on keycaps or focus.
- Keep shortcuts context-specific and progressive.

**Step 4: Verify**

```bash
bun test tests/unit/tui/render-routing.test.ts tests/unit/tui/render-view-models.test.ts
bun run typecheck
```

**Step 5: Commit**

```bash
git add src/tui tests/unit/tui && git commit -m "feat: standardize tui chrome and shortcut hierarchy"
```

---

## Task 3: Manager dashboard redesign

**Files:**
- Modify: `src/tui/render-manager.ts`
- Modify view models if needed: `src/tui/view-models.ts` or related adapter files
- Tests: `tests/unit/tui/render-routing.test.ts`, `tests/unit/tui/render-view-models.test.ts`

**Step 1: Write failing tests**
- Root/home state includes plain-language orientation and primary actions.
- Note list rows are title-first; key/path metadata is muted.
- Passive panel borders use subtle styling; only active pane uses focus styling.
- Large inbox layout includes structured preview metadata or useful context, not only blank bordered panels.
- Narrow Manager hides/demotes preview and secondary metadata predictably.

**Step 2: Run targeted tests**

```bash
bun test tests/unit/tui/render-routing.test.ts tests/unit/tui/render-view-models.test.ts
```

Expected: fail against current cyan-box/list layout.

**Step 3: Implement Manager redesign**
- Apply title-first rows.
- Add root/home empty/onboarding copy.
- Add preview card hierarchy.
- Add subtle/passive vs focused panel border behavior.
- Update footer hints.

**Step 4: Verify**

```bash
bun test tests/unit/tui/render-routing.test.ts tests/unit/tui/render-view-models.test.ts
bun run smoke:opentui
```

**Step 5: Commit**

```bash
git add src/tui tests/unit/tui && git commit -m "feat: redesign tui manager dashboard"
```

---

## Task 4: Prompt/task-sheet redesign

**Files:**
- Modify: prompt rendering in `src/tui/render-manager.ts`, `src/tui/render-editor.ts`, and/or `src/tui/render-search-everything.ts`
- Modify controller/view-model state only if needed to expose target/context text
- Tests: `tests/unit/tui/render-routing.test.ts`, `tests/unit/tui/workspace-controller.test.ts`

**Step 1: Write failing tests**
- Create note prompt renders as a task sheet with destination and `[Enter] Create` / `[Esc] Cancel` actions.
- Delete prompt renders title, target note title/path, consequence copy, danger role, and safe cancel action.
- Find prompt renders query, match count when available, and find-specific hints while suppressing unrelated footer noise.

**Step 2: Run targeted tests**

```bash
bun test tests/unit/tui/render-routing.test.ts tests/unit/tui/workspace-controller.test.ts
```

Expected: fail against current bottom-prompt/footer-like presentation.

**Step 3: Implement task sheets**
- Convert create/filter/find/delete to design-language task-sheet patterns.
- Apply danger semantic role to destructive confirmation.
- Keep keyboard behavior unchanged unless explicitly covered by tests.

**Step 4: Verify**

```bash
bun test tests/unit/tui/render-routing.test.ts tests/unit/tui/workspace-controller.test.ts
bun run typecheck
```

**Step 5: Commit**

```bash
git add src/tui tests/unit/tui && git commit -m "feat: redesign tui prompt task sheets"
```

---

## Task 5: Editor writing polish

**Files:**
- Modify: `src/tui/render-editor.ts`
- Modify save status view model if needed: `src/tui/app.ts`, `src/tui/view-models.ts`, or related editor state files
- Tests: `tests/unit/tui/render-routing.test.ts`, `tests/unit/tui/workspace-controller.test.ts`, `tests/integration/tui-workflow.test.ts`

**Step 1: Write failing tests**
- Editor topbar shows title primary and metadata muted/humanized.
- Editor body has intentional margins where supported.
- Footer shortcut row compresses while typing or in constrained/zoom-like layout.
- Save state renders distinct `Unsaved`/`Saving…`/`Saved`/`Autosave failed` semantic states.

**Step 2: Run targeted tests**

```bash
bun test tests/unit/tui/render-routing.test.ts tests/unit/tui/workspace-controller.test.ts tests/integration/tui-workflow.test.ts
```

Expected: fail against current flat topbar and dense footer.

**Step 3: Implement editor polish**
- Keep editor borderless and writing-first.
- Add margin/padding through render chunks or layout cells.
- Humanize updated time if existing utilities support it; otherwise add tested utility.
- Ensure save-state transitions remain behaviorally correct.

**Step 4: Verify**

```bash
bun test tests/unit/tui/render-routing.test.ts tests/unit/tui/workspace-controller.test.ts tests/integration/tui-workflow.test.ts
bun run smoke:opentui
bun run smoke:opentui:interactive
```

**Step 5: Commit**

```bash
git add src/tui tests/unit/tui tests/integration/tui-workflow.test.ts && git commit -m "feat: polish tui editor writing surface"
```

---

## Task 6: Search Everything redesign

**Files:**
- Modify: `src/tui/render-search-everything.ts`
- Modify search view models/adapters if needed
- Tests: `tests/unit/tui/render-routing.test.ts`, `tests/unit/tui/render-view-models.test.ts`, `tests/integration/tui-workflow.test.ts`

**Step 1: Write failing tests**
- Empty search shows examples/recent actions/command suggestions.
- Results distinguish note/folder/command/destructive/unavailable rows.
- Slash commands use compact tags and semantic risk/availability roles.
- Preview is structured into fields such as Usage, Shortcut, Path, Match, Risk.
- `Esc manager` appears as a key hint rather than raw title copy.

**Step 2: Run targeted tests**

```bash
bun test tests/unit/tui/render-routing.test.ts tests/unit/tui/render-view-models.test.ts tests/integration/tui-workflow.test.ts
```

Expected: fail against current dense result/command rows.

**Step 3: Implement Search redesign**
- Apply calmer input styling.
- Add useful empty state.
- Restructure result rows and preview fields.
- Danger-tag `/delete`; warning/maintenance-tag `/migrate` and `/rebuild`; muted-tag unavailable commands.

**Step 4: Verify**

```bash
bun test tests/unit/tui/render-routing.test.ts tests/unit/tui/render-view-models.test.ts tests/integration/tui-workflow.test.ts
bun run smoke:opentui
```

**Step 5: Commit**

```bash
git add src/tui tests/unit/tui tests/integration/tui-workflow.test.ts && git commit -m "feat: redesign search everything dashboard"
```

---

## Task 7: Responsive and Unicode visual acceptance

**Files:**
- Modify docs only unless visual bugs are found:
  - `docs/plans/2026-05-29-phase-4h-tui-redesign-results.md`
- Potential fixes from discovered bugs must get their own TDD subtask before implementation.

**Step 1: Run full verification**

```bash
bun run typecheck
bun test
bun run smoke:opentui
bun run smoke:opentui:interactive
bun run smoke:cli
```

**Step 2: Capture focused-terminal screenshots**

Use the focused-terminal `computer-use-linux` bridge documented in `docs/plans/2026-05-28-phase-4-tui-manual-qa-results.md` and the skill reference.

Required matrix:

- Manager root/home at `80x24 --zoom=1.0`
- Manager inbox/preview at `120x40 --zoom=1.0`
- Create task sheet at `100x30 --zoom=1.0`
- Delete task sheet at `100x30 --zoom=1.0`
- Editor saved at `100x30 --zoom=1.5`
- Editor dirty/typing at `100x30 --zoom=1.0`
- Editor find mode at `100x30 --zoom=1.0`
- Search empty at `100x30 --zoom=1.0`
- Search results at `120x40 --zoom=1.0`
- Search slash commands at `100x30 --zoom=1.0`
- Unicode editor at `100x30 --zoom=1.0`

**Step 3: User-perspective rating**

Rate each screen against `docs/product/design-language.md`:

- focus clarity
- hierarchy
- color role discipline
- metadata/content balance
- shortcut noise
- responsive fit
- Unicode/wide-character correctness where applicable

**Step 4: Record results**

Create `docs/plans/2026-05-29-phase-4h-tui-redesign-results.md` with screenshot paths, ratings, failures, and follow-up items.

**Step 5: Commit**

```bash
git add docs/plans/2026-05-29-phase-4h-tui-redesign-results.md && git commit -m "docs: record phase 4h visual acceptance"
```

---

## Execution mode after approval

Recommended: **subagent-driven execution** using one implementer + two reviewers per task, because this work spans multiple screens and visual contracts.

Manual execution is possible but riskier because design-language drift is easy across Manager, Editor, Search, prompts, and responsive behavior.
