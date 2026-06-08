# Managed Root Layout

Current default managed user root:

```text
~/.bluenote/
├── note/                    # normal user notes and custom folders
├── draft/                   # draft notes
├── .data/
│   ├── archive/             # archived note files
│   ├── manifest.json
│   ├── metadata.sqlite
│   ├── search-index.json
│   ├── notes/
│   │   └── <key>.json
│   ├── ai/
│   │   ├── config.json
│   │   ├── codex-auth.json      # sensitive root-local Codex auth state
│   │   ├── prompts/
│   │   │   └── describe-note.md
│   │   ├── queue.json
│   │   └── logs/
│   ├── tmp/
│   ├── logs/
│   ├── recovery/
│   └── ...rebuildable state artifacts
```

`BLUENOTE_ROOT` can point at another managed root directory. BlueNote should not create a nested `.bluenote/.bluenote` layout inside an explicitly managed root.

## Rules

- note files remain canonical user data and plain Markdown
- `.data/notes/*.json` sidecars are canonical BlueNote metadata paired with note files
- `.data/archive/` stores archived note files outside the normal `note/` tree
- `.data/metadata.sqlite` and `.data/search-index.json` are rebuildable derived artifacts
- `.data/ai/` stores opt-in AI configuration, prompt templates, queued description jobs, auth state, and logs; OpenAI-compatible provider API keys in `.data/ai/config.json` are plaintext in Phase 6, while Codex provider config stores no OpenAI-compatible `baseUrl` or `apiKey`; `.data/ai/config.json` also stores non-secret preferences such as `maxAttempts` (default `3`) and `outputLanguage` (default `English`); `.data/ai/codex-auth.json` is sensitive root-local app state and must not be committed or shared
- `.data/tmp/`, `.data/logs/`, and `.data/recovery/` are BlueNote-managed support directories
- normal note I/O works offline and never performs AI provider calls; explicit CLI AI commands and TUI background AI actions require configured provider settings and network access
- AI description refreshes are queued locally in `.data/ai/queue.json`; users can process them manually with `bn ai describe <key|path>` or `bn ai process-queue [--limit <n>]`, failed jobs retry until their configured attempt limit with sanitized errors, and the TUI also schedules idle/background processing after saved editor changes; TUI AI startup scans, queue processing, provider calls, retries, status refreshes, and auth/setup checks do not block startup, rendering, typing, navigation, note switching, save/autosave, or quit
- pending AI work is durable and recovered on TUI startup by scanning note sidecar `updatedAt` timestamps against `ai.description.lastProcessedAt`
- autosave and manual `Ctrl+S` use the same safe note-body write path; failed saves keep the buffer dirty and retry later
- current save behavior does not write recovery copies or promote stale temp files into notes
- `.state/` is legacy migration input only; current commands migrate safe legacy metadata into `.data/` and do not treat `.state/` as canonical
- `bn search` uses contains-style matching; query `123` only matches actual searchable fields or note content containing `123`
- symlinks escaping the managed root must not be followed silently
