# Note Format and Indexing

## Current note format

All new notes are plain Markdown files. BlueNote metadata is stored alongside them as sidecar JSON under `.data/notes/`.

Plain note file example:

```md
# Example title

Body text stays in the Markdown file with no required frontmatter.
```

Minimum sidecar shape:

```json
{
  "key": "example-title-51u7i0",
  "type": "normal",
  "title": "Example title",
  "description": "Body text stays in the Markdown file.",
  "relativePath": "note/example-title-51u7i0.md",
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
- `bn ai describe <key|path>` uses the same selector contract and automatically updates only the sidecar description when provider output is valid
- legacy frontmatter and the old `notes/` tree are not part of the Phase 7 storage contract

## Indexing design

Canonical state lives in files: plain Markdown note bodies under `note/` and draft bodies under `draft/`, with BlueNote metadata sidecars under `.data/notes/`.

Rebuildable caches:
- `.data/metadata.sqlite` `sql.js` metadata cache
- `.data/search-index.json` MiniSearch full-text index artifact

Indexing rules:
- use content hashes, not mtime alone, for change detection
- cache deletion must be recoverable by full rebuild from note files and `.data/notes/` sidecars
- invalid note/sidecar pairs should be reported, not silently rewritten
- grouped search output should show one block per note with key, path, match label, and excerpt when available
- `bn search` uses contains-style matching over key, filename/path, title, description, and body content; query `123` only matches fields or content containing `123`
- mutation commands should rebuild derived indexes automatically; `bn rebuild` remains the manual recovery path

## AI description indexing

Phase 6 AI description generation is opt-in and stores its operational state under `.data/ai/`, not in note files or frontmatter. OpenAI-compatible provider keys in `.data/ai/config.json` are plaintext in this phase and should not be committed or shared. Codex provider configuration stores provider/model settings without OpenAI-compatible API keys, while Codex provider auth state lives at `.data/ai/codex-auth.json` and is sensitive root-local app state that must not be committed or shared.

Note create/edit/autosave paths only update a local stale-description queue and continue to work offline. They do not call the configured provider. Users can manually run `bn ai describe <key|path>` for one note or `bn ai process-queue [--limit <n>]` for pending jobs; the TUI also schedules idle/background processing after saved editor changes, using a 10-second editor idle timer, a 5-second manager idle timer after switching from Editor to Manager, and immediate queueing when Manager opens another note. TUI startup recovers pending stale-description work by scanning sidecar `updatedAt` timestamps against `ai.description.lastProcessedAt`. All TUI AI provider work remains background/non-blocking for startup, rendering, typing, navigation, note switching, save/autosave, and quit. Provider processing requires configured provider settings and network access.

AI-generated descriptions are automatically written to `.data/notes/<key>.json` after validation. Valid output must be one short sentence under 10 words. Successful processing records timestamp-only freshness metadata at `ai.description.lastProcessedAt`; prompt/content hashes are not sidecar freshness fields in this phase. The Markdown note body remains plain user-authored content. Once applied, the description participates in `list`, `show`, `search`, Manager filtering, and Search Everything through the same sidecar/index contract as manually maintained descriptions.
