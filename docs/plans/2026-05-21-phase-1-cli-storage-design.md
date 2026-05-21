# Phase 1 CLI + Storage Design

Date: 2026-05-21
Status: Approved brainstorm baseline
Scope: BlueNote Phase 1 product implementation

## Context

BlueNote is a terminal-native, local-first note tool. The repository is currently in scaffold mode, and Phase 1 is intended to implement the first real local product slice:

- managed root initialization
- Markdown + frontmatter note storage
- rebuildable metadata and full-text indexing
- essential command-line flows

This design follows current repo constraints:

- local-first and offline-first only
- Markdown files with frontmatter remain the source of truth
- no AI, sync, hosted backend, or cloud assumptions in Phase 1
- Bun is preferred for repo entrypoints and TUI/dev workflows
- shared core code should remain Node.js 20+ compatible where practical
- rebuildable metadata cache should use `sql.js`
- search should use MiniSearch
- the TUI must remain a presentation/input layer over reusable core services

## Product direction chosen during brainstorming

The approved direction for Phase 1 is:

- optimize for **CLI usability first**
- use a **command-first CLI**
- include **basic `$EDITOR` handoff**
- use a **service-first core with a thin command layer**

## Alternatives considered

### A. Thin CLI over direct file operations

Put most behavior directly in the CLI layer with only a small set of shared helpers.

**Pros**
- fastest path to a working CLI
- low upfront abstraction cost

**Cons**
- couples CLI and business rules early
- weaker reuse for the future TUI
- likely duplication across commands
- harder to keep tests clean and layered

### B. Service-first core with a thin command layer — recommended

Keep CLI responsibilities small and place product logic in reusable services.

**Pros**
- best fit for repo architecture rules
- keeps TUI reuse open for Phase 2
- supports testable business rules
- centralizes file/index/editor invariants cleanly

**Cons**
- slightly slower to set up
- requires discipline to avoid overengineering

### C. Workflow-first command objects

Implement each command as its own orchestration object over lighter shared helpers.

**Pros**
- clear command-to-code mapping
- readable command orchestration

**Cons**
- weaker long-term reuse than service-first design
- cross-command rules still risk fragmentation

## Architecture overview

Phase 1 should be implemented as a thin CLI shell over reusable local services.

```text
bin/bn.ts
  ↓
src/cli/
  - argument parsing
  - command dispatch
  - output formatting
  - exit codes
  ↓
src/core/
  - note workflows / use cases
  - validation + business rules
  - command-independent operations
  ↓
src/storage/        src/index/         src/platform/      src/config/
  - file I/O        - metadata cache   - $EDITOR          - config loading
  - frontmatter     - text index       - env/process      - root resolution
  - root layout     - rebuild/search   - path safety      - defaults
```

## Layer responsibilities

### `src/cli/`

Owns:
- parsing commands and flags
- help/usage text
- rendering human-facing output
- stderr formatting
- mapping domain failures to exit codes

Does not own:
- note format rules
- filesystem layout rules
- indexing logic
- editor selection policy

### `src/core/`

Owns Phase 1 use cases and command-independent product logic.

Primary use cases:
- initialize managed root
- create note
- list notes
- show note
- search notes
- open note in editor
- archive note
- rebuild indexes

Example operations:
- `initRoot(...)`
- `createNote(...)`
- `listNotes(...)`
- `showNote(...)`
- `searchNotes(...)`
- `editNote(...)`
- `archiveNote(...)`
- `rebuildIndexes(...)`

### `src/storage/`

Owns canonical file-backed data and managed-root behavior.

Responsibilities:
- managed root creation
- note path conventions
- Markdown + YAML frontmatter read/write
- archive moves
- content hashing support
- safe path handling within the managed root

This layer protects the rule that canonical state lives in files.

### `src/index/`

Owns rebuildable derived state.

Responsibilities:
- `sql.js` metadata representation
- MiniSearch full-text index
- rebuild process from files
- cache invalidation/update behavior
- recovery when derived artifacts are missing or corrupt

Design stance:
- indexing is derived state, never canonical state
- deleting caches must be survivable via rebuild from files

### `src/platform/`

Owns local environment integration.

Responsibilities:
- resolve and launch `$EDITOR`
- subprocess execution for edit handoff
- path and process safety helpers
- optionally deterministic adapters for time/UUID if useful in tests

### `src/config/`

Owns minimal user/config state for Phase 1.

