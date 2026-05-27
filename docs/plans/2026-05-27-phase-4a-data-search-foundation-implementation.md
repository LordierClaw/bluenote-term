# Phase 4A — `.data` Migration and Search Foundation Implementation Plan

> **For implementer:** Use TDD throughout. Write failing test first. Watch it fail. Then implement. Do not implement Phase 4B editor cursor work, Phase 4C manager visual redesign, or Phase 4D Search Everything layout/readability polish in this plan.

**Goal:** Make `.data/` the canonical BlueNote internal app-state directory while preserving plain Markdown notes, then replace fuzzy-style search inclusion with shared contains-style matching for CLI search, Manager filtering, Search Everything, and slash-command discovery.

**Architecture:** Introduce explicit app-state layout constants that point to `.data/` and keep legacy `.state/` constants only for migration/compatibility. Add a focused `.state` → `.data` migration layer that copies canonical BlueNote-owned files, rebuilds derived indexes into `.data`, and refuses conflicting mixed state. Add a shared contains/ranking utility used by index search, CLI match explanations, TUI Manager filtering, and Search Everything command/note/folder matching.

**Tech Stack:** Bun, TypeScript, node:fs/path, sql.js, MiniSearch artifacts for rebuild output only, existing CLI/TUI test helpers.

**Approved design:** `docs/plans/2026-05-27-phase-4-search-editing-recovery-design.md`

---

## Non-goals for 4A

- Do not redesign editor chrome, cursor handling, textarea integration, word wrap, mouse input, copy/cut/paste, or editor bottombar. Those belong to 4B.
- Do not redesign Manager visuals/topbar/bottombar, preview toggle, responsive panes, or preview cache behavior beyond matching/filter semantics. Those belong to 4C.
- Do not redesign Search Everything visual separation, readability colors, preview toggle, responsive preview, or command execution wiring. Those belong to 4D.
- Do not put metadata/frontmatter into Markdown note files.
- Do not delete legacy `.state/` directories during migration unless a test explicitly proves they are empty/stale and the implementation keeps recovery safe. Prefer leaving `.state/` as non-canonical backup.

## Required verification for every task

After each task:

1. Run the task-specific test command.
2. Run `bun run typecheck` if exported types or production modules changed.
3. Commit only the task-scoped files.
4. Parent session must re-run the task-specific tests after subagent completion.
5. If task changes user-facing wording or storage paths, run adjacent integration tests that consume that contract.

Final 4A verification:

```bash
bun run typecheck
bun test
bun run smoke:opentui
bun run smoke:opentui:interactive
bun run smoke:cli
git status --short --branch
```

---

## Task 1: Introduce canonical `.data` app-state constants and layout helpers

**Files:**
- Modify: `src/config/root.ts`
- Modify: `src/storage/root-layout.ts`
- Modify: `tests/unit/storage/root-layout.test.ts`
- Modify: `tests/helpers/cli.ts`

**Step 1: Write the failing tests**

In `tests/unit/storage/root-layout.test.ts`, update the layout expectations so the managed root creates `.data` paths and no longer creates `.state` for new roots. Add assertions for both canonical and legacy helper names:

```ts
import {
  APP_STATE_DIRECTORY,
  APP_STATE_NOTES_DIRECTORY,
  LEGACY_STATE_DIRECTORY,
} from "../../../src/config/root"
```

Change the helper test to assert:

```ts
assert.equal(getStateNotesPath(resolvedRoot), path.join(resolvedRoot, ".data", "notes"))
assert.equal(APP_STATE_DIRECTORY, ".data")
assert.equal(APP_STATE_NOTES_DIRECTORY, path.join(".data", "notes"))
assert.equal(LEGACY_STATE_DIRECTORY, ".state")
```

Add this assertion to `ensureManagedRoot creates the full managed root layout`:

```ts
await assert.rejects(access(path.join(tempRoot, ".state")))
```

Update `tests/helpers/cli.ts` only after the RED test exists so `assertManagedRootLayout` checks the new `MANAGED_ROOT_LAYOUT`.

**Step 2: Run test — confirm it fails**

Command:

```bash
bun test tests/unit/storage/root-layout.test.ts
```

Expected: FAIL because the code still exports/creates `.state` paths.

