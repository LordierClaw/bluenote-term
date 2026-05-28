# Phase 4E Autosave Atomicity Implementation Plan

## Status

Draft for approval.

This plan implements the approved design in `docs/plans/2026-05-28-phase-4e-autosave-atomicity-design.md`.

Do not confuse this with previous Phase 3 TUI refinement plans or the completed Phase 4D Search Everything plan. Phase 4E is specifically about real-app TUI save/autosave persistence and shared atomic note-body writes.

## Scope guardrails

- Keep note files as plain Markdown with no frontmatter.
- Keep BlueNote metadata under `.data` sidecars/state.
- Do not add recovery copies, recovery prompts, or recovery lists.
- Keep autosave delay at `750ms`.
- Do not redesign create/archive/delete/rename transactions.
- Start with reproduction/root-cause coverage for the current real-app save/autosave failure before implementing the atomic writer.
- Do not treat visible `Saved` text as proof; verify actual note file content on disk.

## Execution model

Use subagent-driven TDD, one task at a time:

1. Implementer subagent writes/updates tests first and watches them fail when applicable.
2. Implementer adds the minimal code to pass.
3. Parent rereads changed files and reruns the task verification.
4. Spec reviewer subagent checks the task against this plan and the approved design.
5. Quality reviewer subagent checks maintainability, scope, and regression risk.
6. Parent commits the completed task before moving on.

If any task discovers the root cause is outside its expected file set, stop and update this plan/design before broadening scope.

## Task 1 — Add real TUI persistence regression and isolate current failure

### Goal

Create a reliable regression/harness that proves real TUI editor typing persists to the actual Markdown note file after autosave and manual save.

### Files

Likely files:

- `scripts/smoke-opentui-interactive.ts`
- `tests/integration/tui-workflow.test.ts` if a non-tmux integration helper is better for a narrow failure probe
- Optional small test helper under `tests/helpers/` only if it reduces duplication

### RED

Add or extend coverage that:

1. Initializes a temporary BlueNote root.
2. Creates at least one openable note.
3. Opens the note through the same runtime input path used by the interactive TUI smoke or the closest trustworthy harness.
4. Types a unique token into the editor.
5. Waits beyond the `750ms` autosave interval.
6. Reads the actual note file from disk and asserts the token is present.
7. Types another unique token or resets content.
8. Sends `Ctrl+S`/manual save and asserts the actual note file contains the manual-save token.

The test must fail or expose the current manual-test failure before implementation changes if the bug is reproducible in automation.

If the existing interactive smoke path cannot reliably open a note due to Manager navigation shape, first diagnose whether that is a harness issue or a real navigation regression. Keep that finding scoped to this task.

### GREEN

No product fix is required in this task unless the root cause is a tiny test-harness issue. The output of this task should be:

- a committed regression/diagnostic test or smoke assertion that verifies file contents,
- a written root-cause note in the commit message or plan task notes if the current failure is identified,
- no weakening of existing interactive smoke assertions.

### Verify

- Run the new targeted persistence test/smoke path.
- Run `bun run smoke:opentui:interactive` if changed.
- Run `bun test tests/integration/tui-workflow.test.ts` if changed.
- Run `bun run typecheck`.

### Parent acceptance

Parent must inspect actual note-file assertions and confirm the test does not only check UI text.

## Task 2 — Fix root cause of current TUI save/autosave failure

### Goal

Fix the current user-reported failure that autosave/manual save do not work in the real app, based on Task 1 evidence.

### Files

Likely files depending on root cause:

- `src/tui/app.ts` for runtime key/input routing and default controller wiring
- `src/tui/workspace-controller.ts` for save/autosave state transitions
- `src/tui/render-editor.ts` or related route files for documented key path mismatch
- `scripts/smoke-opentui-interactive.ts` or integration tests for regression coverage

### RED

Use the failing Task 1 regression. If Task 1 only produced a diagnostic that passes in automation but manual failure remains credible, add the narrowest failing unit/integration test for the identified gap before changing product code.

