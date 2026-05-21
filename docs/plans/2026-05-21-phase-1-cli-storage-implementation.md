# Phase 1 CLI + Storage Implementation Plan

> **For implementer:** Use TDD throughout. Write failing test first. Watch it fail. Then implement.

**Goal:** Build BlueNote Phase 1 as a command-first CLI with a thin CLI layer over reusable services for managed-root initialization, Markdown/frontmatter note storage, rebuildable indexing, and basic `$EDITOR` handoff.

**Architecture:** Keep `bin/` and `src/cli/` focused on parsing, dispatch, output, and exit codes. Put product rules in `src/core/`, canonical file behavior in `src/storage/`, rebuildable search/index behavior in `src/index/`, root/config behavior in `src/config/`, and editor/process adapters in `src/platform/`.

**Tech Stack:** Bun, TypeScript, `js-yaml`, `sql.js`, MiniSearch, Bun test, Node `assert`, existing `bin/bn.ts` entrypoint.

---

## Scope baseline

This plan implements the approved design in `docs/plans/2026-05-21-phase-1-cli-storage-design.md`.

Target commands by the end of the plan:
- `bn init`
- `bn new`
- `bn list`
- `bn show <selector>`
- `bn search <query>`
- `bn edit <selector>`
- `bn archive <selector>`
- `bn rebuild`

Out of scope for this plan:
- TUI feature work
- sync/cloud/AI functionality
- templates, `today`, `scratch`, `doctor`
- interactive selector resolution prompts

---

## Planning history note

The main Phase 1 implementation plan already covers the core verification/build-out topics:
- CLI smoke verification in Task 11
- real end-to-end CLI workflow coverage via the actual entrypoint in Task 13
- helper/harness normalization in Task 14

The later follow-up plan at `docs/plans/2026-05-21-phase-1-feedback-followup-implementation.md` records the additional audit plus brittle-assertion/env-stability verification pass that was added after feedback changed execution expectations.

---

## Execution rules

- Keep each task tightly scoped.
- Use exact file paths listed in the task.
- Do not add features outside the task.
- After each green test, make a small commit.
- Run the repo verification gate before declaring the full plan complete:
  - `bun run typecheck`
  - `bun test`
  - `bun run smoke:opentui`
  - `bun run smoke:cli`
  - `git status`

---

## Task 1: Establish core domain types and error mapping

**Files:**
- Create: `src/core/errors.ts`
- Create: `src/core/types.ts`
- Modify: `src/cli/entry.ts`
- Test: `tests/unit/core/errors.test.ts`
- Test: `tests/unit/cli/entry-errors.test.ts`

**Step 1: Write the failing tests**
Add tests that define these behaviors:
- `tests/unit/core/errors.test.ts`
  - `AppError` subclasses expose `code`, `message`, and optional `hint`
  - distinct error classes exist for `RootNotInitialized`, `AmbiguousSelector`, `InvalidFrontmatter`, `EditorLaunch`, and `IndexUnavailable`
- `tests/unit/cli/entry-errors.test.ts`
  - CLI formatter maps validation/data errors to exit code `2`
  - CLI formatter maps usage/operational errors to exit code `1`

**Step 2: Run test — confirm it fails**
Command:
```bash
bun test tests/unit/core/errors.test.ts tests/unit/cli/entry-errors.test.ts
```
Expected: FAIL because the new modules/functions do not exist.

**Step 3: Write minimal implementation**
Implement:
- `src/core/errors.ts`
  - base `AppError extends Error`
  - subclasses:
    - `UsageError`
    - `RootNotInitializedError`
    - `InvalidFrontmatterError`
    - `AmbiguousSelectorError`
    - `EditorLaunchError`
    - `IndexUnavailableError`
- `src/core/types.ts`
  - shared result/type aliases needed by later tasks
- `src/cli/entry.ts`
  - add a small helper that maps `AppError` instances to exit codes/messages without yet changing command behavior beyond test coverage