**Step 3: Implement minimal constants/layout changes**

In `src/config/root.ts`:

- Add canonical app-state constants:
  - `APP_STATE_DIRECTORY = ".data"`
  - `APP_STATE_NOTES_DIRECTORY = path.join(APP_STATE_DIRECTORY, "notes")`
  - `APP_STATE_RECOVERY_DIRECTORY`
  - `APP_STATE_COMPLETIONS_DIRECTORY`
  - `APP_STATE_TMP_DIRECTORY`
  - `APP_STATE_LOGS_DIRECTORY`
- Keep legacy constants for migration:
  - `LEGACY_STATE_DIRECTORY = ".state"`
  - `LEGACY_STATE_NOTES_DIRECTORY = path.join(LEGACY_STATE_DIRECTORY, "notes")`
- Temporarily alias existing names to canonical to minimize churn:
  - `STATE_DIRECTORY = APP_STATE_DIRECTORY`
  - `STATE_NOTES_DIRECTORY = APP_STATE_NOTES_DIRECTORY`
  - etc.
- Keep `STATE_MANIFEST_FILENAME` and `STORAGE_SCHEMA_VERSION` unchanged.

In `src/storage/root-layout.ts`:

- Keep `MANAGED_ROOT_LAYOUT` using `STATE_DIRECTORY`/`STATE_NOTES_DIRECTORY`; those now resolve to `.data`.
- Keep `getStateNotesPath(rootPath)` name for compatibility, but it must now return `.data/notes`.

**Step 4: Run test — confirm it passes**

Command:

```bash
bun test tests/unit/storage/root-layout.test.ts && bun run typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/config/root.ts src/storage/root-layout.ts tests/unit/storage/root-layout.test.ts tests/helpers/cli.ts && git commit -m "feat: make data directory canonical in root layout"
```

---

## Task 2: Update init/manifest behavior and user-facing `.data` errors

**Files:**
- Modify: `src/storage/state-manifest.ts`
- Modify: `src/core/init-root.ts`
- Modify: `tests/integration/cli-init.test.ts`
- Modify: `scripts/smoke-cli.ts`

**Step 1: Write the failing tests**

In `tests/integration/cli-init.test.ts`:

- Change manifest assertions from `.state/manifest.json` to `.data/manifest.json`.
- Add `await assert.rejects(access(path.join(harness.rootPath, ".state")))` after init.
- Rename the failure test to `bn init reports a user-facing error when writing .data/manifest.json fails`.
- Change its setup from `.state/manifest.json` to `.data/manifest.json`.
- Ensure stderr does not leak `manifest.json`, `EISDIR`, `Error:`, or stacks as before.

In `scripts/smoke-cli.ts`:

- Change the smoke manifest path and assertion text to `.data/manifest.json`.
- Add a smoke assertion that `.state` does not exist for a fresh smoke root.

**Step 2: Run test — confirm it fails**

Command:

```bash
bun test tests/integration/cli-init.test.ts && bun run smoke:cli
```

Expected: FAIL until manifest helper/error hints use `.data` consistently.

**Step 3: Implement minimal manifest changes**

In `src/storage/state-manifest.ts`:

- `getStateManifestPath()` already uses `STATE_DIRECTORY`; after Task 1 this points to `.data`.
- Update `RootNotInitializedError` hint to: `Run 'bn init' to create a valid .data/manifest.json.`
- Keep function names for compatibility unless a later plan renames them.

In `src/core/init-root.ts`:

- No behavior change should be needed beyond imported constants; keep wrapping filesystem errors.

**Step 4: Run test — confirm it passes**

Command:

```bash
bun test tests/integration/cli-init.test.ts && bun run smoke:cli && bun run typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/storage/state-manifest.ts src/core/init-root.ts tests/integration/cli-init.test.ts scripts/smoke-cli.ts && git commit -m "fix: initialize manifests under data directory"
```

---

## Task 3: Move sidecar repository and note mutation paths to `.data/notes`

