# Phase 2 — CLI Storage + UX Pivot

## Goal

Deliver the storage and command-contract pivot for the local-first CLI.

## Primary outcomes

- store canonical note content as plain Markdown files under `notes/`
- store canonical BlueNote metadata as `.data/notes/<key>.json` sidecars
- keep rebuildable derived artifacts under `.data/`, including `metadata.sqlite` and `search-index.json`
- expose the current user-facing CLI surface: `init`, `new`, `list`, `show`, `search`, `edit`, `archive`, `delete`, `rebuild`, `migrate`, and `tui`
- resolve user-facing note selectors by canonical `key|path`
- keep migration from legacy frontmatter/UUID roots and legacy `.state/` metadata explicit via `bn migrate` or safe startup migration paths
- keep the TUI as a later presentation layer over the same core services and storage contract

## Current status

This is a historical delivery phase whose storage contract has been superseded by the later `.data` migration foundation. Current canonical state is `.data/notes/`; `.state/` is legacy migration input only.
