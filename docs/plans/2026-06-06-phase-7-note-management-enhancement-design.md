# Phase 7 — Note Management Enhancement Design

## Scope and plan disambiguation

This is the approved Phase 7 design for BlueNote note-management enhancements.

- **New design path:** `docs/plans/2026-06-06-phase-7-note-management-enhancement-design.md`
- **Implementation plan path:** `docs/plans/2026-06-06-phase-7-note-management-enhancement-implementation-plan.md`
- **Out of scope historical phases:** Phase 0–6 documents under `docs/phases/` and prior plans remain historical context only. Phase 7 does not migrate old `notes/inbox`, `notes/journal`, or `notes/archive` roots.
- **Fresh-root assumption:** For this branch, old managed roots are treated as not present. The local development root was reset manually before design. New code should initialize the Phase 7 layout directly and does not need an automatic migration from the old `notes/` tree.
- **Preserved contracts:** note files remain plain Markdown; BlueNote metadata remains in `.data/notes/*.json`; derived indexes remain rebuildable; AI remains opt-in and non-blocking.

## Goals

Phase 7 makes BlueNote start directly in the editor, introduces first-class draft notes, supports nested normal-note folders, and adds fast metadata-aware note/folder management.

The user-facing goals are:

1. Start TUI in the latest-opened note when it is fresh, otherwise create/open a draft.
2. Store drafts under a protected `draft/` folder and normal notes under a nested `note/` tree.
3. Promote drafts into normal notes through `Alt+S` or `/save-draft-as`.
4. Support quick same-folder note switching in the editor.
5. Replace the old CLI `bn new --title ...` behavior with content/clipboard-based creation that defaults to drafts.
6. Let Manager create/rename normal-note folders, rename notes, and move normal notes under `note/`.
7. Keep sidecar metadata synchronized quickly and partially during move/rename/promote/archive operations.

## Approved storage layout

Fresh initialized roots use:

```text
~/.bluenote/
├── note/
├── draft/
└── .data/
    ├── config.json
    ├── latest-opened-note.json
    ├── archive/
    ├── metadata.sqlite
    ├── search-index.json
    ├── notes/
    │   └── <key>.json
    └── ai/
```

Rules:

- Active normal notes live under `note/`.
- Draft notes live under `draft/`.
- Archived note Markdown files live in flat hidden storage at `.data/archive/<key>.md`.
- `note/` supports nested custom folders.
- `draft/` is protected/system-managed; users cannot create custom folders there through Manager or CLI.
- Phase 7 does not automatically migrate old `notes/...` layouts.

## Sidecar metadata model

Sidecars add a required `type` field:

```ts
type NoteType = "normal" | "draft" | "archived"
```

Type/path invariants:

- `type: "normal"` => `relativePath` starts with `note/` and `archivedAt` is `null`.
- `type: "draft"` => `relativePath` starts with `draft/` and `archivedAt` is `null`.
- `type: "archived"` => `relativePath` starts with `.data/archive/` and `archivedAt` is an ISO timestamp.

Plain Markdown note bodies remain metadata-free. Existing AI sidecar metadata is preserved when possible during partial updates.

## Draft note contract

A draft note is a note with generated or user-provided title/key/filename stored under `draft/`.

Generated drafts use:

```text
title: draft-{random6}
key: draft-{random6}
path: draft/draft-{random6}.md
type: draft
```

where `{random6}` is a lowercase 6-character random suffix.

If the user creates a draft with an explicit title through CLI, title/key/filename stay synchronized using the current title-to-key rules, but the note still lives under `draft/` and has `type: "draft"`.

Drafts are promoted, not copied. Save Draft As Normal moves the same note into `note/...`, derives a new key/filename from the destination title, updates sidecar metadata, and removes the old draft path.

## TUI startup and latest-opened behavior

TUI startup behavior:

1. Read `.data/latest-opened-note.json` if present.
2. Read `.data/config.json.latestOpenedNoteTtlDays`, defaulting to 7 days.
3. If the latest-opened relative path still exists and `openedAt` is within the TTL, open that exact note in Editor.
4. If the latest-opened note is stale, missing, invalid, or unreadable, create and open a new draft note.
5. Do not fall back to the most recently updated note.

Latest-opened state stores relative path as the primary locator:

```json
{
  "relativePath": "note/work/example.md",
  "openedAt": "2026-06-06T00:00:00.000Z"
}
```

Update latest-opened whenever the editor opens a note, including startup restore, Manager open, quick switch, new draft creation, and draft promotion. If an open note is renamed, moved, archived, or promoted, update the relative path accordingly.

## Manager behavior

Manager always opens the directory of the currently open note:

- Current note `note/work/example.md` => Manager opens `note/work/`.
- Current note `draft/draft-a8k2p9.md` => Manager opens `draft/`.

Normal `note/...` folder ordering:

1. Folders at top.
2. Alphabetical ascending.
3. Notes alphabetical ascending after folders.

Draft folder ordering:

- Draft notes sorted by `createdAt` descending.

Manager actions:

- Create folder: available anywhere inside `note/`, including nested folders; unavailable in `draft/`.
- Rename folder: allowed for custom folders anywhere inside `note/`; not allowed for `note/` root or `draft/`; update affected note sidecars partially.
- Rename note title: derive new key/filename from the new title and keep title/key/filename synchronized.
- Move note: allowed only for normal notes under `note/`; destination chooser selects existing folders under `note/`; drafts leave `draft/` only through Save Draft As Normal.

## Save Draft As Normal

Entry points:

- Editor shortcut: `Alt+S`
- Editor slash command: `/save-draft-as`

Behavior:

1. Only available for draft notes.
2. Open a manager-like save screen/location chooser.
3. Let the user select an existing destination folder under `note/`; `draft/` is not selectable.
4. Let the user edit a pre-filled title initialized to the current draft title.
5. On confirm, move the note to `note/<selected-folder>/<title-derived-key>.md`, update sidecar to `type: "normal"`, update title/key/path/timestamps, preserve relevant metadata, rebuild affected indexes, return to Editor on the promoted note, and update latest-opened.
6. The chooser does not create folders. Folder creation remains a Manager action.

## Quick same-folder switching

Editor supports same-folder switching:

- `Ctrl+PageUp`: previous note in the current folder.
- `Ctrl+PageDown`: next note in the current folder.

The order follows Manager note ordering for that folder. After switching, show a transient blue index indicator at the topbar left of the note title, e.g. `03/10`, and hide it after 2 seconds.

## CLI `bn new` contract

Current `bn new --title <title>` behavior is replaced.

Body source is required and must be exactly one of:

- positional quoted body content
- `--clipboard`

Clipboard behavior:

- If clipboard text is empty or unavailable, fail clearly and create no note.

Draft defaults:

```bash
bn new "body content"
bn new --title "Idea" "body content"
bn new --clipboard
bn new --title "Idea" --clipboard
```

Without `--path`, `bn new` always creates a draft in `draft/`.

Normal note creation requires `--path` and `--title`:

```bash
bn new --path note/work/projects --title "Meeting" "body content"
bn new --path note/work/projects --title "Meeting" --clipboard
```

Rules:

- `--path` must point to an existing folder under `note/`.
- `--path` requires `--title`.
- `--path draft/...` is rejected.
- Missing content source is a usage error.
- Missing destination folder is a usage error; `bn new` does not create folders.

## CLI visibility flags

Default CLI note visibility is normal notes only.

- Default: `type: "normal"` only.
- `--drafts`: include normal + draft notes.
- `--all`: include normal + draft + archived notes.

No dedicated draft-only CLI flag is added in Phase 7; draft-only browsing is a Manager/TUI concern.

Specific behavior:

- `bn list`: normal only.
- `bn list --drafts`: normal + drafts.
- `bn list --all`: normal + drafts + archived.
- `bn search`: normal only.
- `bn search --drafts`: normal + drafts.
- `bn search --all`: normal + drafts + archived.
- `bn show/edit/delete`: normal only by default; `--drafts` includes drafts; `--all` includes archived.
- `bn edit --drafts <selector>` allows external-editor editing of drafts.

## Archive contract

Archiving remains supported with new hidden storage.

- Archive normal notes to `.data/archive/<key>.md`.
- Update sidecar `type: "archived"`, `relativePath`, `archivedAt`, and `updatedAt`.
- Archived notes are excluded from default Manager/list/search/show/edit/delete resolution.
- Archived notes appear only through explicit CLI `--all` visibility or archive-aware flows.

## Metadata and performance approach

Metadata updates should be partial and fast for move/rename/promote/archive operations.

Required partial update behavior:

- Move normal note: update only affected note sidecar fields (`relativePath`, `updatedAt`, and any necessary AI staleness/index fields).
- Rename note title: update `key`, `title`, `relativePath`, `updatedAt`, move sidecar filename if key changes, preserve `createdAt`, description, AI metadata, and other unaffected fields.
- Rename folder: update only sidecars for notes under the renamed folder.
- Promote draft: update `type`, `key`, `title`, `relativePath`, `updatedAt`, preserve `createdAt`, description, body, and AI metadata where valid.
- Archive: update `type`, `relativePath`, `archivedAt`, `updatedAt`.

Indexes should refresh after mutations so CLI/TUI views remain consistent. Derived state remains rebuildable.

## Testing strategy

Implementation should use TDD with small task commits. Required coverage includes:

- root layout initialization
- sidecar schema and validation
- draft/normal/archive path invariants
- `bn new` body-source/title/path/clipboard errors
- CLI visibility flags
- archive hidden storage
- latest-opened TTL/missing-note startup behavior
- Manager folder sorting, draft sorting, create/rename/move/title actions
- Save Draft As Normal through controller/runtime path
- quick switching and transient index indicator state
- docs/help contract alignment

At least one final real CLI workflow test should exercise create draft, create normal with `--path`, list/search flags, archive, and visibility behavior through `bin/bn.ts`.

## Approved decisions log

- Option A — Fresh layout + explicit note types — is approved.
- Startup opens the exact latest-opened note only if fresh and present; otherwise creates a draft.
- Old `notes/...` migration is out of scope.
- Local existing root was reset manually before this design.
- Draft generated names use `draft-{random6}`.
- Draft title/key/filename stay synchronized.
- Draft promotion moves the note and removes the draft path.
- Nested folders under `note/` are allowed.
- Manager title edit renames title/key/filename together.
- Latest-opened TTL lives in `.data/config.json`.
- CLI keeps command name `bn new`.
- Clipboard empty/unavailable fails with no note created.
- `bn new` with no body source fails.
- Manager create folder is available anywhere inside `note/`.
- Manager folder rename is available for custom folders inside `note/`.
- Normal Manager ordering is folders first, alphabetical ascending.
- Draft Manager ordering is created date descending.
- Save Draft As Normal command is `/save-draft-as`; shortcut is `Alt+S`.
- Save/move chooser selects existing folders only.
- Latest-opened updates whenever editor opens a note.
- Latest-opened primary locator is relative path.
- Manager opens `draft/` for current draft notes.
- Normal move action excludes drafts.
- Archive files use `.data/archive/<key>.md`.
- Archived notes use both `type: "archived"` and `archivedAt`.
- CLI `--drafts` means normal + drafts; `--all` means normal + drafts + archived.
- No draft-only CLI flag in Phase 7.
- `bn edit --drafts` can edit drafts externally.
- `bn new --path` requires an existing `note/...` folder and a title.
- Save Draft As Normal pre-fills title with current draft title.
