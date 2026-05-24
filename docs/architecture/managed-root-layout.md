# Managed Root Layout

Current managed user root:

```text
~/.bluenote/
├── notes/
│   ├── inbox/
│   ├── journal/
│   └── archive/
├── scratches/
├── templates/
├── .state/
│   ├── manifest.json
│   ├── metadata.sqlite
│   ├── search-index.json
│   ├── notes/
│   │   └── <key>.json
│   ├── completions/
│   ├── tmp/
│   ├── logs/
│   ├── recovery/
│   └── ...rebuildable state artifacts
```

## Rules

- note files remain canonical user data
- `.state/notes/*.json` sidecars are canonical BlueNote metadata paired with note files
- `.state/metadata.sqlite` and `.state/search-index.json` are rebuildable
- `.state/completions/`, `.state/tmp/`, and `.state/logs/` are BlueNote-managed support directories under the approved Phase 2 layout
- `.state/recovery/` stores recovery artifacts where needed
- BlueNote does not create a nested `.bluenote/.bluenote` layout
- symlinks escaping the managed root must not be followed silently
