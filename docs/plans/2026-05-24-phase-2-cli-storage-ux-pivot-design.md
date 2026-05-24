# Phase 2 CLI Storage + UX Pivot Design

Date: 2026-05-24
Status: Approved brainstorm baseline
Scope: BlueNote Phase 2 CLI storage and UX redesign

## Context

BlueNote Phase 1 established a working local CLI flow, but manual testing exposed several UX and storage issues that require a new phase rather than incremental patching:

- the managed root currently uses a nested `.bluenote/.bluenote/` internal layout
- note files are named by UUID, which is poor selector UX for `show`, `edit`, `archive`, and related commands
- `search` output is index-shaped rather than human-oriented
- note metadata currently lives in frontmatter instead of separate internal state
- documentation drifted behind behavior changes during earlier Phase 1 work

This design replaces the current frontmatter + UUID model with a plain-file + sidecar metadata model while keeping BlueNote local-first, offline-first, and Bun-first.

## Approved product direction

The approved direction for this phase is:

- keep a single top-level `.bluenote/` managed root
- replace nested internal app state with `.bluenote/.state/`
- keep note files as plain content only, with no frontmatter
- store BlueNote-owned metadata separately under `.state/`
- use a human-friendly mutable note key as the only identifier
- improve CLI output for selection and search
- add real shell completion support for bash, zsh, and fish
- add an explicit migration path from the current frontmatter/UUID storage model
- treat README and architecture docs as required deliverables, not optional cleanup

## Alternatives considered

### A. Filename/key as canonical identity with centralized metadata

Store note files plainly, keep the key as the only identifier, and store all metadata in a central metadata store.

**Pros**
- closest to the desired UX
- no hidden UUIDs
- simpler mental model than split identity

**Cons**
- centralized metadata can become less debuggable than per-note sidecars
- rename flows still need careful coordination

### B. Path-canonical identity with a human-friendly alias

Treat file path as the internal anchor and expose a human-friendly key as a CLI alias.

**Pros**
- simpler internal stability during rename flows
- works well with filesystem-based tooling

**Cons**
- does not match the approved product requirement that the human-friendly key be the only identifier
- leaks implementation concepts into user UX

### C. Plain note files with sidecar metadata in `.state/notes/` — approved

Store note bodies as plain files and keep one JSON sidecar per note under `.state/notes/`, with rebuildable SQLite and search indexes under `.state/`.

**Pros**
- best match for the approved plain-file requirement
- keeps content directories clean and portable
- sidecars are easy to inspect, validate, and extend
- creates a clear future home for AI-generated descriptions without modifying note files

**Cons**
- rename flows must keep file and sidecar in sync
- migration is more significant than a simple frontmatter refactor

## Architecture overview

BlueNote Phase 2 should preserve a thin CLI over reusable services while changing the canonical storage contract.

```text
bin/bn.ts
  ↓
src/cli/
  - argument parsing
  - command dispatch
  - human-facing output
  - shell completion entrypoints
  ↓
src/core/
  - create/show/list/search/edit/archive/delete/migrate workflows
  - note key generation + rename planning
  - auto-refresh orchestration
  - migration + validation policies
  ↓
src/storage/           src/index/            src/platform/        src/config/
  - plain note files   - sqlite metadata      - $EDITOR            - root resolution
  - sidecar metadata   - search index         - process/env        - manifest handling
  - root layout        - rebuild/load         - path safety        - defaults
  - migration I/O      - completion queries   - atomic file ops    - storage versioning
```

### Canonical vs derived state

Canonical state:
- plain note files under `notes/`
- sidecar metadata files under `.state/notes/`
- `.state/manifest.json`

Derived state:
- `.state/metadata.sqlite`
- `.state/search-index.json`
- any selector/completion caches if introduced

The design keeps derived state rebuildable and treats note files plus sidecars as the storage truth.

## Managed root layout