**Files:**
- Modify: `src/storage/sidecar-repository.ts`
- Modify: `tests/unit/storage/sidecar-repository.test.ts`
- Modify: `tests/unit/storage/note-repository.test.ts`
- Modify: `tests/integration/cli-new.test.ts`
- Modify: `tests/integration/cli-list-show.test.ts`
- Modify: `tests/integration/cli-edit.test.ts`
- Modify: `tests/integration/cli-archive.test.ts`
- Modify: `tests/integration/cli-delete.test.ts`
- Modify: `tests/integration/tui-workflow.test.ts`
- Modify: `tests/e2e/phase-1-cli-workflow.test.ts`
- Modify: `tests/e2e/phase-2-cli-storage-ux-workflow.test.ts`
- Modify: `scripts/smoke-opentui-interactive.ts`

**Step 1: Write/update failing tests**

Update all sidecar path assertions from `.state/notes/<key>.json` to `.data/notes/<key>.json` for current-format behavior.

Add one explicit regression in `tests/unit/storage/sidecar-repository.test.ts`:

```ts
test("sidecar repository writes canonical metadata under .data/notes", async () => {
  // create temp root, write a valid sidecar, assert .data/notes/key.json exists and .state/notes/key.json does not
})
```

**Step 2: Run tests — confirm failure**

Command:

```bash
bun test tests/unit/storage/sidecar-repository.test.ts tests/integration/cli-new.test.ts tests/integration/cli-list-show.test.ts tests/integration/cli-edit.test.ts tests/integration/cli-archive.test.ts tests/integration/cli-delete.test.ts tests/integration/tui-workflow.test.ts tests/e2e/phase-1-cli-workflow.test.ts tests/e2e/phase-2-cli-storage-ux-workflow.test.ts
```

Expected: FAIL on code or remaining stale `.state` assertions.

**Step 3: Implement minimal repository changes**

In `src/storage/sidecar-repository.ts`:

- Existing `STATE_NOTES_DIRECTORY` should now resolve to `.data/notes` from Task 1.
- Update all user-facing hints from `BLUENOTE_ROOT/.state/notes` to `BLUENOTE_ROOT/.data/notes`.
- Keep atomic temp-write behavior unchanged.

In `scripts/smoke-opentui-interactive.ts`:

- Rename local variables from `stateNotesPath` to `dataNotesPath` where practical.
- Read and assert sidecars under `.data/notes`.

**Step 4: Run tests — confirm pass**

Command:

```bash
bun test tests/unit/storage/sidecar-repository.test.ts tests/unit/storage/note-repository.test.ts tests/integration/cli-new.test.ts tests/integration/cli-list-show.test.ts tests/integration/cli-edit.test.ts tests/integration/cli-archive.test.ts tests/integration/cli-delete.test.ts tests/integration/tui-workflow.test.ts tests/e2e/phase-1-cli-workflow.test.ts tests/e2e/phase-2-cli-storage-ux-workflow.test.ts && bun run typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/storage/sidecar-repository.ts tests/unit/storage/sidecar-repository.test.ts tests/unit/storage/note-repository.test.ts tests/integration/cli-new.test.ts tests/integration/cli-list-show.test.ts tests/integration/cli-edit.test.ts tests/integration/cli-archive.test.ts tests/integration/cli-delete.test.ts tests/integration/tui-workflow.test.ts tests/e2e/phase-1-cli-workflow.test.ts tests/e2e/phase-2-cli-storage-ux-workflow.test.ts scripts/smoke-opentui-interactive.ts && git commit -m "feat: store note sidecars under data directory"
```

---

## Task 4: Write derived indexes under `.data` and update rebuild/search guidance

**Files:**
- Modify: `src/index/index-store.ts`
- Modify: `tests/unit/index/index-store.test.ts`
- Modify: `tests/unit/core/search-notes.test.ts`
- Modify: `tests/integration/cli-search.test.ts`
- Modify: `tests/integration/cli-rebuild.test.ts`
- Modify: `tests/integration/cli-completion.test.ts`

**Step 1: Write failing tests**

Update index path assertions from `.state/metadata.sqlite` and `.state/search-index.json` to `.data/metadata.sqlite` and `.data/search-index.json`.

Update expected rebuild hints:

```txt
Run bn rebuild to recreate .data artifacts from note files and sidecars.
```

Update validation error path regexes in rebuild tests from `.state[\\/]notes` to `.data[\\/]notes` for current-format tests.

