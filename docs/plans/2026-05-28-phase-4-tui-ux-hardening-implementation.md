# Phase 4 TUI UX Hardening Implementation Plan

> **For implementer:** Use TDD throughout. Write failing test first. Watch it fail. Then implement. Do not broaden scope beyond the manual QA findings unless a new blocker is reproduced.

**Goal:** Convert the Phase 4 TUI manual QA findings into a first hardening batch that improves user-facing editor chrome, locks high-risk save/navigation regressions, and makes the manual visual QA loop actionable.

**Architecture:** Keep the TUI as a presentation/input layer over existing core services. Fix user-visible UI contract drift by plumbing existing note metadata into the editor view model instead of deriving display-only state in render code. Add regression tests around the already-passing critical workflows so future UI refinements cannot reintroduce save/quit/navigation instability. Treat screenshot tooling as a QA-enablement task, not product runtime behavior.

**Tech Stack:** Bun, TypeScript, `@opentui/core`, existing `src/tui/*` modules, BlueNote core note services, existing Bun test suite, optional `tmux`-backed smoke script.

**Source manual QA artifacts:**

- Plan: `docs/plans/2026-05-28-phase-4-tui-manual-qa-plan.md`
- Results: `docs/plans/2026-05-28-phase-4-tui-manual-qa-results.md`
- Evidence: `/tmp/bluenote-qa-evidence/`

**Known QA constraints:**

- `computer-use-linux` window/input readiness is available, but GNOME screenshot capture still fails with portal denied/cancel response in this session.
- `bun run smoke:opentui:interactive` currently fails in this environment because `tmux` is not installed.
- No confirmed Blocker/High product defects reproduced in the first QA run; do not destabilize save/quit flows while polishing UI.

---

## Task 1: Make the manual QA docs accurately reflect approval and the latest screenshot retry

**Files:**

- Modify: `docs/plans/2026-05-28-phase-4-tui-manual-qa-plan.md`
- Modify: `docs/plans/2026-05-28-phase-4-tui-manual-qa-results.md`

**Step 1: Write the doc-only expectation check**

Run:

```bash
grep -n "Status:" docs/plans/2026-05-28-phase-4-tui-manual-qa-plan.md
grep -n "Screenshot capture remains blocked" docs/plans/2026-05-28-phase-4-tui-manual-qa-results.md
```

Expected before edit:

- First command still says `Draft for user approval`.
- Second command has no continuation note.

**Step 2: Update plan status and results continuation note**

Change the plan status line to:

```markdown
**Status:** Approved and executed; follow-up hardening plan created from results.
```

Append this note near the top of the results doc, after the executive summary bullets:

```markdown
### Continuation note — 2026-05-28

The user approved proceeding from the manual QA plan into hardening. A fresh `computer-use-linux` screenshot retry against Ubuntu Terminal window `2069271615` still failed with GNOME Shell / XDG portal denial, so screenshot-based visual acceptance remains open. Product code should focus first on confirmed UI contract drift and regression coverage, while visual acceptance is retried after screenshot tooling is unblocked.
```

**Step 3: Verify docs**

Run:

```bash
grep -n "Approved and executed" docs/plans/2026-05-28-phase-4-tui-manual-qa-plan.md
grep -n "Screenshot capture remains blocked\|screenshot retry" docs/plans/2026-05-28-phase-4-tui-manual-qa-results.md
```

Expected: both commands find the new text.

**Step 4: Commit**

```bash
git add docs/plans/2026-05-28-phase-4-tui-manual-qa-plan.md docs/plans/2026-05-28-phase-4-tui-manual-qa-results.md docs/plans/2026-05-28-phase-4-tui-ux-hardening-implementation.md && git commit -m "docs: capture phase 4 tui manual qa followup"
```

---

## Task 2: Fix editor timestamp metadata plumbing

**Files:**

- Modify: `src/tui/state.ts`
- Modify: `src/tui/workspace-controller.ts`
- Modify: `src/tui/render-editor.ts`
- Modify: `src/tui/app.ts`
- Modify: `tests/unit/tui/render-view-models.test.ts`
- Modify: `tests/unit/tui/workspace-controller.test.ts`

