# Phase 2 — CLI Storage + UX Pivot

## Goal

Deliver the approved storage and command-contract pivot for the local-first CLI.

## Primary outcomes

- store canonical note content as plain Markdown files under `notes/`
- store canonical BlueNote metadata as `.state/notes/<key>.json` sidecars
- use the approved `.state/` layout, including `completions/`, `tmp/`, `logs/`, and rebuildable derived indexes
- expose a user-facing CLI surface of `init`, `new`, `list`, `show`, `search`, `edit`, `archive`, `delete`, `rebuild`, `migrate`, and `completion`
- resolve user-facing note selectors by canonical `key|path`
- keep migration from legacy frontmatter/UUID roots explicit via `bn migrate`
- keep the TUI shell as a separate later-phase deliverable rather than part of this pivot