### GREEN

Fix the root cause without masking it. Examples:

- If runtime key routing does not deliver `Ctrl+S`, fix routing and help text together.
- If editor text reaches UI but not controller body, fix controlled input routing.
- If autosave schedules but does not persist, fix scheduler/save invocation.
- If save reports success but file is unchanged, fix persistence path and state updates.
- If index refresh hides the updated note, fix refresh ordering without weakening persistence.

Do not implement the full atomic writer in this task unless the root cause is exactly the direct write path and no smaller root-cause fix exists.

### Verify

- New real persistence regression passes.
- Relevant unit/integration route tests pass.
- `bun run smoke:opentui:interactive` passes.
- `bun run typecheck` passes.

### Parent acceptance

Parent must verify actual file content changes after both autosave and manual save.

## Task 3 — Add storage atomic note-body writer tests and helper

### Goal

Introduce a storage-level atomic note-body replacement helper with cleanup behavior, independent of repository integration.

### Files

Likely files:

- New `src/storage/atomic-note-writer.ts` or equivalent
- New `tests/unit/storage/atomic-note-writer.test.ts`
- Possibly `src/storage/root-layout.ts` if a `.data/tmp` path helper is needed

### RED

Write tests first for:

- successful replacement of a target note body,
- temp file is created only in the approved BlueNote temp location or with an exact safe naming pattern,
- failed temp write or injected failure leaves the original note body unchanged,
- cleanup removes only stale BlueNote temp files,
- cleanup does not touch normal `.md` notes or unrelated temp files.

Prefer dependency injection for filesystem operations where needed so failure modes are deterministic instead of relying on chmod behavior.

### GREEN

Implement the minimal helper:

- validates target path is under the managed root,
- writes to a BlueNote-owned temp path,
- flushes/closes as safely as practical in the current runtime,
- renames temp file over the target,
- best-effort removes temp files on failure,
- exposes cleanup for stale writer temp files.

### Verify

- `bun test tests/unit/storage/atomic-note-writer.test.ts`
- `bun run typecheck`

### Parent acceptance

Parent must inspect path-safety and cleanup matching rules to ensure unrelated files cannot be deleted.

## Task 4 — Route repository `syncEditedNote()` through atomic writer

### Goal

Use the shared atomic writer for the existing repository edit/sync body write path.

### Files

Likely files:

- `src/storage/note-repository.ts`
- `tests/unit/storage/note-repository.test.ts`
- `tests/integration/note-repository.test.ts`
- `src/storage/atomic-note-writer.ts`

### RED

Add repository tests proving:

- `syncEditedNote()` updates the plain Markdown body on success,
- body write failure preserves the previous note body,
- sidecar metadata remains aligned after success,
- sidecar failure after body write preserves or clearly reports rollback behavior consistent with existing repository semantics,
- the note file remains frontmatter-free.

### GREEN

Replace direct `writeFileSync(normalizedNotePath, updatedMarkdown, "utf8")` in `syncEditedNote()` with the atomic writer.

Review rollback behavior:

- rollback writes should use the same helper where safe,
- do not introduce broad create/archive/delete/rename transaction changes,
- keep existing `UsageError` wrapping and hints unless the new writer requires clearer wording.

### Verify

- `bun test tests/unit/storage/note-repository.test.ts tests/integration/note-repository.test.ts`
- `bun run typecheck`

### Parent acceptance

Parent must inspect that only edit/sync body writes changed, not broad note lifecycle operations.

## Task 5 — Wire stale temp cleanup into safe lifecycle point

### Goal

Ensure stale BlueNote atomic writer temp files are cleaned up safely without adding recovery behavior.

### Files

Likely files:

- `src/storage/atomic-note-writer.ts`
- `src/storage/root-layout.ts` or root initialization/rebuild surface
- `src/core/rebuild-indexes.ts` or root bootstrap code if selected
- Tests matching the selected integration point

### RED

Add coverage that:

