# Phase 1 — Core CLI and Storage

## Goal

Implement the local managed root, note file format, indexing, and the essential CLI flows.

## Primary outcomes

- initialize managed note root
- create/read/list/search/show/edit/archive/delete core notes
- store canonical data as plain Markdown plus `.state/notes/` sidecars
- rebuild metadata/search indexes from files
- provide shell completion output and selector completion helpers
- support `bn migrate` for legacy frontmatter roots with rollback-oriented safety checks
- validate archive/remove behavior
