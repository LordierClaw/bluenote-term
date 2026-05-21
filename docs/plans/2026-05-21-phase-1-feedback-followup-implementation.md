# Phase 1 Feedback Follow-up Implementation Plan

> **For implementer:** Use TDD throughout. Write or adjust the failing test first, watch it fail for the intended reason, then implement the minimum change to make it pass.

**Goal:** Reconcile the current `feat/phase-1-cli-workflows` branch with the user's feedback by pausing old-plan execution, explicitly reviewing the current branch state against the requested real e2e + test cleanup work, and only proceeding under this updated plan.

**Architecture:** Treat the current branch contents as a candidate implementation, not automatically accepted output. First audit and align the branch against the user's feedback and approved design constraints, then either keep/refine the existing changes or selectively roll back anything that does not match this updated plan.

**Tech Stack:** Bun, TypeScript, Node test runner, existing BlueNote CLI entrypoint, repo smoke scripts.

---

## Current corrective note

This follow-up plan exists because implementation continued from the earlier Phase 1 plan after the user gave additional planning feedback. No further implementation work should proceed until this updated plan is reviewed and approved.

Planning-artifact convention has also now been normalized: `docs/plans/` is the canonical in-repo home for plans, while `.hermes/plans/` is treated as a legacy location only. Any follow-up references or migrations in this branch should preserve that convention.

---

## Task 1: Audit the current branch against the updated feedback

**Files:**
- Review: `docs/plans/2026-05-21-phase-1-cli-storage-implementation.md`
- Review: `docs/plans/2026-05-21-phase-1-cli-storage-design.md`
- Review: `tests/e2e/phase-1-cli-workflow.test.ts`
- Review: `tests/helpers/cli.ts`
- Review: `tests/helpers/note-fixtures.ts`
- Review: `tests/integration/*.ts`
- Review: `package.json`
- Review: `scripts/smoke-cli.ts`

**Step 1: Write the failing audit checklist first**
Create a short checklist in the task notes or worklog covering the feedback requirements:
- real e2e test uses the actual CLI entrypoint
- no fake repository/index mocking in e2e coverage
- test cleanup reduces duplication instead of moving it around
- assertions are stable, not date-brittle or env-brittle
- docs/plan alignment is explicit

**Step 2: Run the narrowest verification commands**
Commands:
```bash
bun test tests/e2e/phase-1-cli-workflow.test.ts
bun test tests/integration/cli-edit.test.ts tests/integration/cli-archive.test.ts
```
Expected: PASS, but the audit may still reveal plan-compliance issues.

**Step 3: Record keep/fix/revert decisions before editing code**
For each currently changed file, classify it as:
- keep as-is
- keep but adjust
- revert

**Step 4: Do not implement further until the audit result is written down**
The output of this task is a branch-state decision list, not code churn.

### Audit result

Verification run on current branch:
- `bun test tests/e2e/phase-1-cli-workflow.test.ts`
- `bun test tests/integration/cli-edit.test.ts tests/integration/cli-archive.test.ts`
- Result: PASS

Checklist against updated feedback:
- [x] Real e2e test uses the actual CLI entrypoint — `tests/helpers/cli.ts` runs `bun run <repo>/bin/bn.ts`, and `tests/e2e/phase-1-cli-workflow.test.ts` exercises the full workflow through that entrypoint.
- [x] No fake repository/index mocking in e2e coverage — the e2e workflow creates on-disk notes, runs `rebuild`, checks `.bluenote/metadata.sqlite` and `.bluenote/search-index.json`, and asserts `list/search/show/edit/archive` behavior without repository or index stubs.
- [x] Test cleanup reduces duplication instead of only moving it around — `tests/helpers/cli.ts` centralizes managed-root setup, CLI invocation, cleanup, fake-editor creation, and blocked-root fixtures; `tests/helpers/note-fixtures.ts` centralizes canonical note Markdown generation and timestamp matching.
- [x] Assertions are stable, not date-brittle or env-brittle — archive timestamps use `timestampFieldPattern(...)` instead of wall-clock exact matches, fixture notes use explicit timestamps, and the missing-editor integration test proves `EDITOR: undefined` removes inherited environment state.
- [x] Docs/plan alignment is explicit — `docs/plans/2026-05-21-phase-1-cli-storage-implementation.md` already contains dedicated smoke coverage in Task 11 plus explicit real-e2e and test-cleanup tasks in Tasks 13 and 14; the remaining documentation work is only to cross-reference this feedback follow-up so the planning history stays clear.

