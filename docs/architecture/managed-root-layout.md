# Managed Root Layout

Planned managed user root:

```text
~/.bluenote/
├── notes/
│   ├── inbox/
│   ├── journal/
│   └── archive/
├── scratches/
├── templates/
├── .bluenote/
│   ├── config.json
│   ├── state.json
│   ├── cache.db
│   ├── search-index.json
│   ├── recovery/
│   ├── tmp/
│   └── logs/
└── .history/
```

## Rules

- note files remain canonical user data
- `.bluenote/cache.db` and `.bluenote/search-index.json` are rebuildable
- `.history/` stores backups and recovery artifacts where needed
- symlinks escaping the managed root must not be followed silently
