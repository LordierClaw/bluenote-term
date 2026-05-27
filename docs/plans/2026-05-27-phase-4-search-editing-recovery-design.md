# Phase 4 — Search, Editing, and Recovery Hardening Design

**Status:** Approved
**Date:** 2026-05-27

## Approved direction

Phase 4 uses **Approach B: Foundation-first `.data` + indexed/search contract, then UI refinements**.

This phase turns the usable Phase 3 TUI/CLI into a faster, clearer, more robust daily workspace by:

1. Migrating BlueNote internal app state from `.state/` to `.data/`.
2. Making search semantics understandable and consistent across CLI search, Manager filtering, Search Everything, and command matching.
3. Building a performance foundation for TUI manager previews and search.
4. Fixing urgent editor usability: visible cursor, arrow/mouse navigation where supported, responsive bottom bar, wrap toggle, and copy/cut/paste.
5. Refining TUI visuals while keeping BlueNote lightweight and low-overhead.
6. Making Manager and Search Everything responsive, with preview auto-hide and preview toggles.

## Storage and performance contract

- Note files remain plain Markdown.
- BlueNote may redesign internal app state under the managed root.
- `.data/` becomes the canonical BlueNote-owned internal app-state directory for Phase 4.
- Existing `.state/` roots need safe migration/compatibility handling.
- Derived/internal data must remain rebuildable.
- Performance is a top priority: lightweight, low RAM/CPU, fastest possible perceived UX.
- No default background daemon.

## Subplan breakdown and order

Phase 4 has one umbrella design and smaller sequential implementation plans:

1. **4A — `.data` migration + search correctness/performance foundation**
2. **4B — Editor input/cursor/responsive chrome**
3. **4C — Manager performance/responsive layout/style**
4. **4D — Search Everything correctness/readability/responsive preview**

### 4A — `.data` migration + search correctness/performance foundation

Primary outcomes:

- `.data/` becomes canonical internal app-state directory.
- Existing `.state/` roots migrate safely.
- Note files remain plain Markdown.
- Search inclusion semantics become contains-style, not fuzzy subsequence.
- `bn search 123` only shows notes where title, filename/key/path/description/content contains `123`.
- Shared search/match utilities become available for CLI search, Manager filter, Search Everything, and commands.
- Rebuildable lightweight cache structures can be added where they directly improve speed.

### 4B — Editor input/cursor/responsive chrome

Primary outcomes:

- Try OpenTUI `TextareaRenderable` as the real input owner.
- Prove it with a real TTY spike/test early.
- If it still fails, switch to the prepared custom controlled editor fallback.
- Add visible cursor, arrow navigation, paste support, word-wrap toggle, overflow indicator, and responsive chrome.
- Merge/redesign editor topbar to show note name, directory, and latest updated time.
- Merge/redesign bottom/status bar to show save/autosave state, latest updated time, shortcuts, and wrap mode.

### 4C — Manager performance/responsive layout/style

Primary outcomes:

- Remove the unnecessary `notes/inbox` container framing.
- Show Layout 1 title as the current path, for example `notes/inbox`.
- Show Layout 2 title as the focused file/folder name.
- Replace the current topbar with a simple `[BlueNote                         latest_rebuild_time | indexing...]` layout.
- Add Search Everything shortcut and preview-toggle shortcut to the bottom bar.
- Hide preview automatically on narrow terminal widths; let users toggle preview manually.
- Optimize navigation/filter latency with lightweight summaries, preview/session cache, and debounced expensive preview/index work.
- Restyle with default terminal background, purposeful color roles, modern fills/separators, and less box-heavy chrome.
- Remove unnecessary Layout 2 preview padding.

### 4D — Search Everything correctness/readability/responsive preview

Primary outcomes:

- Use the same contains-style matching contract as CLI search.
- Ensure non-selected results are readable and selected result is visually distinct.
- Visually separate input, result list, preview panel, and preview sections.
- Support note, content, folder, and command result types.
- Dispatch Enter by result type: note/content opens editor, folder opens manager, command runs a wired handler or shows a safe unavailable status.
- Hide preview automatically when terminal height is too small.
- Add preview toggle shortcut.

## Components and responsibilities

### 1. Storage layout and migration layer

Responsible for moving internal app state from `.state/` to `.data/`.