**Step 2: Run tests — confirm failure**

Command:

```bash
bun test tests/unit/index/index-store.test.ts tests/unit/core/search-notes.test.ts tests/integration/cli-search.test.ts tests/integration/cli-rebuild.test.ts tests/integration/cli-completion.test.ts
```

Expected: FAIL until `REBUILD_INDEX_HINT` and any remaining path constants reflect `.data`.

**Step 3: Implement minimal index changes**

In `src/index/index-store.ts`:

- Keep `DERIVED_DIRECTORY = STATE_DIRECTORY`; after Task 1 this is `.data`.
- Update `REBUILD_INDEX_HINT` to mention `.data`.
- Do not change the SQL schema in 4A unless needed for `.data` pathing.
- Keep MiniSearch artifact writing for now; contains-style inclusion is handled in later tasks.

**Step 4: Run tests — confirm pass**

Command:

```bash
bun test tests/unit/index/index-store.test.ts tests/unit/core/search-notes.test.ts tests/integration/cli-search.test.ts tests/integration/cli-rebuild.test.ts tests/integration/cli-completion.test.ts && bun run typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/index/index-store.ts tests/unit/index/index-store.test.ts tests/unit/core/search-notes.test.ts tests/integration/cli-search.test.ts tests/integration/cli-rebuild.test.ts tests/integration/cli-completion.test.ts && git commit -m "feat: write derived indexes under data directory"
```

---

## Task 5: Add `.state` → `.data` app-state migration helper

**Files:**
- Create: `src/storage/app-state-migration.ts`
- Create: `tests/unit/storage/app-state-migration.test.ts`
- Modify: `src/storage/root-layout.ts`

**Step 1: Write failing tests**

Create `tests/unit/storage/app-state-migration.test.ts` with tests for:

1. `migrateLegacyAppStateToData` copies `.state/manifest.json` and `.state/notes/*.json` into `.data` when `.data` is absent.
2. It leaves Markdown notes untouched by comparing file contents before/after migration.
3. It does not copy stale derived artifacts `.state/metadata.sqlite` or `.state/search-index.json`; those are rebuilt later.
4. It is idempotent when run twice.
5. It allows `.data` plus empty/stale `.state` with no conflict.
6. It throws `UsageError` when `.data/notes/foo.json` and `.state/notes/foo.json` both exist with different contents.

Expected helper shape:

```ts
export interface AppStateMigrationResult {
  status: "noop" | "migrated"
  migratedFileCount: number
  legacyStatePath: string
  dataStatePath: string
}

export function migrateLegacyAppStateToData(rootPath: string): AppStateMigrationResult
```

**Step 2: Run tests — confirm failure**

Command:

```bash
bun test tests/unit/storage/app-state-migration.test.ts
```

Expected: FAIL because the module does not exist.

**Step 3: Implement helper**

In `src/storage/app-state-migration.ts`:

- Use `LEGACY_STATE_DIRECTORY`, `STATE_DIRECTORY`, `STATE_MANIFEST_FILENAME`, `LEGACY_STATE_NOTES_DIRECTORY`, and `STATE_NOTES_DIRECTORY`.
- If `.state` is absent, return `noop`.
- If `.data` is absent, create `.data`, `.data/notes`, `.data/tmp`, `.data/logs`, `.data/recovery`, `.data/completions` through `ensureManagedRoot` or equivalent safe mkdirs.
- Copy canonical files/directories only:
  - manifest
  - `notes/*.json`
  - support directories `recovery`, `tmp`, `logs`, `completions` if they exist and can be copied safely
- Do not copy `metadata.sqlite` or `search-index.json`.
- If `.data` exists:
  - identical existing files are accepted.
  - missing canonical files may be copied from `.state`.
  - conflicting existing files throw `UsageError("Cannot migrate legacy .state because .data already contains conflicting app state.", { hint: "Review .state and .data, keep the desired BlueNote metadata under .data, then retry." })`.
- Do not delete `.state`.
- Use `assertPathInsideRoot` for copy destinations.

**Step 4: Run tests — confirm pass**

Command:

```bash
bun test tests/unit/storage/app-state-migration.test.ts && bun run typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/storage/app-state-migration.ts tests/unit/storage/app-state-migration.test.ts src/storage/root-layout.ts && git commit -m "feat: migrate legacy state directory to data"
```

---

## Task 6: Integrate app-state migration into init/rebuild/migrate startup paths

**Files:**
- Modify: `src/core/init-root.ts`
- Modify: `src/core/rebuild-indexes.ts`
- Modify: `src/core/migrate-storage.ts`
- Modify: `tests/integration/cli-init.test.ts`
- Modify: `tests/integration/cli-rebuild.test.ts`
- Modify: `tests/integration/cli-migrate.test.ts`

**Step 1: Write failing tests**

Add integration tests:

1. `bn init migrates existing .state metadata into .data without rewriting notes`:
   - create root with `notes/inbox/plain.md`, `.state/manifest.json`, `.state/notes/plain.json`.
   - run `bn init`.
   - assert `.data/manifest.json` and `.data/notes/plain.json` exist.
   - assert note body is byte-for-byte unchanged.

2. `bn rebuild migrates .state sidecars before rebuilding .data indexes`:
   - create plain note and matching `.state/notes/<key>.json`.
   - run `bn rebuild`.
   - assert `.data/notes/<key>.json`, `.data/metadata.sqlite`, `.data/search-index.json` exist.
   - assert old `.state/metadata.sqlite` stale file is not copied if present.

3. `bn migrate reports conflict when .state and .data contain different sidecars`:
   - create conflicting sidecars.
   - run `bn migrate`.
   - assert exit code 1 or 2 according to existing `UsageError` handling and stderr contains conflict guidance.

**Step 2: Run tests — confirm failure**

Command:

```bash
bun test tests/integration/cli-init.test.ts tests/integration/cli-rebuild.test.ts tests/integration/cli-migrate.test.ts
```

Expected: FAIL until startup paths call the migration helper.

**Step 3: Implement integration**

- In `src/core/init-root.ts`: after `ensureManagedRoot(rootPath)`, call `migrateLegacyAppStateToData(rootPath)` before writing the manifest. This preserves existing metadata and writes/updates canonical `.data/manifest.json`.
- In `src/core/rebuild-indexes.ts`: resolve/ensure root, run `migrateLegacyAppStateToData(rootPath)` before reading sidecars.
- In `src/core/migrate-storage.ts`: resolve root, run `migrateLegacyAppStateToData(rootPath)` before `migrateLegacyStorage()` so legacy frontmatter migration writes current-format sidecars under `.data`.
- Keep user-facing errors wrapped in the existing CLI error formatting; do not leak stacks.

**Step 4: Run tests — confirm pass**

Command:

```bash
bun test tests/integration/cli-init.test.ts tests/integration/cli-rebuild.test.ts tests/integration/cli-migrate.test.ts && bun run typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/core/init-root.ts src/core/rebuild-indexes.ts src/core/migrate-storage.ts tests/integration/cli-init.test.ts tests/integration/cli-rebuild.test.ts tests/integration/cli-migrate.test.ts && git commit -m "feat: migrate legacy state during core commands"
```

---

## Task 7: Add shared contains-style search matching utility

**Files:**
- Create: `src/search/contains-match.ts`
- Create: `tests/unit/search/contains-match.test.ts`

**Step 1: Write failing tests**

Create `tests/unit/search/contains-match.test.ts` covering:

- `normalizeSearchQuery("  ABC  ")` returns `abc`.
- `containsSearchQuery("Receipt 123", "123")` is true.
- `containsSearchQuery("a-big-cat", "abc")` is false.
- Multiple words use literal normalized query first and token fallback only when all tokens are present in the same candidate field. For 4A, `containsSearchQuery("Client Launch Brief", "client launch")` should be true; `containsSearchQuery("Client legal Launch", "client launch")` can be false unless exact normalized phrase exists. Keep behavior simple and documented.
- `scoreContainsMatch` ranks exact > prefix > substring and returns 0 for non-contains.
- `collectContainsFieldMatches` returns matched fields and scores for key/title/description/path/body candidates.

Suggested exports:

```ts
export type ContainsMatchField = "key" | "filename" | "title" | "description" | "path" | "body" | "command"

export interface ContainsMatchCandidate {
  field: ContainsMatchField
  value: string
  weight?: number
}

export interface ContainsFieldMatch {
  field: ContainsMatchField
  score: number
}

export function normalizeSearchQuery(query: string): string
export function containsSearchQuery(value: string, query: string): boolean
export function scoreContainsMatch(value: string, query: string, weight?: number): number
export function collectContainsFieldMatches(query: string, candidates: readonly ContainsMatchCandidate[]): ContainsFieldMatch[]
```

**Step 2: Run tests — confirm failure**

Command:

```bash
bun test tests/unit/search/contains-match.test.ts
```

Expected: FAIL because module does not exist.

**Step 3: Implement utility**

Implement simple deterministic contains scoring:

- Normalize with `trim().toLocaleLowerCase()` and whitespace collapse.
- Empty query returns false/score 0.
- Exact match base score 120.
- Prefix base score 100.
- Substring base score 80 plus a small ratio bonus.
- Multiply/add field `weight` if supplied, but keep order deterministic.
- No subsequence matching.

**Step 4: Run tests — confirm pass**

Command:

```bash
bun test tests/unit/search/contains-match.test.ts && bun run typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/search/contains-match.ts tests/unit/search/contains-match.test.ts && git commit -m "feat: add contains search matching utility"
```

---

## Task 8: Enforce contains-style inclusion in CLI/index search

**Files:**
- Modify: `src/index/index-store.ts`
- Modify: `src/core/search-notes.ts`
- Modify: `tests/unit/core/search-notes.test.ts`
- Modify: `tests/integration/cli-search.test.ts`

**Step 1: Write failing tests**

In `tests/unit/core/search-notes.test.ts`, add:

```ts
test("searchNotes does not include fuzzy subsequence-only matches", async () => {
  // indexed note key/title/path/body contains a-big-cat but not abc
  // searchNotes("abc") returns []
})
```

Add a positive `123` contains test:

```ts
test("searchNotes includes title, path, and body matches that contain numeric query", async () => {
  // title Receipt 123, file meeting-123.md, and body line containing 123 all appear
})
```

In `tests/integration/cli-search.test.ts`, add:

- `bn search 123 only prints notes with fields containing 123`.
- Ensure a note with title/body `a-big-cat` does not appear for `abc`.

**Step 2: Run tests — confirm failure**

Command:

```bash
bun test tests/unit/core/search-notes.test.ts tests/integration/cli-search.test.ts
```

Expected: FAIL because MiniSearch may include fuzzy/stem/token matches that do not contain the literal query.

**Step 3: Implement contains filtering and explanations**

In `src/index/index-store.ts`:

- After `searchEngine.search(query)`, filter mapped matches through `collectContainsFieldMatches` using fields:
  - key
  - title
  - description
  - body
  - relativePath
  - filename derived from relativePath
- Attach `containsMatches` or replace `termMatches` so `searchNotes` can explain the real contains field.
- Preserve active-note filtering.
- Do not include any match where no field contains the normalized query.

In `src/core/search-notes.ts`:

- Prefer contains field metadata over MiniSearch `termMatches`.
- Explanation priority remains title > description > content > key/path.
- Content excerpt should find the first body line containing the normalized query.
- Ranking remains deterministic and path-tiebroken.

**Step 4: Run tests — confirm pass**

Command:

```bash
bun test tests/unit/core/search-notes.test.ts tests/integration/cli-search.test.ts && bun run typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/index/index-store.ts src/core/search-notes.ts tests/unit/core/search-notes.test.ts tests/integration/cli-search.test.ts && git commit -m "fix: use contains semantics for cli search"
```

---

## Task 9: Apply contains matching to TUI Manager filtering

**Files:**
- Modify: `src/tui/adapters/note-manager-adapter.ts`
- Modify: `tests/unit/tui/note-manager-adapter.test.ts`

**Step 1: Write failing tests**

In `tests/unit/tui/note-manager-adapter.test.ts`, add or update tests so:

- Filtering for `123` returns notes/folders where filename/title/description/path contains `123`.
- Filtering for `abc` does not include a note named/title/body summary `a-big-cat` unless a visible summary field contains `abc` contiguously.
- Filtering still excludes hidden app-state paths; update fixture descriptions from `.state` to `.data` where they represent BlueNote internal files.