**Step 1: Write failing render/view-model test**

Add a test in `tests/unit/tui/render-view-models.test.ts` near the existing editor view-model tests:

```ts
test("editor topbar shows note updated timestamp when metadata exists", () => {
  const vm = buildEditorViewModel({
    ...baseState,
    screen: "editor",
    mode: "editor.body",
    editor: {
      ...baseState.editor!,
      note: {
        ...baseState.editor!.note,
        updatedAt: "2026-05-28T10:30:00.000Z",
      },
    },
  })

  assert.equal(vm.topbar.updatedLabel, "Updated 2026-05-28T10:30:00.000Z")
  assert.equal(vm.topbar.updatedIntent, "mutedText")
  assert.notEqual(vm.topbar.updatedLabel, "Updated unknown")
})
```

Expected TypeScript failure before implementation because `TuiNote` does not expose `updatedAt`.

**Step 2: Write failing controller test**

Add a test in `tests/unit/tui/workspace-controller.test.ts` that opens a note returned by `showNote` with `updatedAt` and asserts the controller state preserves that metadata:

```ts
test("opening a note preserves updatedAt metadata for editor chrome", () => {
  const controller = createWorkspaceController({
    listNotes: () => [
      {
        key: "daily-plan",
        title: "Daily Plan",
        description: "Today priorities.",
        relativePath: "notes/inbox/daily-plan.md",
      },
    ],
    showNote: () => ({
      key: "daily-plan",
      title: "Daily Plan",
      description: "Today priorities.",
      relativePath: "notes/inbox/daily-plan.md",
      body: "# Daily Plan",
      updatedAt: "2026-05-28T10:30:00.000Z",
    }),
    searchNotes: () => [],
  })

  controller.refreshManager()
  controller.openFocusedManagerItem()

  assert.equal(controller.getState().editor?.note.updatedAt, "2026-05-28T10:30:00.000Z")
})
```

Expected TypeScript failure before implementation.

**Step 3: Run targeted tests — confirm RED**

```bash
bun test tests/unit/tui/render-view-models.test.ts tests/unit/tui/workspace-controller.test.ts
```

Expected: FAIL due missing `updatedAt` on TUI note types / assertions.

**Step 4: Implement minimal metadata shape**

In `src/tui/state.ts`, extend `TuiNote`:

```ts
export interface TuiNote {
  key: string
  title: string
  description: string
  relativePath: string
  body: string
  createdAt?: string
  updatedAt?: string
  modifiedAt?: string
}
```

Ensure `cloneNote()` continues to spread all fields.

In `src/tui/workspace-controller.ts`, keep using `toTuiNote(note)` spread copies so metadata survives controller cloning. If TypeScript complains about `showNote` return type, update the relevant adapter/core conversion types rather than casting metadata away.

In `src/tui/app.ts`, ensure the `showNote` adapter returns `updatedAt` from the core note/frontmatter/sidecar shape when opening a note from the TUI.

**Step 5: Run targeted tests — confirm GREEN**

```bash
bun test tests/unit/tui/render-view-models.test.ts tests/unit/tui/workspace-controller.test.ts
```

Expected: PASS.

**Step 6: Verify broader TUI surface**

```bash
bun test tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-routing.test.ts tests/unit/tui/workspace-controller.test.ts tests/integration/tui-workflow.test.ts
bun run typecheck
```

Expected: PASS.

**Step 7: Manual/PTY spot check**

Launch against the QA root or a fresh root and capture editor topbar text:

```bash
BLUENOTE_ROOT="/tmp/bluenote-tui-manual-qa-iWRvsu" bun run ./bin/bn.ts tui
```

Open `alpha.md`; expected topbar no longer says `Updated unknown` when sidecar metadata exists.

**Step 8: Commit**

```bash
git add src/tui/state.ts src/tui/workspace-controller.ts src/tui/render-editor.ts src/tui/app.ts tests/unit/tui/render-view-models.test.ts tests/unit/tui/workspace-controller.test.ts && git commit -m "fix: show tui editor updated timestamp"
```