**Step 4: Run test — confirm it passes**
Command:
```bash
bun test tests/unit/core/errors.test.ts tests/unit/cli/entry-errors.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/core/errors.ts src/core/types.ts src/cli/entry.ts tests/unit/core/errors.test.ts tests/unit/cli/entry-errors.test.ts && git commit -m "feat: add core app errors and cli error mapping"
```

---

## Task 2: Add managed-root config and path safety helpers

**Files:**
- Create: `src/config/root.ts`
- Create: `src/platform/path-safety.ts`
- Test: `tests/unit/config/root.test.ts`
- Test: `tests/unit/platform/path-safety.test.ts`

**Step 1: Write the failing tests**
Add tests for:
- default root resolves to `~/.bluenote` when no override is provided
- `BLUENOTE_ROOT` environment override is honored
- relative override paths resolve to absolute paths
- path safety helper rejects paths escaping the managed root
- path safety helper accepts paths inside the managed root

**Step 2: Run test — confirm it fails**
Command:
```bash
bun test tests/unit/config/root.test.ts tests/unit/platform/path-safety.test.ts
```
Expected: FAIL because root/path helper modules do not exist.

**Step 3: Write minimal implementation**
Implement:
- `src/config/root.ts`
  - `resolveBlueNoteRoot(options?)`
  - environment override support
  - absolute-path normalization
- `src/platform/path-safety.ts`
  - helper to assert a target path remains inside the root
  - helper to compute root-relative paths safely

**Step 4: Run test — confirm it passes**
Command:
```bash
bun test tests/unit/config/root.test.ts tests/unit/platform/path-safety.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/config/root.ts src/platform/path-safety.ts tests/unit/config/root.test.ts tests/unit/platform/path-safety.test.ts && git commit -m "feat: add root resolution and path safety helpers"
```

---

## Task 3: Implement managed-root initialization service and `bn init`

**Files:**
- Create: `src/storage/root-layout.ts`
- Create: `src/core/init-root.ts`
- Modify: `src/cli/entry.ts`
- Test: `tests/unit/storage/root-layout.test.ts`
- Test: `tests/integration/cli-init.test.ts`

**Step 1: Write the failing tests**
Add tests for:
- root layout creation makes:
  - `notes/inbox/`
  - `notes/journal/`
  - `notes/archive/`
  - `scratches/`
  - `templates/`
  - `.bluenote/`
  - `.bluenote/recovery/`
  - `.bluenote/tmp/`
  - `.bluenote/logs/`
- `bn init` exits `0` and reports the initialized root
- second `bn init` is idempotent and does not fail

**Step 2: Run test — confirm it fails**
Command:
```bash
bun test tests/unit/storage/root-layout.test.ts tests/integration/cli-init.test.ts
```
Expected: FAIL because the init service/command does not exist.

**Step 3: Write minimal implementation**
Implement:
- `src/storage/root-layout.ts`
  - constant layout definition
  - `ensureManagedRoot(rootPath)`
- `src/core/init-root.ts`
  - use-case wrapper returning a CLI-friendly summary
- `src/cli/entry.ts`
  - parse `init`
  - call service and print success text

**Step 4: Run test — confirm it passes**
Command:
```bash
bun test tests/unit/storage/root-layout.test.ts tests/integration/cli-init.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/storage/root-layout.ts src/core/init-root.ts src/cli/entry.ts tests/unit/storage/root-layout.test.ts tests/integration/cli-init.test.ts && git commit -m "feat: implement managed root initialization"
```

---

## Task 4: Implement note model and frontmatter codec

**Files:**
- Create: `src/storage/note-schema.ts`
- Create: `src/storage/frontmatter.ts`
- Test: `tests/unit/storage/frontmatter.test.ts`
- Test: `tests/fixtures/invalid-frontmatter/missing-title.md`
- Test: `tests/fixtures/invalid-frontmatter/bad-yaml.md`

