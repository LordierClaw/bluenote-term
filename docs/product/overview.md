# BlueNote Product Overview

BlueNote is a terminal-native note tool optimized for fast local capture, search, editing, and navigation.

## Product principles

- **File-first:** notes are ordinary Markdown files without required frontmatter; BlueNote-managed metadata lives in sidecar JSON under `.state/notes/`.
- **Local-first:** user files remain the source of truth inside a managed notes root.
- **Offline-first:** the first implementation phase must work fully offline.
- **AI-optional:** AI, sync, backend, cloud, and mobile are future concerns, not Phase 1 requirements.

## Phase 1 scope

Included in the initial local product scope:

- managed root initialization
- plain Markdown note storage plus `.state/notes/` sidecars
- rebuildable metadata/search indexing with `sql.js` and MiniSearch
- terminal CLI flows for init, new, list, search, show, edit, archive, delete, rebuild, completion, and migrate
- key-based selector UX for everyday note targeting instead of UUID-driven workflows
- grouped search output that shows one ranked block per matching note
- automatic index rebuilds after CLI mutations so list/search/completion reflect changes immediately
- automated validation and smoke checks
- Phase 2 prepares the first OpenTUI shell and editor-oriented workflows; Phase 1 should only leave the repo ready for that work

Explicitly out of scope for Phase 1:

- AI processing or model calls
- sync backends and hosted services
- cloud login/subscriptions
- mobile clients

## Delivery stance

Implementation should proceed in phases. Architecture constraints should remain strict until local file, index, and TUI behavior are stable.
