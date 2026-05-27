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
├── .data/
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

- note files remain canonical user data and plain Markdown
- `.data/notes/*.json` sidecars are canonical BlueNote metadata paired with note files
- `.data/metadata.sqlite` and `.data/search-index.json` are rebuildable derived artifacts
- `.data/completions/`, `.data/tmp/`, and `.data/logs/` are BlueNote-managed support directories
- `.data/recovery/` stores recovery artifacts where needed
- `.state/` is legacy migration input only; current commands migrate safe legacy metadata into `.data/` and do not treat `.state/` as canonical
- `bn search` uses contains-style matching; query `123` only matches actual searchable fields or note content containing `123`
- BlueNote does not create a nested `.bluenote/.bluenote` layout
- symlinks escaping the managed root must not be followed silently