**Step 2: Run test — confirm failure**

Command:

```bash
bun test tests/unit/tui/note-manager-adapter.test.ts
```

Expected: FAIL if current filtering relies on fuzzy-ish token/subsequence behavior or stale `.state` fixture wording.

**Step 3: Implement adapter changes**

In `src/tui/adapters/note-manager-adapter.ts`:

- Import `containsSearchQuery` or `collectContainsFieldMatches` from `src/search/contains-match.ts`.
- Replace local ad hoc/fuzzy filtering with contains matching over visible summary fields:
  - filename
  - key
  - title
  - description
  - relativePath
- Do not read note bodies for Manager filtering in 4A.
- Keep folder tree behavior unchanged except matching must use contains semantics.

**Step 4: Run test — confirm pass**

Command:

```bash
bun test tests/unit/tui/note-manager-adapter.test.ts && bun run typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/tui/adapters/note-manager-adapter.ts tests/unit/tui/note-manager-adapter.test.ts && git commit -m "fix: use contains semantics for manager filtering"
```

---

## Task 10: Apply contains matching to Search Everything notes/folders/commands

**Files:**
- Modify: `src/tui/adapters/search-everything-adapter.ts`
- Modify: `tests/unit/tui/search-everything-adapter.test.ts`

**Step 1: Write failing tests**

In `tests/unit/tui/search-everything-adapter.test.ts`:

- Rename/adjust tests to say `contains`, not fuzzy.
- Add: query `abc` does not return note/folder/command results for `a-big-cat` or `/archive` unless `abc` appears contiguously.
- Add: query `123` returns note/path results containing `123`.
- Add command test:
  - `/re` returns `/rebuild` and `/replace` because names contain `/re`.
  - `/ae` does not return `/archive` by subsequence.
- Keep existing content-result behavior via `searchNotes(query)` but ensure note/folder/command inclusion uses shared utility.

**Step 2: Run test — confirm failure**

Command:

```bash
bun test tests/unit/tui/search-everything-adapter.test.ts
```

Expected: FAIL because `fuzzyScore` currently permits subsequence matches.

**Step 3: Implement adapter changes**

In `src/tui/adapters/search-everything-adapter.ts`:

- Remove `isSubsequence` and fuzzy inclusion behavior.
- Replace `fuzzyScore()` with a wrapper around `scoreContainsMatch()`.
- Use `collectContainsFieldMatches()` for note fields.
- Use contains matching for folders and commands.
- Keep result types, preview shape, and existing command list unchanged.
- Preserve deterministic sort order.

**Step 4: Run test — confirm pass**

Command:

```bash
bun test tests/unit/tui/search-everything-adapter.test.ts && bun run typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/tui/adapters/search-everything-adapter.ts tests/unit/tui/search-everything-adapter.test.ts && git commit -m "fix: use contains semantics for search everything"
```

---

## Task 11: Align docs, architecture, and smoke contracts for `.data` and contains search

**Files:**
- Modify: `README.md`
- Modify: `docs/product/overview.md`
- Modify: `docs/architecture/managed-root-layout.md`
- Modify: `docs/architecture/note-format-and-indexing.md`
- Modify: `docs/architecture/runtime-and-dependencies.md`
- Modify: `docs/phases/phase-4-search-editing-and-recovery.md`
- Modify: `docs/plans/2026-05-27-phase-4-search-editing-recovery-design.md`
- Modify: `tests/integration/docs-phase3-tui.test.ts` if it still asserts stale storage wording
- Modify: `tests/integration/cli-help.test.ts` only if help text changes

**Step 1: Write/update failing docs tests**

Search docs/tests for stale canonical `.state` claims and fuzzy wording:

```bash
bun test tests/integration/docs-phase3-tui.test.ts tests/integration/cli-help.test.ts
```

Update tests to require:

- Product/architecture docs say metadata lives under `.data/notes/`.
- Derived artifacts are `.data/metadata.sqlite` and `.data/search-index.json`.
- Search is described as contains-style, not fuzzy.
- Phase 3 historical docs may mention Phase 3 behavior only if clearly historical; active architecture/product docs must use `.data`.