**Step 1: Write the failing tests**
Add tests for:
- parsing a valid Markdown note with YAML frontmatter
- serializing frontmatter/body back to canonical Markdown
- required fields: `id`, `schemaVersion`, `title`, `mode`, `tags`, `createdAt`, `updatedAt`
- invalid YAML raises `InvalidFrontmatterError`
- missing required fields raise `InvalidFrontmatterError`

**Step 2: Run test — confirm it fails**
Command:
```bash
bun test tests/unit/storage/frontmatter.test.ts
```
Expected: FAIL because codec/schema modules do not exist.

**Step 3: Write minimal implementation**
Implement:
- `src/storage/note-schema.ts`
  - TypeScript interfaces for note frontmatter and parsed notes
  - minimum validation helpers
- `src/storage/frontmatter.ts`
  - `parseNoteFile(markdownText, sourcePath)`
  - `serializeNoteFile(parsedNote)`
  - use `js-yaml`
  - preserve file-body separation cleanly

**Step 4: Run test — confirm it passes**
Command:
```bash
bun test tests/unit/storage/frontmatter.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/storage/note-schema.ts src/storage/frontmatter.ts tests/unit/storage/frontmatter.test.ts tests/fixtures/invalid-frontmatter/missing-title.md tests/fixtures/invalid-frontmatter/bad-yaml.md && git commit -m "feat: add note schema and frontmatter codec"
```

---

## Task 5: Implement note repository write/read and `bn new`

**Files:**
- Create: `src/storage/note-repository.ts`
- Create: `src/platform/clock.ts`
- Create: `src/platform/ids.ts`
- Create: `src/core/create-note.ts`
- Modify: `src/cli/entry.ts`
- Test: `tests/unit/storage/note-repository.test.ts`
- Test: `tests/integration/cli-new.test.ts`

**Step 1: Write the failing tests**
Add tests for:
- repository writes a new note to `notes/inbox/`
- note file contains valid frontmatter and body
- `bn new --title "Example"` creates a note and returns a created path or ID
- repeated note creation produces distinct IDs

**Step 2: Run test — confirm it fails**
Command:
```bash
bun test tests/unit/storage/note-repository.test.ts tests/integration/cli-new.test.ts
```
Expected: FAIL because repository/create-note logic does not exist.

**Step 3: Write minimal implementation**
Implement:
- `src/platform/clock.ts`
  - deterministic time provider interface with real system default
- `src/platform/ids.ts`
  - UUID generator wrapper with real implementation
- `src/storage/note-repository.ts`
  - create/read note file methods
  - default inbox path convention
- `src/core/create-note.ts`
  - create metadata, serialize, save, return summary
- `src/cli/entry.ts`
  - parse `new`
  - support minimum `--title` flag

**Step 4: Run test — confirm it passes**
Command:
```bash
bun test tests/unit/storage/note-repository.test.ts tests/integration/cli-new.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/storage/note-repository.ts src/platform/clock.ts src/platform/ids.ts src/core/create-note.ts src/cli/entry.ts tests/unit/storage/note-repository.test.ts tests/integration/cli-new.test.ts && git commit -m "feat: implement note creation flow"
```

---

## Task 6: Implement note listing and selector resolution

**Files:**
- Create: `src/core/select-note.ts`
- Create: `src/core/list-notes.ts`
- Modify: `src/storage/note-repository.ts`
- Modify: `src/cli/entry.ts`
- Test: `tests/unit/core/select-note.test.ts`
- Test: `tests/integration/cli-list-show.test.ts`
- Fixture: `tests/fixtures/ambiguous-selectors/`

**Step 1: Write the failing tests**
Add tests for:
- selectors resolve in this precedence:
  1. exact ID
  2. exact managed-root-relative path
  3. unique slug/title-derived match
  4. ambiguity raises `AmbiguousSelectorError`
- `bn list` shows existing note summaries
- `bn show <selector>` prints the matching note

**Step 2: Run test — confirm it fails**
Command:
```bash
bun test tests/unit/core/select-note.test.ts tests/integration/cli-list-show.test.ts
```
Expected: FAIL because selector/list/show logic does not exist.

