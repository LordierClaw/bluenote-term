# Note Format and Indexing

## Planned note format

All new notes should be Markdown files with YAML frontmatter.

Minimum metadata shape:

```yaml
---
id: <uuid>
schemaVersion: 1
title: Example title
mode: plain
tags: []
pinned: null
createdAt: 2026-05-12T10:15:00.000Z
updatedAt: 2026-05-12T10:15:00.000Z
archivedAt: null
---
```

## Indexing design

Canonical state lives in files.

Rebuildable caches:
- `sql.js` metadata cache
- MiniSearch full-text index

Indexing rules:
- use content hashes, not mtime alone, for change detection
- cache deletion must be recoverable by full rebuild from files
- invalid frontmatter should be reported, not silently rewritten