Keep/fix/revert decisions before further implementation:
- Keep/fix/revert decision for the audit write-up itself: `docs/plans/2026-05-21-phase-1-feedback-followup-implementation.md` — **keep but adjust**; this audit write-up belongs here, and the later Task 4 docs-alignment pass records the small follow-up note.
- Audited branch files relevant to the feedback scope:
  - `tests/e2e/phase-1-cli-workflow.test.ts` — **keep as-is**
  - `tests/helpers/cli.ts` — **keep as-is**
  - `tests/helpers/note-fixtures.ts` — **keep as-is**
  - `tests/integration/cli-edit.test.ts` — **keep as-is**
  - `tests/integration/cli-archive.test.ts` — **keep as-is**
  - `tests/integration/cli-init.test.ts` — **keep as-is**
  - `tests/integration/cli-new.test.ts` — **keep as-is**
  - `package.json` — **keep as-is**
  - `scripts/smoke-cli.ts` — **keep as-is**
  - `docs/plans/2026-05-21-phase-1-cli-storage-implementation.md` — **keep as-is** for scope coverage; Task 4 should only add a light cross-reference to this feedback follow-up if needed for planning-history clarity.
  - `docs/plans/2026-05-21-phase-1-cli-storage-design.md` — **keep as-is**; design still matches the implemented command-first CLI direction.

Branch-state decision for Task 1:
- Keep the current real CLI/e2e and integration harness changes.
- Do not revert the current test helpers or smoke coverage.
- No additional e2e-contract or harness-cleanup gaps were confirmed during this audit, so Tasks 2 and 3 should stay verification-only unless later review uncovers a concrete missing contract or brittle harness behavior.
- Reserve Task 4 for minimal planning-history alignment, not for re-describing already documented e2e and cleanup scope.

---

## Task 2: Lock down the real e2e contract with explicit failing coverage if needed

**Files:**
- Modify as needed: `tests/e2e/phase-1-cli-workflow.test.ts`
- Modify as needed: `tests/helpers/cli.ts`
- Modify as needed: `tests/helpers/note-fixtures.ts`

**Step 1: Add or adjust the failing test first**
If the audit found any missing contract coverage, encode it first in `tests/e2e/phase-1-cli-workflow.test.ts`.
Possible examples:
- actual `bin/bn.ts` entrypoint use
- on-disk artifact assertions
- explicit stdout/stderr and exit-code checks
- archive visibility changes in both `list` and `search`

**Step 2: Run test — confirm it fails for the intended gap**
Command:
```bash
bun test tests/e2e/phase-1-cli-workflow.test.ts
```
Expected: FAIL only if a real missing contract was identified.

**Step 3: Implement the minimum helper or assertion change**
Only make the smallest change needed to satisfy the missing e2e contract.

**Step 4: Run test — confirm it passes**
Command:
```bash
bun test tests/e2e/phase-1-cli-workflow.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add tests/e2e/phase-1-cli-workflow.test.ts tests/helpers/cli.ts tests/helpers/note-fixtures.ts && git commit -m "test: align phase 1 e2e workflow with feedback"
```
Only commit if code changed during this task.

### Task 2 verification result

- Re-ran `bun test tests/e2e/phase-1-cli-workflow.test.ts` on the current branch: PASS.
- Verified the required real-e2e contract is already covered: the harness invokes the actual `bin/bn.ts` entrypoint, assertions check real filesystem artifacts plus explicit stdout/stderr and exit codes, archive behavior is verified in both `list` and `search`, and the workflow uses no repository/index mocks.
- Outcome: no remaining real e2e contract gap was found, so no test or helper code change was required for Task 2.

---

## Task 3: Normalize the test harness without hiding test intent

**Files:**
- Modify as needed: `tests/helpers/cli.ts`
- Modify as needed: `tests/helpers/note-fixtures.ts`
- Modify as needed: `tests/integration/cli-init.test.ts`
- Modify as needed: `tests/integration/cli-new.test.ts`
- Modify as needed: `tests/integration/cli-edit.test.ts`
- Modify as needed: `tests/integration/cli-archive.test.ts`
- Modify as needed: `scripts/smoke-cli.ts`

**Step 1: Write the failing or brittle-case test first where behavior changes**
Examples:
- parent `EDITOR` env leaks into a missing-editor test
- archive assertions depend on wall-clock date text
- duplicated blocked-root or fake-editor setup drifts across tests

**Step 2: Run the targeted failing slice**
Command:
```bash
bun test tests/integration/cli-init.test.ts tests/integration/cli-new.test.ts tests/integration/cli-edit.test.ts tests/integration/cli-archive.test.ts
```
Expected: FAIL only for the cleanup issue being fixed.

**Step 3: Implement the minimum helper consolidation**
Cleanup rules:
- centralize only genuinely repeated harness logic
- keep test bodies readable and explicit
- prefer helper reuse for env setup, temp roots, and fake editor scripts
- avoid introducing abstraction that hides what the test is asserting

**Step 4: Run test slice — confirm it passes**
Command:
```bash
bun test tests/integration/cli-init.test.ts tests/integration/cli-new.test.ts tests/integration/cli-edit.test.ts tests/integration/cli-archive.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add tests/helpers/cli.ts tests/helpers/note-fixtures.ts tests/integration/cli-init.test.ts tests/integration/cli-new.test.ts tests/integration/cli-edit.test.ts tests/integration/cli-archive.test.ts scripts/smoke-cli.ts && git commit -m "test: normalize phase 1 cli test harness"
```
Only commit if code changed during this task.

