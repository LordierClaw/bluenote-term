# BlueNote Product Overview

BlueNote is a terminal-native note tool optimized for fast local capture, search, editing, and navigation.

## Product principles

- **File-first:** notes are ordinary Markdown files without required frontmatter; BlueNote-managed metadata lives in sidecar JSON under `.state/notes/`.
- **Local-first:** user files remain the source of truth inside a managed notes root.
- **Offline-first:** the local CLI and storage/TUI workflow must work fully offline.
- **AI-optional:** AI, sync, backend, cloud, and mobile are future concerns, not current CLI/storage/TUI requirements.

## Current delivered scope

Delivered by the distinct Phase 2 CLI storage/UX pivot and Phase 3 TUI workspace:

- managed root initialization
- plain Markdown note storage plus `.state/notes/` sidecars
- approved `.state/` support directories for completions, temp work, logs, and recovery
- rebuildable metadata/search indexing with `sql.js` and MiniSearch
- terminal CLI flows for init, new, list, search, show, edit, archive, delete, rebuild, completion, migrate, and tui
- `key|path` selector UX for everyday note targeting
- grouped search output that shows one ranked block per matching note
- automatic index rebuilds after CLI mutations so list/search/completion reflect changes immediately
- automated validation and smoke checks
- `bn tui`, the Phase 3 OpenTUI workspace over the same visible command/storage contract

## Phase 3 TUI model

The TUI workspace launches with `bn tui` and is intentionally split into separate screens. It uses a restrained blue palette for focus, active items, muted secondary text, and consistent top/bottom chrome rather than broad state-by-color presentation rules:

- **Manager:** a minimal Manager screen with a two-column browser/preview model over CLI-compatible note summaries, paths, keys, titles, and descriptions. Its chrome stays contextual: current folder path, focused item/hovered path, and short action hints for move, open, filter, back, and quit. Right/open navigates into folders or opens notes; left/back returns to the previous folder or screen.
- **Editor:** focused inline editing of the selected plain Markdown note body. Current wired Phase 3 behavior includes Unicode-safe buffer updates, save, dirty-state handling, `Ctrl+F` find mode, and 750ms autosave with stale-completion guards. Select-all and cut/copy/paste remain adapter/controller groundwork for follow-on runtime wiring. The Editor does not add metadata frontmatter to note files.
- **Search Everything:** global note/content/folder search plus slash-prefixed command entries for workspace/action discovery, presented as a single input, result list, and preview. `/save` is wired as a built-in runtime action; the other command entries are discoverable adapter outputs until command handlers are connected.

Across screens, `Escape` and `Ctrl+[` apply the same back rule: close the active mode or overlay first, then return to the prior screen/folder toward the root manager. Quitting remains an explicit `q` or `Ctrl+C` action.

Shell completion remains shell setup through `bn completion <bash|zsh|fish>`, not a TUI action. The TUI may surface command discovery, but completion script generation belongs to the CLI.

Still out of scope:

- AI processing or model calls
- sync backends and hosted services
- cloud login/subscriptions
- mobile clients

## Delivery stance

Implementation should proceed in phases. Architecture constraints should remain strict until local file, index, and TUI behavior are stable.