- stale BlueNote writer temp files are removed from the approved temp location,
- unrelated files are preserved,
- normal note files are preserved,
- cleanup failure is surfaced or safely ignored according to the helper contract.

### GREEN

Call cleanup at one safe lifecycle point chosen from the design:

- app/root initialization,
- `bn rebuild`,
- TUI bootstrap.

Prefer the narrowest point that protects TUI/editor workflows without surprising unrelated commands.

### Verify

- Targeted cleanup tests.
- `bun run smoke:cli` if rebuild/root lifecycle changes.
- `bun run typecheck`.

### Parent acceptance

Parent must confirm no recovery-copy/prompt/list behavior was added.

## Task 6 — Strengthen TUI save/autosave failure semantics against atomic writer failures

### Goal

Ensure TUI autosave/manual save state remains correct when the shared writer fails.

### Files

Likely files:

- `src/tui/workspace-controller.ts`
- `tests/unit/tui/workspace-controller.test.ts`
- `tests/integration/tui-workflow.test.ts` if default controller integration is needed

### RED

Add/adjust tests proving:

- autosave failure keeps editor dirty and `autosaveStatus: "error"`,
- manual save failure keeps editor dirty and visible failure status,
- stale autosave completion cannot mark newer buffer content clean,
- successful retry after failure can mark the current buffer clean.

Tests should model failures as pre-write failures where the note file remains unchanged, not partial persistence pretending to succeed.

### GREEN

Adjust controller save/autosave handling only if needed after repository/atomic writer integration.

### Verify

- `bun test tests/unit/tui/workspace-controller.test.ts tests/integration/tui-workflow.test.ts`
- New real persistence regression from Task 1.
- `bun run typecheck`

### Parent acceptance

Parent must verify state behavior matches the no-recovery-copy design.

## Task 7 — Docs, help, and smoke alignment

### Goal

Update user-facing docs/status/smoke metadata for Phase 4E save behavior without broad roadmap churn.

### Files

Likely files:

- `README.md`
- `docs/product/overview.md`
- `docs/architecture/managed-root-layout.md`
- `docs/architecture/runtime-and-dependencies.md`
- `docs/phases/phase-4-search-editing-and-recovery.md`
- `scripts/smoke-opentui-interactive.ts`
- Related docs/help tests if they assert phase text or smoke status metadata

### RED

Run existing docs/help tests and add narrowly scoped assertions only if there is no coverage for the updated save contract.

### GREEN

Document:

- autosave and manual `Ctrl+S` share the safe note-body write path,
- failed saves keep the buffer dirty and retry later,
- no recovery-copy workflow exists in 4E,
- stale temp files are BlueNote-owned internal implementation detail.

Do not rewrite unrelated phase numbering or status surfaces beyond what Phase 4E completion requires.

### Verify

- Relevant docs/help tests.
- `bun run smoke:opentui`
- `bun run smoke:opentui:interactive`
- `bun run typecheck`

### Parent acceptance

Parent must inspect docs for consistency with the no-recovery-copy contract.

## Task 8 — Final verification and reviews

### Goal

Finish Phase 4E with full verification, final reviews, and branch handoff options.

### Steps

1. Run focused Phase 4E tests:
   - atomic writer tests,
   - repository edit tests,
   - TUI workspace/controller tests,
   - real TUI persistence regression.
2. Run the full project gate:
   - `bun run typecheck`
   - `bun test`
   - `bun run smoke:opentui`
   - `bun run smoke:opentui:interactive`
   - `bun run smoke:cli`
   - `git status --short --branch`
3. Dispatch final spec review over the full Phase 4E range.
4. Dispatch final quality review over the full Phase 4E range.
5. Fix any blockers and repeat reviews.
6. Present finish-branch options.

### Acceptance

- Full verification is green.
- Real note file persistence is proven for autosave and manual save.
- No recovery-copy workflow was introduced.
- Note files remain plain Markdown.
- Branch handoff includes current branch, base branch, verification commands, latest commit, and known follow-ups.