Approved target layout:

```text
.bluenote/
├── notes/
│   ├── inbox/
│   ├── journal/
│   └── archive/
├── scratches/
├── templates/
└── .state/
    ├── notes/
    ├── metadata.sqlite
    ├── search-index.json
    ├── completions/
    ├── recovery/
    ├── tmp/
    ├── logs/
    └── manifest.json
```

### Layout responsibilities

- `notes/` holds canonical user note content as plain files
- `.state/notes/` holds one sidecar JSON metadata record per note
- `metadata.sqlite` and `search-index.json` remain rebuildable caches
- `.state/recovery/` stores recovery artifacts for migration, rename, and delete safety
- `.state/completions/` may hold generated completion artifacts or install helpers
- `.state/manifest.json` records storage schema and migration/version metadata

## Note identity and naming rules

### Identity model

Each note uses one user-facing mutable key:

```text
<slug>-<shortid>
```

Example:
- title: `Note Work #24`
- key: `note-work-24-abc123`
- file: `notes/inbox/note-work-24-abc123.md`
- sidecar: `.state/notes/note-work-24-abc123.json`

There is no hidden immutable UUID.

### Title, key, and filename relationship

- `title` is the human display label and lives in sidecar metadata
- `key` is derived from the title using slug normalization plus a short random suffix
- `filename` is the note key plus `.md`

### Mutable identity rule

Identity may change when the title changes, but body edits alone should not constantly churn filenames.

Recommended rule:
- explicit title change or title regeneration → key may change
- body-only edit without title change → key stays stable
- archive moves location only and does not change key

### Sidecar metadata shape

Recommended canonical sidecar:

```json
{
  "key": "note-work-24-abc123",
  "title": "Note Work #24",
  "description": "Meeting notes about rollout risks ... incident playbook update",
  "relativePath": "notes/inbox/note-work-24-abc123.md",
  "createdAt": "2026-05-24T12:00:00.000Z",
  "updatedAt": "2026-05-24T12:10:00.000Z",
  "archivedAt": null,
  "namingVersion": 1
}
```

### Rename safety

When the title changes and a key update is required, BlueNote must treat the change as a transaction:
1. read current note + sidecar
2. compute new key
3. verify target file and sidecar paths are free
4. stage updates safely
5. move note file
6. write or move sidecar
7. rebuild derived indexes
8. clear recovery artifacts

On failure, recovery artifacts go to `.state/recovery/` and BlueNote must surface a human-readable failure.

## Command behavior changes

Phase 2 command surface:

```bash
bn init
bn new
bn list
bn show <key|path>
bn search <query>
bn edit <key|path>
bn archive <key|path>
bn delete <key|path>
bn rebuild
bn migrate
bn completion <shell>
```

### `bn init`
- creates the new `.state/` layout
- writes `.state/manifest.json`
- does not create nested `.bluenote/.bluenote`

### `bn new`
- creates a plain note file under `notes/inbox/`
- creates a matching sidecar under `.state/notes/`
- derives an initial description from the first and last words of the body
- automatically rebuilds derived indexes after success

### `bn list`
- should show human-oriented blocks or compact summaries with title, key, description preview, and path

### `bn show`
- resolves exact key or path
- reads sidecar and note body
- prints a readable detail view with title, key, path, description, and content

### `bn search`
- must search title, description, content, and optionally key/path
- must show grouped result blocks with explicit match source and contextual excerpt

### `bn edit`
- opens the plain note in `$EDITOR`
- after exit, refreshes `updatedAt`, description, derived indexes, and completion state
- if title changes, performs transactional rename and reports previous + new key

### `bn archive`
- moves the note file to `notes/archive/`
- updates sidecar `relativePath` and `archivedAt`
- preserves key
- automatically rebuilds derived indexes

### `bn delete`
- removes the note file and sidecar
- automatically rebuilds derived indexes
- should include a safety policy such as `--force` or TTY-only confirmation

