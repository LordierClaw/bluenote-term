# Phase 4E Autosave Atomicity Design

## Status

Approved on 2026-05-28.

This document is the dedicated Phase 4E design baseline for autosave/manual-save hardening. It intentionally follows the completed Phase 4A–4D subplans and must not be confused with the earlier Phase 3 TUI refinement plans.

## Context

Phase 4 is the Search, Editing, and Recovery Hardening milestone. Earlier Phase 4 subplans delivered:

- Phase 4A: `.data` migration, search correctness, and performance foundation.
- Phase 4B: editor input, cursor behavior, autosave state, and responsive chrome.
- Phase 4C: manager performance, responsive layout, and restrained style.
- Phase 4D: Search Everything correctness, readability, preview responsiveness, and failure resilience.

Phase 4E focuses on the reliability of note-body persistence from the TUI editor and repository edit path.

During design, manual testing found a current product blocker: **autosave and manual save do not reliably work in the real BlueNote TUI app**, even though controller-level tests report save success. Phase 4E must first reproduce and diagnose that real-app persistence failure before implementing the safer atomic writer.

## Goals

1. Reproduce the current real-app autosave/manual-save failure with a regression that verifies the actual Markdown note file on disk.
2. Identify whether the failure is caused by runtime key routing, editor input routing, save invocation, repository write behavior, index/rebuild refresh, or UI-only stale status.
3. Replace direct note-body overwrites in the existing edit path with a shared atomic note-body writer.
4. Route TUI autosave and manual `Ctrl+S` through that shared writer.
5. Preserve BlueNote's plain-note contract: note files remain plain Markdown content, and BlueNote metadata remains separate under the managed root's internal `.data` state.
6. Keep the failure behavior simple: failed saves keep the editor buffer dirty, show failure status, and retry later.

## Non-goals

- No recovery-copy or draft-copy system in Phase 4E.
- No startup recovery prompt.
- No recovery list screen.
- No external-editor redesign.
- No archive/history lifecycle hardening.
- No create/delete/rename transaction redesign.
- No autosave timing changes.
- No frontmatter or embedded note metadata.
- No background daemon or network sync.

## Approved behavior decisions

### Autosave model

Autosave writes directly to the actual plain Markdown note file.

### Autosave delay

Keep the existing `750ms` autosave delay. Phase 4E changes persistence safety and correctness, not editor timing.

### Manual save

Manual `Ctrl+S` must share the same persistence path as autosave.

### Recovery copies

Phase 4E does **not** create recovery drafts/copies. If autosave or manual save fails:

- keep the in-memory editor buffer dirty,
- show a calm visible failure status,
- leave the note file at the last successfully saved version,
- retry on the next autosave or manual save,
- do not create a recovery artifact.

### Stale temp files

BlueNote may create temporary files as part of atomic note-body writes. On startup/rebuild or another safe initialization point, BlueNote should silently clean up stale files that exactly match its own temp naming and safe location rules.

Cleanup must:

- never infer user intent from temp files,
- never promote temp files into real notes,
- never rewrite note files from stale temp files,
- avoid touching normal Markdown notes or unrelated temp files,
- surface cleanup failures only when they indicate unsafe paths or operational failure that should be visible to the caller.

### Writer scope

Use a shared note-body atomic writer for:

- TUI autosave,
- manual editor save (`Ctrl+S`),
- the existing repository `syncEditedNote()` body-write path.

Do **not** broaden Phase 4E to all note mutations. Create, archive, delete, rename, and broader multi-file transaction semantics remain future work unless directly required to fix the edit path.

## Approaches considered

### Approach A: TUI-only atomic writer

Only harden the TUI `persistTuiEditorBody()` path.

Pros:

- Smallest implementation change.
- Low immediate impact on CLI/repository behavior.

Cons:

- Duplicates persistence semantics.
- Leaves repository `syncEditedNote()` and any non-TUI edit path less safe.
- Makes it easier for future code to bypass the safer writer.

### Approach B: Shared note-body atomic writer — selected

Introduce a storage-level helper for atomic note-body replacement, then route TUI autosave/manual save and repository `syncEditedNote()` through it.

Pros:

- One canonical implementation for note-body replacement safety.
- Aligns TUI and repository edit behavior.
- Keeps storage rules out of rendering/controller code.
- Narrow enough for Phase 4E because it avoids create/archive/delete/rename redesign.

Cons:

- Requires repository integration tests and real TUI persistence coverage because an existing edit path changes.

### Approach C: All note mutations atomic

Apply atomicity to create, edit, archive, delete, rename, sidecars, and indexes.

Pros:

- Broadest reliability improvement.

Cons:

- Too large for Phase 4E.
- Mixes autosave hardening with lifecycle/history semantics.
- Likely requires a separate design for multi-file transactions and sidecar/index consistency.

## Proposed architecture

### 1. Real-app persistence regression first