**Step 3: Write minimal implementation**
Implement:
- `src/storage/note-repository.ts`
  - list note file paths and load parsed notes
- `src/core/select-note.ts`
  - selector precedence logic and ambiguity reporting
- `src/core/list-notes.ts`
  - list summaries from repository data
- `src/cli/entry.ts`
  - `list` and `show` commands with compact output

**Step 4: Run test — confirm it passes**
Command:
```bash
bun test tests/unit/core/select-note.test.ts tests/integration/cli-list-show.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/core/select-note.ts src/core/list-notes.ts src/storage/note-repository.ts src/cli/entry.ts tests/unit/core/select-note.test.ts tests/integration/cli-list-show.test.ts tests/fixtures/ambiguous-selectors && git commit -m "feat: add note listing and selector resolution"
```

---

## Task 7: Implement rebuildable metadata/text indexing and `bn rebuild`

**Files:**
- Create: `src/index/search-documents.ts`
- Create: `src/index/index-store.ts`
- Create: `src/core/rebuild-indexes.ts`
- Modify: `src/storage/note-repository.ts`
- Modify: `src/cli/entry.ts`
- Test: `tests/unit/index/index-store.test.ts`
- Test: `tests/integration/cli-rebuild.test.ts`
- Test: `tests/fixtures/duplicate-ids/duplicate-a.md`
- Test: `tests/fixtures/duplicate-ids/duplicate-b.md`

**Step 1: Write the failing tests**
Add tests for:
- rebuild scans note files and writes derived artifacts under `.bluenote/`
- duplicate IDs are reported as validation failures
- invalid frontmatter surfaces exact file errors
- `bn rebuild` exits `2` when validation failures are present
- deleting derived artifacts and re-running rebuild recreates them

**Step 2: Run test — confirm it fails**
Command:
```bash
bun test tests/unit/index/index-store.test.ts tests/integration/cli-rebuild.test.ts
```
Expected: FAIL because rebuild/index modules do not exist.

**Step 3: Write minimal implementation**
Implement:
- `src/index/search-documents.ts`
  - convert parsed notes to MiniSearch documents
- `src/index/index-store.ts`
  - persist/load derived search + metadata artifacts under `.bluenote/`
  - use `sql.js` only for metadata representation as designed
- `src/core/rebuild-indexes.ts`
  - full scan, validation aggregation, artifact rewrite, summary return
- `src/cli/entry.ts`
  - `rebuild` command and validation-aware exit code behavior

**Step 4: Run test — confirm it passes**
Command:
```bash
bun test tests/unit/index/index-store.test.ts tests/integration/cli-rebuild.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/index/search-documents.ts src/index/index-store.ts src/core/rebuild-indexes.ts src/storage/note-repository.ts src/cli/entry.ts tests/unit/index/index-store.test.ts tests/integration/cli-rebuild.test.ts tests/fixtures/duplicate-ids/duplicate-a.md tests/fixtures/duplicate-ids/duplicate-b.md && git commit -m "feat: implement rebuildable search and metadata indexes"
```

---

## Task 8: Implement search and list-from-index behavior

**Files:**
- Create: `src/core/search-notes.ts`
- Modify: `src/core/list-notes.ts`
- Modify: `src/index/index-store.ts`
- Modify: `src/cli/entry.ts`
- Test: `tests/integration/cli-search.test.ts`
- Test: `tests/unit/core/search-notes.test.ts`

**Step 1: Write the failing tests**
Add tests for:
- `bn search <query>` returns ranked matches with title/path snippets
- list/search prefer derived index data when available
- if derived state is missing, command returns actionable rebuild guidance or performs safe rebuild if implemented that way

**Step 2: Run test — confirm it fails**
Command:
```bash
bun test tests/unit/core/search-notes.test.ts tests/integration/cli-search.test.ts
```
Expected: FAIL because search use case/command does not exist.