### `bn rebuild`
- rebuilds derived indexes from note files plus sidecars
- validates missing sidecars, missing note files, key/path mismatches, invalid metadata, and duplicate collisions

### `bn migrate`
- explicitly converts old frontmatter + UUID storage into the new plain-file + sidecar model
- rebuilds derived indexes fresh after migration
- writes recovery artifacts and a key map for audit/debugging

## Search output design

Default `bn search` result format should be grouped blocks, one block per note:

```text
Note Work #24
  key: note-work-24-abc123
  path: notes/inbox/note-work-24-abc123.md
  match: content line 8
  excerpt:
    ...check deployment ordering, confirm backup window,
    and write the incident playbook update...
```

### Ranking priority
1. title match
2. description match
3. content/body match
4. key/path convenience match

### Output rules
- show one result block per matching note by default
- choose the best single explanation for the match
- always include the key so the user knows what to type next

## Shell completion design

Phase 2 should add real shell completion support for bash, zsh, and fish.

### Recommended interface
- `bn completion bash`
- `bn completion zsh`
- `bn completion fish`
- internal dynamic selector backend such as `bn complete selectors <command> <partial>`

### Scope
Completion should support:
- command names
- known flags
- note keys for `show`, `edit`, `archive`, and `delete`

Completion should fail quietly when state is missing or indexes are unavailable.

## Migration strategy

Because this phase changes the storage contract, migration must be explicit.

### Approved migration stance
- migrate canonical note content + metadata
- rebuild derived indexes fresh
- do not trust old derived artifacts as canonical

### `bn migrate` workflow
1. detect old-format, new-format, mixed-format, or empty root
2. validate preconditions
3. create a recovery snapshot in `.state/recovery/`
4. convert notes one by one from frontmatter to plain files
5. write sidecar metadata records
6. generate descriptions
7. write `.state/manifest.json`
8. rebuild derived indexes
9. print a migration summary

### Recovery artifacts
Store migration recovery data under `.state/recovery/migrate-<timestamp>/`, including:
- original raw note contents
- path/key mapping records
- migration manifest/logs

## Testing and rollout strategy

This design should be delivered as a new phase, not a silent continuation of Phase 1.

### Testing layers
- unit tests for key generation, sidecar rules, description generation, selector resolution, migration detection, and search ranking
- integration tests for each command workflow and auto-rebuild behavior
- at least one real CLI e2e workflow through `bin/bn.ts`
- completion integration tests for bash/zsh/fish script generation and selector output
- migration tests covering old-format conversion, recovery artifacts, and rebuild validation

### Documentation requirements
Treat docs updates as acceptance criteria:
- `README.md`
- `docs/product/overview.md`
- `docs/architecture/managed-root-layout.md`
- `docs/architecture/note-format-and-indexing.md`
- `docs/phases/phase-1-core-cli-storage.md`
- any related plan docs that would otherwise preserve outdated assumptions

### Validation gate before sign-off
Required repo checks:

```bash
bun run typecheck
bun test
bun run smoke:opentui
bun run smoke:cli
git status --short
```

Recommended additional phase checks:

```bash
bun test tests/e2e
bun test tests/integration
```

## Open implementation notes

- rename safety and migration correctness are the highest-risk areas
- completion should be real shell-native support, but its runtime path must stay quiet and fast
- description generation should remain deterministic and non-AI in this phase
- docs must be updated alongside behavior changes, not afterward

## Design outcome

This design replaces BlueNote’s current Phase 1 storage/UX assumptions with a plainer, more professional, more user-friendly model:
- plain note files
- `.state/` internal state
- human-friendly keys
- richer search output
- automatic mutation-triggered rebuilds
- shell completion
- explicit migration support

It remains local-first, offline-first, and service-oriented while preparing the codebase for future richer search and AI-assisted metadata generation without polluting note files.