---

## Task 3: Add regression coverage for the edit-save-switch-quit critical path

**Files:**

- Modify: `tests/unit/tui/workspace-controller.test.ts`
- Modify: `tests/integration/tui-workflow.test.ts`
- Modify only if required: `src/tui/workspace-controller.ts`

**Step 1: Write failing/guarding controller test**

Add a test that mirrors Scenario H without relying on terminal rendering:

```ts
test("saved editor can switch to other notes and still quit", async () => {
  const notes = new Map([
    ["alpha-summary", { key: "alpha-summary", title: "Alpha Summary", description: "Summary", relativePath: "notes/similar/alpha-summary.md", body: "summary" }],
    ["alpha-source", { key: "alpha-source", title: "Alpha Source", description: "Source", relativePath: "notes/similar/alpha-source.md", body: "source" }],
    ["beta", { key: "beta", title: "Beta", description: "Beta", relativePath: "notes/inbox/beta.md", body: "beta" }],
  ])
  const persisted: string[] = []
  const controller = createWorkspaceController({
    listNotes: () => [...notes.values()].map(({ body, ...summary }) => summary),
    showNote: (selector) => notes.get(selector)! as any,
    searchNotes: () => [],
    persistEditorBody: async (note, body) => {
      persisted.push(`${note.key}:${body}`)
      const next = { ...note, body, description: body.split("\n")[0] ?? "" }
      notes.set(note.key, next)
      return next
    },
    autosaveScheduler: {
      setTimeout: (callback) => {
        callback()
        return 0
      },
      clearTimeout: () => undefined,
    },
  })

  controller.refreshManager()
  controller.focusManagerItem(0)
  controller.openFocusedManagerItem()
  controller.insertEditorText(" saved")
  await controller.saveEditor()
  assert.equal(controller.showManager().blocked, false)

  controller.focusManagerItem(1)
  assert.equal(controller.openFocusedManagerItem().blocked, false)
  assert.equal(controller.getState().editor?.note.key, "alpha-source")

  assert.equal(controller.showManager().blocked, false)
  controller.focusManagerItem(2)
  assert.equal(controller.openFocusedManagerItem().blocked, false)
  controller.insertEditorText(" saved")
  await controller.saveEditor()

  assert.equal(controller.requestQuit().blocked, false)
  assert.deepEqual(persisted, ["alpha-summary:summary saved", "beta:beta saved"])
})
```

Expected: should pass on current behavior. If it fails, stop and debug root cause before continuing.

**Step 2: Add integration-level workflow assertion**

In `tests/integration/tui-workflow.test.ts`, add or extend coverage to assert:

- edit note A,
- save,
- return to Manager,
- open note B by filtered/focused selection,
- save note B,
- quit allowed,
- persisted files contain both edits.

Use existing test helpers in that file rather than duplicating temp-root setup.

**Step 3: Run targeted tests**

```bash
bun test tests/unit/tui/workspace-controller.test.ts tests/integration/tui-workflow.test.ts
```

Expected: PASS. If RED, investigate with systematic debugging and fix root cause only.

**Step 4: Commit**

```bash
git add tests/unit/tui/workspace-controller.test.ts tests/integration/tui-workflow.test.ts src/tui/workspace-controller.ts && git commit -m "test: cover tui edit save switch quit flow"
```

---

## Task 4: Add permission-failure retry regression coverage

**Files:**

- Modify: `tests/unit/tui/workspace-controller.test.ts`
- Modify only if required: `src/tui/workspace-controller.ts`

**Step 1: Write failing/guarding test**

Add a controller test that simulates one failed persist followed by a successful retry:

```ts
test("failed editor save keeps buffer dirty and retry can save later", async () => {
  let shouldFail = true
  const controller = createWorkspaceController({
    listNotes: () => [
      { key: "beta", title: "Beta", description: "Beta", relativePath: "notes/inbox/beta.md" },
    ],
    showNote: () => ({ key: "beta", title: "Beta", description: "Beta", relativePath: "notes/inbox/beta.md", body: "Beta body" }),
    searchNotes: () => [],
    persistEditorBody: async (note, body) => {
      if (shouldFail) {
        throw new Error("EACCES: permission denied")
      }
      return { ...note, body, description: body }
    },
  })

  controller.refreshManager()
  controller.openFocusedManagerItem()
  controller.insertEditorText(" unsaved")

  const failed = await controller.saveEditor()
  assert.equal(failed.blocked, false)
  assert.equal(controller.getState().editor?.dirty, true)
  assert.equal(controller.getState().editor?.autosaveStatus, "error")

  shouldFail = false
  const retried = await controller.saveEditor()
  assert.equal(retried.blocked, false)
  assert.equal(controller.getState().editor?.dirty, false)
  assert.equal(controller.getState().editor?.autosaveStatus, "saved")
})
```

Expected: should pass on current behavior. If it fails, fix the root save-state bug before proceeding.

**Step 2: Run targeted test**

```bash
bun test tests/unit/tui/workspace-controller.test.ts
```

Expected: PASS.

**Step 3: Commit**

```bash
git add tests/unit/tui/workspace-controller.test.ts src/tui/workspace-controller.ts && git commit -m "test: lock tui save failure retry behavior"
```

---

## Task 5: Harden create/delete prompt regression coverage

**Files:**

- Modify: `tests/unit/tui/workspace-controller.test.ts`
- Modify: `tests/integration/tui-workflow.test.ts`
- Modify only if required: `src/tui/workspace-controller.ts`

**Step 1: Add create prompt validation test**

Add controller assertions for:

- `openManagerCreate()` sets mode `manager.create`.
- Empty title submit keeps mode and sets `Title required`.
- Valid title calls `createNote`, refreshes manager, opens created note in editor.

**Step 2: Add delete cancel/confirm test**

Add controller assertions for:

- delete on folder sets calm status instead of deleting,
- delete on note opens confirmation,
- cancel returns to browse and leaves note visible,
- confirm calls `deleteNote`, refreshes manager, and clears opened deleted note state if applicable.

**Step 3: Add disk-level integration coverage where practical**

In `tests/integration/tui-workflow.test.ts`, use existing temp root helpers to create and delete a disposable note, then assert both note file and `.data/notes/<key>.json` sidecar are present/removed as expected.

**Step 4: Run targeted tests**

```bash
bun test tests/unit/tui/workspace-controller.test.ts tests/integration/tui-workflow.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add tests/unit/tui/workspace-controller.test.ts tests/integration/tui-workflow.test.ts src/tui/workspace-controller.ts && git commit -m "test: cover tui create delete prompts"
```

---

## Task 6: Make interactive smoke dependency handling actionable

**Files:**

- Modify: `scripts/smoke-opentui-interactive.ts`
- Modify: `README.md`
- Modify: `docs/architecture/runtime-and-dependencies.md`
- Test: add focused helper test if this script has testable exported helpers, otherwise add clear runtime precheck.

**Step 1: Add a failing missing-dependency expectation**

Run in the current environment:

```bash
bun run smoke:opentui:interactive
```

Expected current failure: obscure `tmux: command not found` / `Failed to launch ... null`.

**Step 2: Implement explicit precheck before first tmux call**

At the top of `scripts/smoke-opentui-interactive.ts`, add a helper equivalent to:

```ts
function ensureCommandAvailable(command: string, installHint: string): void {
  const result = spawnSync("bash", ["-lc", `command -v ${command}`], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    timeout: 2_000,
  })
  if (result.status !== 0) {
    throw new Error(`${command} is required for interactive OpenTUI smoke tests. ${installHint}`)
  }
}
```

Call before any session setup:

```ts
ensureCommandAvailable("tmux", "Install tmux or run the non-interactive smoke with `bun run smoke:opentui`.")
```

**Step 3: Update docs**

Document that `bun run smoke:opentui:interactive` requires `tmux` in:

- `README.md`
- `docs/architecture/runtime-and-dependencies.md`

Keep wording scoped to development verification only; do not imply BlueNote runtime requires `tmux`.

**Step 4: Verify missing dependency output**

Run:

```bash
bun run smoke:opentui:interactive
```

Expected in this environment if `tmux` is still missing: clear actionable error containing:

```text
tmux is required for interactive OpenTUI smoke tests
```

If `tmux` is installed later, expected: full interactive smoke passes.

**Step 5: Run docs/CLI verification**

```bash
bun run typecheck
bun test
bun run smoke:opentui
bun run smoke:cli
```

Expected: PASS.

**Step 6: Commit**

```bash
git add scripts/smoke-opentui-interactive.ts README.md docs/architecture/runtime-and-dependencies.md && git commit -m "chore: clarify opentui interactive smoke dependency"
```

---

## Task 7: User-perspective visual polish review before any color/layout code change

**Files:**

- Modify if findings are confirmed: `src/tui/theme.ts`, `src/tui/render-manager.ts`, `src/tui/render-editor.ts`, `src/tui/render-search-everything.ts`
- Modify tests as needed: `tests/unit/tui/render-view-models.test.ts`, `tests/integration/docs-phase3-tui.test.ts`
- Modify docs if accepted UI contract changes: `README.md`, `docs/product/overview.md`, `docs/architecture/runtime-and-dependencies.md`

**Step 1: Retry real visual capture**

Run:

```text
mcp_computer_use_linux_doctor
mcp_computer_use_linux_list_windows
mcp_computer_use_linux_screenshot(window_id=<Ubuntu Terminal window id>)
```

Expected: screenshot capture works. If it still fails with portal denial, do not mark visual acceptance complete.

**Step 2: If screenshot capture works, re-run visual scenarios**

Use the existing manual QA plan scenarios A/B/D/F/I/K. Capture Manager, Editor, Search Everything, Unicode, and responsive sizes. Rate each screen with the rubric in `docs/plans/2026-05-28-phase-4-tui-manual-qa-plan.md`.

**Step 3: Only if a concrete visual defect is confirmed, write RED tests first**

Examples:

- If selected text contrast is poor, add a theme test asserting a revised accessible color token.
- If top/bottom bars overlap at narrow width, add a render view-model width test that asserts hidden shortcut count/truncation.
- If Search Everything preview border artifacts are real in terminal, add a render snapshot/view-model test for clean separated sections.

**Step 4: Implement minimal visual change**

Keep palette restrained: blue focus/accent, muted metadata, green saved/enabled, orange saving, red danger/error. Avoid adding broad decorative colors.

**Step 5: Verify**

```bash
bun test tests/unit/tui/render-view-models.test.ts tests/integration/docs-phase3-tui.test.ts
bun run typecheck
bun test
bun run smoke:opentui
bun run smoke:cli
```

Expected: PASS. `bun run smoke:opentui:interactive` should either pass if `tmux` is installed or fail with the clear dependency message from Task 6.

**Step 6: Commit only confirmed visual fixes**

```bash
git add src/tui/theme.ts src/tui/render-manager.ts src/tui/render-editor.ts src/tui/render-search-everything.ts tests/unit/tui/render-view-models.test.ts tests/integration/docs-phase3-tui.test.ts README.md docs/product/overview.md docs/architecture/runtime-and-dependencies.md && git commit -m "style: refine tui visual polish"
```

If no visual product defect is confirmed because screenshots remain blocked, do not commit speculative color/layout changes.

---

## Final verification before finish-branch flow

Run from `/home/hainn/blue/code/bluenote-term`:

```bash
bun run typecheck
bun test
bun run smoke:opentui
bun run smoke:opentui:interactive
bun run smoke:cli
git status --short --branch
```

Acceptance:

- Typecheck passes.
- Test suite passes.
- Non-interactive TUI and CLI smoke pass.
- Interactive smoke either passes or fails with the new explicit `tmux` dependency message if `tmux` remains unavailable.
- No unplanned source/docs changes remain.
- Manual QA results are updated with any new real screenshot evidence or a clear still-blocked reason.

## Execution mode

Recommended execution mode: **subagent-driven**, one implementer per task with spec-review and code-quality review after each task. Parent session must re-run the task’s targeted verification before accepting each task.