Responsibilities:
- managed root resolution
- config defaults
- reading/writing config under `.bluenote/`
- future user preferences that should not live in note files

Keep this intentionally small in Phase 1.

## Command surface

Recommended core Phase 1 command set:

- `bn init`
- `bn new`
- `bn list`
- `bn show <id|path|slug>`
- `bn search <query>`
- `bn edit <id|path|slug>`
- `bn archive <id|path|slug>`
- `bn rebuild`

Possible later additions, but not part of the first core slice:
- `bn doctor`
- `bn config`
- `bn today`
- `bn scratch`

The first eight commands form the baseline scope for implementation planning.

## Component responsibilities

### Root service
- locate the managed root
- initialize the directory layout
- verify expected subdirectories exist
- prevent accidental operations outside the root

### Note repository
- create note files
- load note files
- list candidate note files
- move notes into archive
- persist frontmatter/body changes

### Frontmatter codec
- parse YAML frontmatter
- validate minimum schema
- serialize canonical frontmatter
- surface invalid-note errors without silently rewriting broken files

### Note selector / resolver
- resolve `id|path|slug`
- define deterministic precedence rules
- return ambiguity failures clearly

Recommended selector precedence:
1. exact ID match
2. exact managed-root-relative path
3. unique slug/title-derived match
4. fail on ambiguity

### Index service
- build metadata cache from notes
- build MiniSearch documents from note content
- answer search/list queries efficiently
- rebuild cleanly from files
- optionally support per-note sync later if needed

### Editor service
- choose editor command from env/config
- launch editor safely
- return exit status cleanly
- avoid owning note selection or note mutation rules

For Phase 1, editing is simple handoff rather than a live editing subsystem.

## Command flows

### `bn init`
1. resolve target root
2. refuse dangerous path cases
3. create managed directories/files
4. write minimal config/state if required
5. print next steps

### `bn new`
1. parse title/tags/mode/location args
2. construct note metadata
3. serialize Markdown + frontmatter
4. save note in default location
5. update or rebuild indexes
6. print created path and/or ID

### `bn list`
1. load query/filter args
2. ask index for matching note summaries
3. render concise rows
4. fall back to rebuild guidance if derived state is unavailable

### `bn show`
1. resolve note selector
2. load canonical note file
3. print note content and/or metadata summary

### `bn search`
1. parse query
2. query MiniSearch-backed service
3. render ranked matches with enough context to act

### `bn edit`
1. resolve note selector
2. confirm file exists inside managed root
3. launch `$EDITOR <file>`
4. after editor returns, refresh changed metadata/index state

### `bn archive`
1. resolve note selector
2. move file to archive location
3. update archive metadata if required by the format
4. refresh index state
5. print resulting archive path

### `bn rebuild`
1. scan all note files
2. parse and validate each note
3. recreate metadata and search caches from scratch
4. report invalid files clearly
5. exit nonzero if validation failures occur

## Data flow

### Create/edit path
`CLI command`
→ `core use case`
→ `storage write or editor handoff`
→ `post-write re-read if needed`
→ `index refresh/rebuild`
→ `CLI output`

### Read/search path
`CLI command`
→ `core use case`
→ `index lookup or repository load`
→ `format result`
→ `CLI output`

### Recovery path
`missing/corrupt cache`
→ `core detects derived-state failure`
→ `rebuild from canonical files`
→ `resume operation or return actionable error`

## Error-handling approach

Phase 1 should use a structured, user-readable error model with clear separation between categories.

### Error categories

#### Usage errors
Examples:
- unknown command
- missing required arguments
- unsupported flag combinations

Behavior:
- print concise error
- show relevant usage hint
- exit nonzero

#### Root/setup errors
Examples:
- managed root not initialized
- invalid root path
- partially missing root directories
- symlink/path escape attempts

Behavior:
- explain the problem
- provide a corrective command where possible
- never silently create unrelated paths during read operations

#### Note-format errors
Examples:
- invalid YAML
- missing required frontmatter fields
- bad timestamps
- duplicate IDs
- inconsistent archive metadata

Behavior:
- report exact file and validation failure
- never silently rewrite malformed notes
- allow rebuild to surface multiple invalid files in one run where practical

#### Selector resolution errors
Examples:
- no note matches selector
- multiple notes match selector
- selector points outside the managed root

Behavior:
- fail clearly
- show possible matches on ambiguity
- keep behavior deterministic rather than interactive

#### Editor integration errors
Examples:
- `$EDITOR` unset
- configured editor executable missing
- editor exits nonzero
- selected file disappears before launch

