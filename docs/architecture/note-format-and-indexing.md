# Note Format and Indexing

## Current note format

All new notes are plain Markdown files. BlueNote metadata is stored alongside them as sidecar JSON under `.state/notes/`.

Plain note file example:

```md
# Example title

Body text stays in the Markdown file with no required frontmatter.
```

Minimum sidecar shape:

```json
{
  "key": "example-title-51u7i0",
  "title": "Example title",
  "description": "Body text stays in the Markdown file.",
  "relativePath": "notes/inbox/example-title-51u7i0.md",
  "createdAt": "2026-05-12T10:15:00.000Z",
  "updatedAt": "2026-05-12T10:15:00.000Z",
  "archivedAt": null,
  "namingVersion": 1
}
```

Selector and CLI expectations:

- generated keys are the primary human-facing selectors
- `show`, `edit`, `archive`, and `delete` resolve by canonical `key|path` selectors in the Phase 2 user-facing contract
- `delete` requires `--force`
- legacy frontmatter remains relevant for migration compatibility, not canonical storage

## Indexing design

Canonical state lives in files.

Rebuildable caches:
- `sql.js` metadata cache
- MiniSearch full-text index

Indexing rules:
- use content hashes, not mtime alone, for change detection
- cache deletion must be recoverable by full rebuild from files
- invalid note/sidecar pairs should be reported, not silently rewritten
- grouped search output should show one block per note with key, path, match label, and excerpt when available
- mutation commands should rebuild derived indexes automatically; `bn rebuild` remains the manual recovery path