Likely files/areas:

- root layout helpers
- sidecar repository
- index store
- manifest handling
- migration command/tests
- docs/smoke scripts that currently mention `.state`

Responsibilities:

- Treat `.data/` as canonical for new roots.
- Detect existing `.state/` roots.
- Migrate internal files safely: sidecars, manifest, and support directories where appropriate.
- Rebuild derived indexes under `.data/` rather than blindly copying stale search artifacts when safer.
- Avoid touching plain Markdown note files except through already-approved note operations.
- Prevent mixed `.state`/`.data` ambiguity with clear user-facing rules.
- Keep migration recoverable and idempotent.
- Update CLI/TUI services to read canonical `.data/`.

### 2. Search contract layer

Responsible for consistent contains-style matching across:

- `bn search`
- Manager filter
- Search Everything
- slash-command matching

Responsibilities:

- Define inclusion semantics: query terms appear as case-insensitive substrings in at least one searchable field.
- Preserve ranking separately from inclusion.
- Normalize query and candidate text consistently.
- Provide match metadata for display.
- Apply the same command matching rule without fuzzy surprise matches.

### 3. Performance/cache layer

Responsible for making manager previews, filtering, and search feel instant without heavy background processes.

Responsibilities:

- Keep core storage local and lightweight.
- Add rebuildable `.data/` cache artifacts only with clear purpose: note summaries, search artifacts, preview snippets, latest rebuild metadata.
- Let TUI maintain session-local caches for note summaries and recently focused previews.
- Avoid full-body reads during ordinary manager navigation when preview snippets are enough.
- Avoid recomputing folder trees from scratch on every keystroke if summaries have not changed.
- Debounce expensive work, not local input state.
- Expose latest rebuild/indexing status for topbar/status surfaces.

### 4. TUI theme and responsive layout layer

Responsibilities:

- Use default terminal background rather than painting the whole app dark blue.
- Normal text should be white.
- Use semantic color roles:
  - primary blue for focus/hover/active pane
  - green for saved/success
  - orange for dirty/pending/indexing
  - red for destructive/error
  - purple for command/action accent
  - gray for metadata/disabled text
- Separate regions with modern styling: fills, subtle separators, headers, active pane indicators, symbols where useful.
- Reduce overuse of plain border boxes.
- Provide responsive decisions for preview visibility, shortcut priority, and topbar metadata.

### 5. Manager workspace layer

Responsibilities:

- Show current path as Layout 1 title.
- Show current focused file/folder name as Layout 2 title.
- Remove unnecessary visual `notes/inbox` container framing.
- Provide a simple topbar and responsive bottom bar.
- Keep arrow navigation immediate.
- Ensure preview update does not block focus movement.
- Make filtering contains-style, immediate, and optimized over loaded summaries/folder rows.
- Skip preview reads/rendering when preview is hidden or toggled off.

### 6. Editor workspace layer

Responsibilities:

- Try OpenTUI `TextareaRenderable` first.
- Validate it in real TTY before depending on it.
- If textarea fails, use controlled custom fallback.
- Provide visible cursor, arrow navigation, text editing, paste support, save/autosave, dirty protection, word-wrap toggle, overflow indicator, and responsive bottom bar.
- Keep `Ctrl+C` quit semantics unless explicitly redesigned; support `Ctrl+Shift+C/V` only where reliably detectable.

### 7. Search Everything workspace layer

Responsibilities:

- Use shared contains-style matching.
- Keep result list readable in all states.
- Support note, content, folder, and command results.
- Separate preview metadata/content/command sections visually.
- Hide preview on small height or user toggle.
- Preserve safe back navigation and unavailable-command status.

### 8. Test and smoke layer

Responsibilities:

- Add regression tests for `.data` migration and mixed-root handling.
- Add search correctness tests for contains-style semantics and no fuzzy false positives.
- Add performance-sensitive tests for manager filtering/preview behavior where practical.
- Add real TTY smoke coverage for editor cursor/input viability, responsive bottom bar, manager preview toggle, and Search Everything preview/readability where feasible.

## Data flow and workspace flows

### Managed root initialization flow