**Step 3: Write minimal implementation**
Implement:
- `src/core/search-notes.ts`
  - query MiniSearch-backed data
- `src/core/list-notes.ts`
  - optionally read summaries from metadata index when present
- `src/index/index-store.ts`
  - expose search/list helpers
- `src/cli/entry.ts`
  - `search` command output

**Step 4: Run test — confirm it passes**
Command:
```bash
bun test tests/unit/core/search-notes.test.ts tests/integration/cli-search.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/core/search-notes.ts src/core/list-notes.ts src/index/index-store.ts src/cli/entry.ts tests/unit/core/search-notes.test.ts tests/integration/cli-search.test.ts && git commit -m "feat: add indexed note search"
```

---

## Task 9: Implement editor handoff and `bn edit`

**Files:**
- Create: `src/platform/editor.ts`
- Create: `src/core/edit-note.ts`
- Modify: `src/core/select-note.ts`
- Modify: `src/cli/entry.ts`
- Test: `tests/unit/platform/editor.test.ts`
- Test: `tests/integration/cli-edit.test.ts`

**Step 1: Write the failing tests**
Add tests for:
- editor command resolves from `$EDITOR`
- missing `$EDITOR` raises `EditorLaunchError`
- `bn edit <selector>` launches the editor with the resolved note path
- after editor return, the note is re-read and derived state refresh/rebuild is triggered as required by current architecture

**Step 2: Run test — confirm it fails**
Command:
```bash
bun test tests/unit/platform/editor.test.ts tests/integration/cli-edit.test.ts
```
Expected: FAIL because editor service/edit use case do not exist.

**Step 3: Write minimal implementation**
Implement:
- `src/platform/editor.ts`
  - resolve `$EDITOR`
  - spawn process safely
  - injectable launcher for tests
- `src/core/edit-note.ts`
  - resolve note
  - call editor
  - refresh index state after return
- `src/cli/entry.ts`
  - add `edit` command

**Step 4: Run test — confirm it passes**
Command:
```bash
bun test tests/unit/platform/editor.test.ts tests/integration/cli-edit.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/platform/editor.ts src/core/edit-note.ts src/core/select-note.ts src/cli/entry.ts tests/unit/platform/editor.test.ts tests/integration/cli-edit.test.ts && git commit -m "feat: implement editor handoff"
```

---

## Task 10: Implement archive flow and `bn archive`

**Files:**
- Create: `src/core/archive-note.ts`
- Modify: `src/storage/note-repository.ts`
- Modify: `src/storage/note-schema.ts`
- Modify: `src/cli/entry.ts`
- Test: `tests/unit/storage/archive-note.test.ts`
- Test: `tests/integration/cli-archive.test.ts`

**Step 1: Write the failing tests**
Add tests for:
- archiving moves a note into `notes/archive/`
- archived note gets `archivedAt` set
- list/search no longer include archived note unless future behavior explicitly chooses otherwise; for Phase 1 default to hidden from normal list/search
- `bn archive <selector>` prints resulting archive path

**Step 2: Run test — confirm it fails**
Command:
```bash
bun test tests/unit/storage/archive-note.test.ts tests/integration/cli-archive.test.ts
```
Expected: FAIL because archive flow does not exist.

**Step 3: Write minimal implementation**
Implement:
- `src/storage/note-repository.ts`
  - archive move helper and metadata update persistence
- `src/storage/note-schema.ts`
  - ensure `archivedAt` is represented and validated
- `src/core/archive-note.ts`
  - use-case wrapper returning archive summary
- `src/cli/entry.ts`
  - add `archive` command

**Step 4: Run test — confirm it passes**
Command:
```bash
bun test tests/unit/storage/archive-note.test.ts tests/integration/cli-archive.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/core/archive-note.ts src/storage/note-repository.ts src/storage/note-schema.ts src/cli/entry.ts tests/unit/storage/archive-note.test.ts tests/integration/cli-archive.test.ts && git commit -m "feat: implement note archiving"
```