Before changing persistence implementation, add a failing or currently diagnostic regression that exercises the real TUI path closely enough to reproduce the manual-test failure.

The regression must verify the note file on disk, not only controller state or a visible `Saved` label.

Minimum flow:

1. Create/init a temporary BlueNote root.
2. Create an existing note and rebuild indexes as needed.
3. Open the note through the real TUI/runtime path or the closest available interactive harness.
4. Type into the editor.
5. Wait past the `750ms` autosave delay.
6. Assert the actual Markdown note file contains the typed text.
7. Repeat or separately assert manual save via `Ctrl+S` persists typed text to disk.

The root-cause step must distinguish:

- runtime key routing failure,
- editor body input failure,
- autosave scheduler failure,
- `saveEditor()` invocation failure,
- repository write failure,
- index/rebuild refresh failure,
- UI status drift where the app reports saved but the file is unchanged.

### 2. Storage atomic body writer

Add a small storage-level helper, likely under `src/storage/`, responsible for replacing a note body file atomically.

Candidate behavior:

1. Validate the target note path is inside the managed root.
2. Ensure the parent directory exists.
3. Write the new Markdown body to a BlueNote-owned temporary file in a safe location.
4. Flush/close the temp file as safely as Bun/Node APIs reasonably allow.
5. Rename the temp file over the target note path.
6. Best-effort clean up the temp file on failure.
7. Surface normal errors to callers without swallowing write failures.

The helper must not:

- add frontmatter,
- write recovery drafts,
- infer restore behavior from temp files,
- mutate metadata sidecars directly,
- rebuild indexes by itself unless the existing caller already does so.

### 3. Repository integration

Update `createNoteRepository(root).syncEditedNote()` so the existing edit/sync path uses the atomic body replacement helper instead of direct `writeFileSync(normalizedNotePath, updatedMarkdown, "utf8")`.

Sidecar behavior remains the existing repository responsibility. If sidecar failure occurs after a successful atomic body write, Phase 4E should review and preserve the current rollback/error semantics as much as practical without broadening into a full multi-file transaction redesign.

### 4. TUI integration

`persistTuiEditorBody()` should continue to flow through the repository edit path unless root-cause debugging proves the current failure is elsewhere.

After integration:

- autosave uses the shared atomic writer,
- manual `Ctrl+S` uses the shared atomic writer,
- stale autosave completions do not mark newer buffers clean,
- failed saves keep the editor dirty and set the appropriate error status,
- user-visible status remains calm and minimal.

### 5. Temp cleanup

Add cleanup for stale BlueNote atomic-write temp files at a safe initialization point such as app/root initialization, rebuild, or TUI bootstrap.

Cleanup rules:

- delete only files matching BlueNote's exact temp naming and safe directory/path rules,
- never inspect or restore temp-file contents as user data,
- never delete unrelated files,
- keep cleanup best-effort unless a path-safety violation is detected.

## UI contract

No new recovery UI is added in Phase 4E.

Editor save states remain minimal:

- pending,
- saving,
- saved,
- error.

On save failure:

- keep the typed buffer in memory,
- keep the editor dirty,
- show failure status,
- allow the next autosave/manual save to retry.

## Testing strategy

### Real persistence regression

Add/extend interactive or integration coverage proving real TUI typing persists to the actual note file after autosave and manual save.

This test is mandatory because the manual bug report shows mocked controller coverage is insufficient.

### Unit/storage tests

- Atomic writer replaces the target note body on success.
- Failed temp write leaves the original note body unchanged.
- Failed rename leaves the original note body unchanged where the platform permits.
- Cleanup removes only known stale BlueNote temp files.
- Cleanup does not touch normal Markdown notes or unrelated temp files.

### Repository tests

- `syncEditedNote()` updates the note body through the shared atomic writer.
- Existing sidecar metadata remains aligned after successful edit.
- Body write failure returns an error and preserves the previous note body.
- Sidecar failure after body write preserves or clearly reports rollback behavior consistent with existing repository semantics.

### TUI/controller tests

- Autosave success marks the editor clean only after persistence succeeds.
- Autosave failure keeps the editor dirty and status `error`.
- Manual `Ctrl+S` failure keeps the editor dirty.
- Stale autosave completion does not clobber newer dirty state.

### Full verification gate

Before sign-off:

1. `bun run typecheck`
2. `bun test`
3. `bun run smoke:opentui`
4. `bun run smoke:opentui:interactive`
5. `bun run smoke:cli`
6. `git status --short --branch`

## Open implementation notes

- The implementation plan must start with the save/autosave reproduction task, not the atomic writer task.
- If the reproduction identifies a key-routing/input bug, fix that root cause before or alongside the atomic writer as a separate TDD task.
- If the reproduction harness exposes unrelated manager navigation issues, keep them clearly separated unless they block opening an editor for the persistence regression.
- Do not rely on UI text alone as proof of save correctness; always inspect the actual note file.
