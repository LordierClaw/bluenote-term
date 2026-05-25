# BlueNote Product Overview

BlueNote is a terminal-native note tool optimized for fast local capture, search, editing, and navigation.

## Product principles

- **File-first:** notes are ordinary Markdown files without required frontmatter; BlueNote-managed metadata lives in sidecar JSON under `.state/notes/`.
- **Local-first:** user files remain the source of truth inside a managed notes root.
- **Offline-first:** the local CLI and storage workflow must work fully offline.
- **AI-optional:** AI, sync, backend, cloud, and mobile are future concerns, not current CLI/storage requirements.

## Current delivered scope

Delivered by the distinct Phase 2 CLI storage/UX pivot (complete before the Phase 3 TUI workspace):

- managed root initialization
- plain Markdown note storage plus `.state/notes/` sidecars
- approved `.state/` support directories for completions, temp work, logs, and recovery
- rebuildable metadata/search indexing with `sql.js` and MiniSearch
- terminal CLI flows for init, new, list, search, show, edit, archive, delete, rebuild, completion, and migrate
- `key|path` selector UX for everyday note targeting
- grouped search output that shows one ranked block per matching note
- automatic index rebuilds after CLI mutations so list/search/completion reflect changes immediately
- automated validation and smoke checks
- the dedicated TUI workspace is Phase 3 and must consume this visible command/storage contract rather than redefining it

Still out of scope:

- AI processing or model calls
- sync backends and hosted services
- cloud login/subscriptions
- mobile clients

## Delivery stance

Implementation should proceed in phases. Architecture constraints should remain strict until local file, index, and TUI behavior are stable.