1. `bn init` resolves the managed root.
2. Root layout helper creates `notes/`, `.data/`, `.data/notes/`, `.data/tmp/`, `.data/logs/`, and required manifest/index directories.
3. Manifest records the current internal layout/schema version.
4. No `.state/` directory is created for new roots.
5. User note files remain plain Markdown under `notes/`.

### Existing `.state` root migration flow

1. Startup/init/migrate/rebuild detects `.state/`.
2. If `.data/` does not exist, create `.data/`, migrate canonical metadata, and rebuild derived indexes under `.data/`.
3. If `.data/` and `.state/` both exist, detect whether `.state/` is stale or conflicting.
4. If conflicting, stop with a clear user-facing error and guidance.
5. After migration, CLI/TUI read from `.data/`.
6. Repeated migration is idempotent.

Migration may change BlueNote-owned internal files, but must not rewrite user Markdown notes except through already-existing note migration commands when explicitly invoked.

### Note mutation flow under `.data`

1. Core command selects/resolves the note.
2. Plain Markdown body file is created/updated/moved/deleted.
3. Metadata sidecar under `.data/notes/` is created/updated/moved/deleted.
4. Derived indexes/caches under `.data/` are rebuilt or incrementally refreshed.
5. TUI session caches receive refresh/invalidation events.
6. Latest rebuild/update status becomes available to topbar/status surfaces.

### CLI search flow

For `bn search <query>`:

1. Normalize query by trimming and case-folding.
2. Search key, filename, relative path, title, description, and indexed content/body.
3. Include a note only if at least one candidate field contains the normalized query as a substring.
4. Rank included notes deterministically.
5. Render grouped output with matched field/source label and excerpts where relevant.
6. Preserve rebuild guidance when indexes are missing/corrupt.

Examples:

- Query `123` matches `Receipt 123`, `meeting-123.md`, or body text containing `123`.
- Query `abc` does not match `a-big-cat` unless `abc` appears contiguously.

### Manager filter/navigation flow

1. Filter input state updates immediately on every key.
2. Row filtering uses already-loaded summaries/folder tree and contains-style matching.
3. Current focused row is preserved when possible.
4. Preview update is separated from key echo.
5. Folder tree is not rebuilt from scratch unless summaries changed.
6. Preview toggle/auto-hide decides whether preview work is needed.

Navigation changes focus immediately; preview uses cached snippets or deferred load and does not block movement.

### Editor flow

Primary textarea path:

1. Opening a note creates/focuses an OpenTUI `TextareaRenderable`.
2. Initial value comes from selected plain Markdown body.
3. Textarea owns cursor, arrow navigation, selection, wrap mode, and text mutations.
4. `onContentChange` updates controller editor state and autosave.
5. `onCursorChange` updates view model status where needed.
6. Save/autosave writes body through existing core service path.
7. Flex layout keeps bottom bar anchored during resize.

Textarea viability spike must confirm typing, cursor, arrows, newline, save, back behavior, resize, paste/fallback, and no duplicate focused textarea after rerender.

Fallback custom editor path:

1. Controlled display surface renders body text.
2. Controller owns cursor offset, viewport, selection, and wrap mode.
3. Runtime key routing handles printable text, arrows, backspace/delete, paste, and save.
4. Save/autosave and dirty protection APIs stay the same.

### Search Everything flow

1. Query updates immediately.
2. Results come from note summaries, content search, folder/path candidates, and commands.
3. Inclusion uses contains-style matching.
4. Results are visibly typed.
5. Preview builds from highlighted result and hides when height is too small or preview is toggled off.
6. Enter dispatches by result type.

### Responsive layout flow

1. Renderer/controller receives dimensions.
2. Responsive helper computes visibility capabilities.
3. View models expose those decisions.
4. Renderers obey them.
5. Manual preview toggle is respected unless the terminal is too small.
6. Bottom bars use flex/layout anchoring, not fixed stale coordinates.

## Error handling, migration safety, and performance strategy

### `.data` migration safety

- New roots use `.data/` only.
- Existing `.state/` roots migrate to `.data/`.
- Markdown notes are not rewritten by `.data` migration.
- Derived indexes may be rebuilt instead of copied.
- Migration must be idempotent.
- Migration should leave enough recovery information to avoid silent data loss.
- Prefer copy + validate + archive/ignore over destructive move.
- Do not delete or rename `.state/` unless a detailed implementation plan explicitly includes it.

