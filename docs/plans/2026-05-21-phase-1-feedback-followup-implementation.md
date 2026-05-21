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