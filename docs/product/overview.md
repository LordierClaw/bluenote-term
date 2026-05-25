# BlueNote Product Overview

BlueNote is a terminal-native note tool optimized for fast local capture, search, editing, and navigation.

## Product principles

- **File-first:** notes are ordinary Markdown files without required frontmatter; BlueNote-managed metadata lives in sidecar JSON under `.state/notes/`.
- **Local-first:** user files remain the source of truth inside a managed notes root.
- **Offline-first:** the local CLI and storage workflow must work fully offline.
- **AI-optional:** AI, sync, backend, cloud, and mobile are future concerns, not current CLI/storage requirements.

## Current delivered scope

Delivered by the distinct Phase 2 CLI storage/UX pivot:

- managed root initialization
- plain Markdown note storage plus `.state/notes/` sidecars
- approved `.state/` support directories for completions, temp work, logs, and recovery
- rebuildable metadata/search indexing with `sql.js` and MiniSearch
- terminal CLI flows for init, new, list, search, show, edit, archive, delete, rebuild, completion, migrate, and the `tui` shell entrypoint
- `key|path` selector UX for everyday note targeting
- grouped search output that shows one ranked block per matching note
- automatic index rebuilds after CLI mutations so list/search/completion reflect changes immediately
- automated validation and smoke checks
- the dedicated TUI shell is now exposed as `bn tui`, while the Phase 2 storage-oriented commands remain unchanged
- the current Phase 3 shell supports live startup, note browsing, note-open/navigation return, and inline editing through the shared keymap
- the current inline editing slice covers text insertion, cursor movement, `Backspace`, `Delete`, save, and discard flows in the live shell

Still out of scope:

- AI processing or model calls
- sync backends and hosted services
- cloud login/subscriptions
- mobile clients

## Delivery stance

Implementation should proceed in phases. Architecture constraints should remain strict until local file, index, and TUI behavior are stable.