### Search correctness errors

- Contains-style matching is the inclusion contract.
- Empty/whitespace queries keep current calm CLI/TUI behavior.
- Corrupt/missing indexes preserve actionable rebuild guidance.
- Search Everything keeps input responsive and back navigation working if search/index data is unavailable.
- Manager filter over loaded rows should still work if content search index is unavailable.

### TUI async/error handling

- Key-triggered async actions catch their own errors when called fire-and-forget.
- Prompt modes remain recoverable after failure.
- Dirty editor content must not be discarded by navigation, create, delete, search open, or command action flows.
- Preview/search/save failures show calm visible statuses and preserve navigation/back paths.

### Performance strategy

- Perceived interaction should feel instant for common TUI flows.
- Low RAM/CPU remains more important than heavyweight precomputation.
- Focus movement and typed filter text should be synchronous and cheap.
- Preview loading should be cache-backed or async/deferred.
- Autosave should avoid heavyweight rebuilds per keystroke.
- Caches are added only with clear purpose and remain rebuildable.

### Visual fallback/error states

- Do not override the whole terminal background.
- Normal text white.
- Gray metadata and disabled shortcuts.
- Blue for focus/active pane/hover.
- Green for saved/success.
- Orange for dirty/pending/indexing.
- Red for errors/destructive confirmation.
- Purple only for command/action accent.

Failure states should be visible but calm: index unavailable, save failed, preview unavailable, command unavailable, and dirty guard blocked.

## Testing and verification strategy

### Storage and `.data` migration tests

Required coverage:

- New `bn init` creates `.data/`, not `.state/`.
- Existing `.state/` root migrates to `.data/`.
- Plain Markdown notes are not rewritten during `.data` migration.
- Sidecars/manifest are preserved under `.data/`.
- Derived indexes are rebuilt or validated under `.data/`.
- Re-running migration is idempotent.
- Mixed `.state` + `.data` roots handle stale vs conflicting data clearly.
- Existing CLI commands work after migration.
- Docs/smoke assertions no longer advertise `.state` as canonical.

### Search correctness tests

Required coverage:

- CLI `bn search 123` includes only notes whose searchable fields contain `123`.
- No fuzzy subsequence false positives.
- Case-insensitive contains behavior.
- Useful excerpts and deterministic ranking remain.
- Manager filter and Search Everything use the same contains semantics.
- Slash-command matching has no unrelated fuzzy results.
- Search behavior remains calm when indexes are missing/corrupt.

### Manager performance/responsiveness tests

Required coverage:

- Filter query updates immediately without waiting for preview/index work.
- Filtering uses loaded summaries/folder rows rather than full body reads.
- Focus movement does not synchronously re-read the same note body repeatedly.
- Preview cache avoids duplicate reads for repeated focus on the same note.
- Preview auto-hide and manual preview toggle work.
- Responsive topbar/bottombar hiding works.
- Layout titles and preview padding match the approved UI contract.

### Editor tests

Textarea viability spike must prove visible cursor, visible typing, arrows, mouse reposition if claimed, newline, save, back behavior, paste/fallback, resize anchoring, and no duplicate focused textarea after rerender.

Editor feature tests must cover topbar/bottombar metadata, wrap toggle, overflow indicator, paste/copy/cut where supported, dirty protection, autosave guards, and save failure recovery.

### Search Everything tests

Required coverage:

- Non-selected results remain readable.
- Selected result is visually distinct.
- Result list and preview are visibly separated.
- Preview metadata/content sections are separated.
- Result types display distinct labels/icons.
- Enter dispatches by type.
- Preview auto-hide/toggle works.
- Contains semantics are shared.
- Search/index failure keeps input responsive and back navigation working.

### Full verification gates

Before any Phase 4 subplan is accepted:

- task-specific tests pass
- parent session reruns task tests after subagent work
- spec review passes
- quality review passes
- commit is clean and scoped

Before finishing each Phase 4 subplan:

- `bun run typecheck`
- `bun test`
- `bun run smoke:opentui`
- `bun run smoke:opentui:interactive`
- `bun run smoke:cli`
- `git status --short --branch`

Before finishing the whole Phase 4 umbrella:

- all subplan checks pass
- docs/help/status are aligned
- final spec and quality reviews pass
