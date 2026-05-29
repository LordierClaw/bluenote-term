# BlueNote Product Overview

BlueNote is a terminal-native note tool optimized for fast local capture, search, editing, and navigation.

## Product principles

- **File-first:** notes are ordinary Markdown files without required frontmatter; BlueNote-managed metadata lives in sidecar JSON under `.data/notes/`.
- **Local-first:** user files remain the source of truth inside a managed notes root.
- **Offline-first:** the local CLI and storage/TUI workflow must work fully offline.
- **AI-optional:** AI, sync, backend, cloud, and mobile are future concerns, not current CLI/storage/TUI requirements.
- **Quiet Blue Dashboard UI:** TUI/UI work follows the canonical design language in `docs/product/design-language.md` unless a later approved design changes it.

## Current delivered scope

Delivered by the distinct Phase 2 CLI storage/UX pivot, Phase 3 TUI workspace, Phase 4A `.data`/contains-search foundation, Phase 4B editor input/cursor/responsive chrome, Phase 4C Manager performance/responsive layout/style, Phase 4D Search Everything readability/responsive preview, Phase 4E autosave atomicity / safe note-body write, and Phase 4F TUI cleanup/navigation/filtering/save-bug work:

- managed root initialization
- plain Markdown note storage plus `.data/notes/` sidecars
- approved `.data/` support directories for completions, temp work, logs, and recovery
- rebuildable metadata/search artifacts at `.data/metadata.sqlite` and `.data/search-index.json` using `sql.js` and MiniSearch
- terminal CLI flows for init, new, list, search, show, edit, archive, delete, rebuild, completion, migrate, and tui
- `key|path` selector UX for everyday note targeting
- contains-style search output that shows one ranked block per matching note; query `123` only matches notes whose visible fields or content contain `123`
- automatic index rebuilds after CLI mutations so list/search/completion reflect changes immediately
- automated validation and smoke checks
- `bn tui`, the Phase 3 OpenTUI workspace over the same visible command/storage contract
- accepted Phase 4E save behavior: autosave and manual `Ctrl+S` share the same safe note-body write path; failed saves keep the buffer dirty and retry later; no recovery-copy workflow is created; stale temp files are a BlueNote-owned internal implementation detail
- accepted Phase 4F TUI cleanup/navigation/filtering/save behavior: Manager topbar filtered count, opened-note full-path bottom path, filtered result navigation, editor border/title removal, editor topbar/bottom bar contract, and real TTY smoke coverage for autosave and manager switching after edit

## Phase 3 TUI model

The TUI workspace launches with `bn tui` and is intentionally split into separate screens. It uses a restrained blue palette for focus, active items, muted secondary text, and consistent top/bottom chrome rather than broad state-by-color presentation rules:

- **Manager:** a minimal Manager screen with a responsive two-column browser/preview model over CLI-compatible note summaries, paths, keys, titles, and descriptions. Phase 4C Manager performance/responsive layout/style is accepted and delivered: chrome stays contextual around the current folder panel title, preview context, compact app status, short action hints, cached/avoidable preview work, preview auto-hide, and a manual preview toggle. Phase 4F TUI cleanup/navigation/filtering/save is accepted and delivered: the Manager topbar shows filtered count plus app status without path/selection clutter, the open-note bottom path is exactly the currently opened note full path, or an empty/calm placeholder when no note is open, filtering reports a filtered count, and filtered result navigation opens the selected filtered result. Right/open navigates into folders or opens notes; left/back or `Esc` returns to the previous folder or screen; `/` filters, `n` creates a new note, `d` deletes the focused note only after confirmation, and `Ctrl+P` opens Search Everything.
- **Editor:** focused inline editing of the selected plain Markdown note body. Current wired Phase 3 behavior includes live typing/input regression coverage, Unicode-safe buffer updates, save, dirty-state handling, `Ctrl+F` find mode, `Ctrl+H` replace mode, `Ctrl+Z`/`Ctrl+Y` undo/redo, terminal-friendly `Ctrl+Shift+C/X/V` copy/cut/paste, and 750ms autosave with stale-completion guards. Phase 4E autosave atomicity is accepted and delivered: autosave and manual `Ctrl+S` use the same safe note-body write path, failed saves keep the buffer dirty and retry later, no recovery-copy workflow is created, and stale temp files are a BlueNote-owned internal implementation detail. Phase 4F editor border is removed and the `Editor body` title is removed; the editor topbar shows note name, path, and modified time, while the bottom bar shows `Line`/`Col`, wrap mode, save/autosave status, and shortcuts including persistent `Ctrl+P` Search and `Esc` Manager hints. The Editor does not add metadata frontmatter to note files.
- **Search Everything:** global note/content/folder search plus slash-prefixed command entries for workspace/action discovery, opened from Manager or Editor with `Ctrl+P` and presented as a single input, result list, and preview. Phase 4D Search Everything readability/responsive preview is accepted and delivered: it keeps contains-style semantics, readable typed results, separated preview sections, responsive preview auto-hide, a manual `Alt+P` preview toggle, and safe unavailable command status for commands without wired handlers. `/save` is wired as a built-in runtime action; the other command entries are discoverable adapter outputs until command handlers are connected. `Esc`, `Ctrl+[`, or `Ctrl+P` closes Search Everything back to the invoking screen.

The current bootstrap status marker is `phase-4f-tui-cleanup-navigation-save-bugs`. The current neutral follow-up marker is `phase-4-next-hardening-subplan`; scratch/archive hardening remains future hardening and is not delivered.

Across screens, `Escape` and `Ctrl+[` apply the same back rule: close the active mode or overlay first, then return to the prior screen/folder toward the root manager. Quitting remains an explicit `q` or `Ctrl+C` action.

Shell completion remains shell setup through `bn completion <bash|zsh|fish>`, not a TUI action. The TUI may surface command discovery, but completion script generation belongs to the CLI.

## Storage and search contract

Notes remain plain Markdown under `notes/`; BlueNote metadata sidecars are stored under `.data/notes/`. Derived metadata/search artifacts are rebuildable under `.data/` as `.data/metadata.sqlite` and `.data/search-index.json`. Legacy `.state/` directories are migration input only and are not the active canonical storage layout.

`bn search`, Manager filtering, Search Everything, and slash-command discovery use contains-style matching rather than subsequence matching. For example, `123` matches `Receipt 123`, `meeting-123.md`, or body text containing `123`, but it does not match notes without an actual `123` substring in a searchable field or content.

Still out of scope:

- AI processing or model calls
- sync backends and hosted services
- cloud login/subscriptions
- mobile clients

## Delivery stance

Implementation should proceed in phases. Architecture constraints should remain strict until local file, index, and TUI behavior are stable.