---

## Task 11: Refresh CLI help, usage, and smoke coverage

**Files:**
- Modify: `src/cli/entry.ts`
- Modify: `tests/unit/cli-entry.test.ts`
- Modify: `scripts/smoke-opentui.ts`
- Create: `scripts/smoke-cli.ts`
- Modify: `package.json`
- Test: `tests/integration/cli-help.test.ts`

**Step 1: Write the failing tests**
Add tests for:
- help output lists all Phase 1 commands
- unknown command output stays actionable
- dedicated CLI smoke script exercises at least `--help` and `init` against a temp root
- `package.json` `smoke:cli` points at the dedicated smoke script rather than only `--help`

**Step 2: Run test — confirm it fails**
Command:
```bash
bun test tests/unit/cli-entry.test.ts tests/integration/cli-help.test.ts
```
Expected: FAIL because help/smoke coverage is incomplete.

**Step 3: Write minimal implementation**
Implement:
- `src/cli/entry.ts`
  - refresh help text for all implemented commands
- `scripts/smoke-cli.ts`
  - non-interactive CLI smoke path
- `package.json`
  - change `smoke:cli` to run `bun run ./scripts/smoke-cli.ts`
- keep `scripts/smoke-opentui.ts` working unchanged or minimally adjusted

**Step 4: Run test — confirm it passes**
Command:
```bash
bun test tests/unit/cli-entry.test.ts tests/integration/cli-help.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/cli/entry.ts tests/unit/cli-entry.test.ts tests/integration/cli-help.test.ts scripts/smoke-cli.ts scripts/smoke-opentui.ts package.json && git commit -m "feat: refresh cli help and smoke coverage"
```

---

## Task 12: Final verification and cleanup pass

**Files:**
- Review/modify as needed: all files touched in Tasks 1–11

**Step 1: Run focused tests after any last red-green fixes**
Commands:
```bash
bun test
bun run typecheck
```
Expected: PASS.

**Step 2: Run repo smoke checks**
Commands:
```bash
bun run smoke:opentui
bun run smoke:cli
```
Expected: PASS.

**Step 3: Inspect repo state**
Commands:
```bash
git status --short
git diff --stat
```
Expected: only intentional changes remain.

**Step 4: Make final polish commit if needed**
If cleanup/refactor changes were required after verification, make one small final commit with a message like:
```bash
git add . && git commit -m "chore: finish phase 1 cli verification pass"
```

**Step 5: Hand off to review / finishing flow**
After all tasks are green:
- run review pass
- prepare for branch-finishing workflow

---

## Task 13: Add end-to-end Phase 1 CLI workflow coverage

**Files:**
- Create: `tests/e2e/phase-1-cli-workflow.test.ts`
- Create: `tests/helpers/cli.ts`
- Create: `tests/helpers/note-fixtures.ts`
- Modify: `package.json`

**Step 1: Write the failing tests**
Add an end-to-end test that exercises a real Phase 1 workflow against a temp managed root using the actual CLI entrypoint:
- `bn init`
- `bn new --title ...`
- `bn rebuild`
- `bn list`
- `bn search <query>`
- `bn show <selector>`
- `bn edit <selector>` once Task 9 lands
- `bn archive <selector>` once Task 10 lands
- final `bn list` / `bn search` assertions proving archived notes are hidden from normal indexed flows

The test should verify on-disk effects as well as CLI stdout/stderr and exit codes.

**Step 2: Run test — confirm it fails**
Command:
```bash
bun test tests/e2e/phase-1-cli-workflow.test.ts
```
Expected: FAIL until the helper wiring and/or remaining command coverage exists.

**Step 3: Write minimal implementation**
Implement:
- `tests/helpers/cli.ts`
  - shared helper for spawning the real CLI with a managed root env
- `tests/helpers/note-fixtures.ts`
  - deterministic helpers for temp-root notes and reusable assertions
- `package.json`
  - add a `test:e2e` script pointing at the e2e suite

