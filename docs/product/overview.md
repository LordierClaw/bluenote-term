# BlueNote Product Overview

BlueNote is a terminal-native note tool optimized for fast local capture, search, editing, and navigation.

## Product principles

- **File-first:** notes are ordinary Markdown files with YAML frontmatter.
- **Local-first:** user files remain the source of truth inside a managed notes root.
- **Offline-first:** the first implementation phase must work fully offline.
- **AI-optional:** AI, sync, backend, cloud, and mobile are future concerns, not Phase 1 requirements.

## Phase 1 scope

Included in the initial local product scope:

- managed root initialization
- Markdown + frontmatter note storage
- rebuildable metadata/search indexing with `sql.js` and MiniSearch
- terminal CLI flows for creation, listing, search, editing, archive, templates, today/scratch, config, and rebuild
- automated validation and smoke checks
- Phase 2 prepares the first OpenTUI shell and editor-oriented workflows; Phase 1 should only leave the repo ready for that work

Explicitly out of scope for Phase 1:

- AI processing or model calls
- sync backends and hosted services
- cloud login/subscriptions
- mobile clients

## Delivery stance

Implementation should proceed in phases. Architecture constraints should remain strict until local file, index, and TUI behavior are stable.