**Step 2: Run tests — confirm failure if stale assertions exist**

Command:

```bash
bun test tests/integration/docs-phase3-tui.test.ts tests/integration/cli-help.test.ts
```

Expected: FAIL until docs/tests are aligned, or PASS if no docs test covers these strings. Still update docs.

**Step 3: Update docs**

Update active docs to state:

- Notes remain plain Markdown.
- BlueNote metadata sidecars are under `.data/notes/`.
- `.state/` is legacy and only used as migration input.
- Derived search/metadata artifacts are rebuildable under `.data/`.
- `bn search` uses contains-style matching; `123` only matches actual fields/content containing `123`.

Do not broaden this task into Phase 4B/4C/4D UI redesign docs beyond naming them as upcoming subplans.

**Step 4: Run docs tests — confirm pass**

Command:

```bash
bun test tests/integration/docs-phase3-tui.test.ts tests/integration/cli-help.test.ts && bun run typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add README.md docs/product/overview.md docs/architecture/managed-root-layout.md docs/architecture/note-format-and-indexing.md docs/architecture/runtime-and-dependencies.md docs/phases/phase-4-search-editing-and-recovery.md docs/plans/2026-05-27-phase-4-search-editing-recovery-design.md tests/integration/docs-phase3-tui.test.ts tests/integration/cli-help.test.ts && git commit -m "docs: align data layout and contains search contract"
```

---

## Task 12: Final Phase 4A verification and review

**Files:**
- No planned production changes unless verification finds drift.
- May modify tests/docs only to fix confirmed adjacent expectation drift.

**Step 1: Run focused storage/search suites**

Command:

```bash
bun test tests/unit/storage/root-layout.test.ts tests/unit/storage/app-state-migration.test.ts tests/unit/storage/sidecar-repository.test.ts tests/unit/index/index-store.test.ts tests/unit/core/search-notes.test.ts tests/unit/search/contains-match.test.ts tests/unit/tui/note-manager-adapter.test.ts tests/unit/tui/search-everything-adapter.test.ts tests/integration/cli-init.test.ts tests/integration/cli-rebuild.test.ts tests/integration/cli-migrate.test.ts tests/integration/cli-search.test.ts tests/integration/cli-completion.test.ts
```

Expected: PASS.

**Step 2: Run full required verification**

Command:

```bash
bun run typecheck && bun test && bun run smoke:opentui && bun run smoke:opentui:interactive && bun run smoke:cli && git status --short --branch
```

Expected: PASS and clean working tree except any deliberate uncommitted review fixes.

**Step 3: Dispatch final reviews**

Use `delegate_task` reviewers with exact context:

- Plan file: `docs/plans/2026-05-27-phase-4a-data-search-foundation-implementation.md`
- Design file: `docs/plans/2026-05-27-phase-4-search-editing-recovery-design.md`
- Scope warning: ignore older Phase 3 plans and do not request Phase 4B/4C/4D UI work in 4A.

Reviewer 1: spec compliance.

Reviewer 2: code quality / migration safety.

Review checklist:

- `.data` is canonical for new/current roots.
- `.state` is only legacy migration input.
- Existing `.state` roots migrate safely and idempotently.
- Derived indexes are rebuilt/written under `.data`.
- Markdown notes remain plain and unchanged by app-state migration.
- CLI search, Manager filter, Search Everything, and commands use contains-style inclusion.
- No fuzzy subsequence false positives remain.
- Full verification passed.

**Step 4: Fix review findings**

If reviewers find issues, create targeted RED tests first, fix, rerun focused tests, and repeat review until both pass.

**Step 5: Commit final verification fixes if needed**

If any fixes were made:

```bash
git add <changed-files> && git commit -m "fix: complete phase 4a data search verification"
```

**Step 6: Finish 4A**

After reviews pass, report:

- latest commit
- verification commands passed
- branch cleanliness
- whether Phase 4B can begin

---

## Execution options after approval

Plan saved to `docs/plans/2026-05-27-phase-4a-data-search-foundation-implementation.md`.

Two execution options:

1. **Subagent-Driven** — dispatch a fresh sub-agent per task with parent-session verification and two-stage review.
2. **Manual** — you run the tasks yourself from this plan.