Keep the e2e test real: do not mock the CLI, repository, or index store.

**Step 4: Run test — confirm it passes**
Command:
```bash
bun test tests/e2e/phase-1-cli-workflow.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add tests/e2e/phase-1-cli-workflow.test.ts tests/helpers/cli.ts tests/helpers/note-fixtures.ts package.json && git commit -m "test: add phase 1 cli end-to-end coverage"
```

---

## Task 14: Test cleanup and fixture deduplication pass

**Files:**
- Review/modify as needed: `tests/**/*.ts`, `tests/helpers/*`, `scripts/smoke-cli.ts`, `package.json`

**Step 1: Write the failing tests or checks first where cleanup changes behavior**
Before any cleanup that changes observable behavior, add/adjust the narrowest failing test first.

**Step 2: Normalize the test harness**
Clean up duplication introduced across integration/e2e coverage:
- centralize CLI spawn logic
- centralize temp-root setup/teardown helpers where it reduces repetition
- remove redundant inline fixture builders once helpers exist
- keep tests explicit enough that failures stay easy to diagnose

**Step 3: Run the relevant test slices**
Commands:
```bash
bun test tests/unit
bun test tests/integration
bun test tests/e2e
```
Expected: PASS.

**Step 4: Run the full repo verification gate**
Commands:
```bash
bun run typecheck
bun test
bun run smoke:opentui
bun run smoke:cli
git status --short
```
Expected: PASS and only intentional changes remain.

**Step 5: Commit**
```bash
git add tests scripts package.json && git commit -m "test: clean up phase 1 test harness"
```

---

## Suggested implementation order rationale

1. Error/types first so later tasks share a stable failure model.
2. Root/path safety before any file mutations.
3. `init` before note creation flows.
4. Note schema/codec before repository logic.
5. Repository creation before list/show/selectors.
6. Rebuild/index before search.
7. Editor and archive after basic note lifecycle exists.
8. Help/smoke refresh after all commands exist.
9. End-to-end coverage after the full CLI surface exists.
10. Final cleanup and verification only after all task-local commits are green.

---

## Reviewer prompts for subagent-driven execution

### Implementer prompt skeleton

```text
GOAL: Complete one Phase 1 BlueNote implementation task with strict TDD.
CONTEXT: Follow docs/plans/2026-05-21-phase-1-cli-storage-implementation.md and docs/plans/2026-05-21-phase-1-cli-storage-design.md.
FILES: Only touch the files listed in the assigned task.
CONSTRAINTS: Write failing test first, run it and confirm failure, implement minimal code, rerun tests, no scope creep, commit after green.
VERIFY: Run the exact test command listed in the task and report the result plus commit SHA.
TASK: [paste one task verbatim]
```

### Spec reviewer prompt skeleton

```text
GOAL: Review one completed task only for plan compliance.
CONTEXT: Compare the implementation against docs/plans/2026-05-21-phase-1-cli-storage-implementation.md.
FILES: Review only files touched by the task.
CONSTRAINTS: Ignore style and quality unless they violate the task spec.
VERIFY: Use git diff for the task commit range and the task text.
TASK: [paste one task verbatim]
```

### Code-quality reviewer prompt skeleton

```text
GOAL: Review one completed task only for code quality.
CONTEXT: The task is already spec-reviewed; focus on DRY, YAGNI, naming, dead code, and error handling.
FILES: Review only files touched by the task.
CONSTRAINTS: Report severity as Critical / Important / Minor.
VERIFY: Use git diff for the task commit range.
TASK: [paste one task verbatim]
```

---

## Success criteria

The plan is complete when:
- all eight Phase 1 commands exist
- files remain the canonical note source of truth
- rebuildable derived artifacts live under `.bluenote/`
- malformed notes are reported rather than silently rewritten
- `$EDITOR` handoff works for `bn edit`
- typecheck, tests, and smoke checks all pass
- the CLI is ready to serve as the reusable foundation for Phase 2 TUI work