Behavior:
- show exact cause
- never corrupt the note
- only refresh indexes after a successful post-edit re-read path

#### Index/cache errors
Examples:
- missing cache files
- corrupt cache files
- out-of-sync derived state
- `sql.js` cache load failure

Behavior:
- treat caches as disposable derived state
- prefer automatic rebuild when safe and cheap
- otherwise return actionable guidance such as `run 'bn rebuild'`

#### Internal errors
Examples:
- unexpected program bug

Behavior:
- return a short user-facing failure message
- avoid raw stack traces in normal operation
- reserve detailed traces for explicit debug modes later

### Error representation

Internally, prefer tagged/typed domain errors such as:
- `RootNotInitializedError`
- `InvalidFrontmatterError`
- `AmbiguousSelectorError`
- `EditorLaunchError`
- `IndexCorruptError`

The CLI layer should map those into:
- final message
- exit code
- optional hint or next-step action

### Exit-code stance

Keep exit codes simple in Phase 1:
- `0` — success
- `1` — usage or operational failure
- `2` — validation/data failure, especially useful for rebuild/validation workflows

## Testing strategy

Implementation should follow task-by-task TDD.

Per task:
1. write a failing test
2. confirm failure
3. implement the minimum change
4. confirm pass
5. refactor if needed
6. move to the next task

### Test pyramid

#### Unit tests
Highest volume and fastest feedback.

Cover:
- frontmatter parsing and serialization
- metadata validation
- selector resolution
- root path safety
- command argument parsing
- output formatting
- error mapping
- index document construction
- archive path rules

#### Service/use-case tests
Cover:
- `init` creates expected root layout
- `new` writes a valid note and updates index state
- `list` returns expected note summaries
- `show` resolves and loads correct note
- `search` returns ranked matches
- `edit` refreshes derived state after editor handoff
- `archive` moves note and updates visibility
- `rebuild` reconstructs caches from files and reports invalid notes

Use temporary directories and real files where helpful.

#### CLI integration tests
Cover:
- `bn --help`
- `bn init`
- `bn new`
- `bn list`
- `bn show`
- `bn search`
- `bn edit`
- `bn archive`
- `bn rebuild`

Focus on:
- exit codes
- stdout/stderr shape
- argument and flag behavior
- user-facing errors

#### Smoke checks
Preserve repo smoke expectations:
- `bun run smoke:cli`
- `bun run smoke:opentui`

For Phase 1, `smoke:cli` should evolve from `--help` only into a lightweight proof that the entrypoint still executes correctly.

### Test structure

Suggested layout:

- `tests/unit/cli/`
- `tests/unit/core/`
- `tests/unit/storage/`
- `tests/unit/index/`
- `tests/unit/config/`
- `tests/integration/cli-init.test.ts`
- `tests/integration/cli-new-list-show.test.ts`
- `tests/integration/cli-search.test.ts`
- `tests/integration/cli-edit.test.ts`
- `tests/integration/cli-archive.test.ts`
- `tests/integration/cli-rebuild.test.ts`
- `tests/fixtures/valid-notes/`
- `tests/fixtures/invalid-frontmatter/`
- `tests/fixtures/duplicate-ids/`
- `tests/fixtures/ambiguous-selectors/`

### Key testing recommendations

1. Use temporary managed roots heavily.
2. Keep editor tests fakeable rather than relying on a real interactive editor.
3. Treat malformed note cases as core test cases, not edge cases.
4. Explicitly test rebuild after deleting derived artifacts.
5. Keep CLI output assertions stable but not overly brittle.

## Scope guardrails

To keep Phase 1 properly bounded, do not include:
- plugin systems
- event buses
- background daemons/watchers
- sync abstractions
- AI-assisted note behavior
- mutable database-as-source-of-truth designs
- interactive recovery prompts
- hidden retries that mutate user data

## Verification gates

Before considering an implementation chunk complete, run:

1. `bun run typecheck`
2. `bun test`
3. `bun run smoke:opentui`
4. `bun run smoke:cli`
5. `git status`

## Handoff to planning

This design establishes the approved baseline for the next phase:

- service-first core
- thin command layer
- command-first CLI UX
- basic editor handoff
- core commands: `init/new/list/show/search/edit/archive/rebuild`
- structured error model
- layered TDD-first testing

Next step: write a detailed implementation plan with small TDD-sized tasks under the writing-plans workflow.