### Task 3 verification result

- Re-ran `bun test tests/integration/cli-init.test.ts tests/integration/cli-new.test.ts tests/integration/cli-edit.test.ts tests/integration/cli-archive.test.ts`: PASS.
- Re-verified the cleanup goals across the current harness:
  - `tests/helpers/cli.ts` already supports subprocess env unsetting via `buildCommandEnv(...)` deleting keys whose override value is `undefined`, and `tests/integration/cli-edit.test.ts` explicitly covers the `EDITOR` leak case.
  - `tests/helpers/note-fixtures.ts` already provides `timestampFieldPattern(...)`, and archive coverage uses it instead of wall-clock-equality assertions.
  - Managed temp-root, fake-editor, and blocked-root setup is centralized in `tests/helpers/cli.ts` where it removes repetition, while individual tests still keep setup/assertion details inline enough to preserve intent.
  - `scripts/smoke-cli.ts` stays small and explicit, so additional helper abstraction is not needed there.
- Outcome: no remaining test-harness cleanup gap was found, so no code change was required for Task 3 beyond recording this verification result.

---

## Task 4: Align docs and planning artifacts with the feedback-adjusted scope

**Files:**
- Modify: `docs/plans/2026-05-21-phase-1-cli-storage-implementation.md`
- Modify: `docs/plans/2026-05-21-phase-1-feedback-followup-implementation.md`
- Modify as needed: `README.md`

**Step 1: Add the failing documentation check first**
Before editing, identify the exact mismatch between:
- what the user requested
- what the plan said
- what the branch currently contains

**Step 2: Update docs minimally but explicitly**
Document:
- that real e2e CLI coverage is part of the Phase 1 verification story
- that test cleanup includes helper normalization and brittle-assertion fixes
- that follow-up planning was required because feedback changed execution expectations

**Step 3: Verify docs reflect the current code**
Commands:
```bash
bun test tests/e2e/phase-1-cli-workflow.test.ts
bun run smoke:cli
```
Expected: PASS; docs should not claim behavior that the tests do not prove.

**Step 4: Commit**
```bash
git add docs/plans/2026-05-21-phase-1-cli-storage-implementation.md docs/plans/2026-05-21-phase-1-feedback-followup-implementation.md README.md && git commit -m "docs: align phase 1 workflow plan with feedback"
```
Only commit if docs changed during this task.

### Task 4 verification result

- Added a short planning-history note to `docs/plans/2026-05-21-phase-1-cli-storage-implementation.md` instead of re-describing scope that was already explicit in Tasks 11, 13, and the helper-normalization parts of Task 14.
- Confirmed the earlier Phase 1 implementation plan already documents:
  - CLI smoke verification in Task 11,
  - real end-to-end CLI workflow coverage through the actual entrypoint in Task 13,
  - helper/harness cleanup and fixture deduplication in Task 14.
- Kept the brittle-assertion and env-stability verification history in this follow-up plan, because that detail was validated during the later feedback-driven audit rather than spelled out in the original implementation plan.
- Updated `README.md` because its Phase 0 / placeholder-only implementation note was misleading relative to the current branch, which now contains Phase 1 CLI implementation and verification artifacts.
- Re-ran the Task 4 verification commands after the doc edits:
  - `bun test tests/e2e/phase-1-cli-workflow.test.ts`
  - `bun run smoke:cli`
  - Result: PASS

---

## Task 5: Final verification and branch disposition check

**Files:**
- Review/modify as needed: all files touched in Tasks 1–4

**Step 1: Run the full repo verification gate**
Commands:
```bash
bun run typecheck
bun test
bun run smoke:opentui
bun run smoke:cli
git status --short
```
Expected: PASS and only intentional changes remain.

**Step 2: Run review passes**
Run:
- spec-compliance review against this follow-up plan
- code-quality review for test clarity and maintainability

**Step 3: Decide branch outcome only after review passes**
Possible outcomes:
- keep current changes
- adjust current changes
- selectively revert premature old-plan changes

**Step 4: Commit final polish only if necessary**
```bash
git add . && git commit -m "chore: finish feedback follow-up verification"
```
Only if a final small polish change was required.

---

## Suggested execution order rationale

1. Audit first so current branch state is explicitly evaluated instead of assumed correct.
2. Lock down the real e2e contract before cleanup abstractions spread.
3. Normalize helpers only after the desired test behavior is fixed.
4. Update docs only after code/test behavior is aligned.
5. Re-run the full verification gate before deciding whether to keep or revise the branch.

---

## Stop condition

Do not continue implementation from the earlier Phase 1 plan until this follow-up plan is explicitly approved.