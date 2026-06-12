# BlueNote

BlueNote is a terminal-native notes app built for local Markdown files. It gives you a small CLI and a full-screen terminal workspace for capture, browsing, search, and editing.

BlueNote keeps normal note bodies as plain `.md` files under `note/` and drafts under `draft/`. App metadata lives separately in `.data/notes/`, so your notes remain readable in any editor and easy to back up with ordinary file tools.

## What it does

- Stores notes as plain Markdown files, without required frontmatter.
- Keeps titles, descriptions, timestamps, and paths in sidecar JSON files.
- Provides CLI commands for creating, listing, showing, searching, editing, archiving, deleting, rebuilding, and opt-in AI description generation.
- Includes a terminal UI with a Manager, Editor, and Search Everything palette.
- Uses contains-style search, so queries match real substrings in titles, paths, descriptions, and note bodies.
- Runs locally. BlueNote does not require accounts, sync services, hosted backends, or cloud storage for core note workflows. Optional AI commands require a configured provider and network access; OpenAI-compatible API-key providers remain supported, and the Codex provider now has root-local CLI auth commands.

## Requirements

- Bun 1.3 or newer
- Node.js 20 or newer for shared TypeScript/runtime compatibility
- A terminal with standard keyboard input

## Install from source

For the full BlueNote app, install/run the distribution CLI (`@lordierclaw/bluenote`) and use this package as the optional terminal client discovered on `PATH` as `bluenote-term`. End users normally install the app and clients like this:

```bash
npm install -g @lordierclaw/bluenote
npm install -g bluenote-term
bluenote doctor
```

When working from sibling source checkouts, build/check the core library first, then this client, then the distribution CLI last:

```bash
cd ../bluenote-core
npm ci --include=dev
npm run check

cd ../bluenote-term
bun install
bun run check
bun link

cd ../bluenote
npm ci --include=dev
npm run check
npm link

bluenote doctor
```

After cloning the repository, install dependencies and check the local runtime:

```bash
bun install
bun run check:env
```

Local development expects sibling checkouts:

```text
../bluenote-core
../bluenote-term
../bluenote
```

`package.json` uses a reproducible pinned Git dependency for `@lordierclaw/bluenote-core`. For active local core development, build/check the sibling core package first, then reinstall/check the terminal client and relink it if you need `bluenote-term` on `PATH`:

```bash
cd ../bluenote-core
npm ci --include=dev
npm run check

cd ../bluenote-term
bun install
bun run check
bun link
```

See [Development](DEVELOPMENT.md) for local `file:`, reproducible Git tag, and future npm dependency modes. Do not import from `@lordierclaw/bluenote-core/src/*` or relative paths into `../bluenote-core/src/*`.

Run the CLI directly from the repository with:

```bash
bun run ./bin/bn.ts --help
```

You can also link or wrap `bin/bn.ts` as `bn` if you want it on your `PATH`.

## Releases

Portable GitHub Release archives are available for Windows and Linux users as ready-to-run packages. See [Release Workflow](docs/workflow/releases.md) for artifact names, extraction steps, checksum verification, and the maintainer tag flow.

## Quick start

```bash
# Initialize a BlueNote root in the current directory.
bun run ./bin/bn.ts init

# Create a draft, or pass --path note/<folder> with --title to create a normal note
# in an existing folder under note/.
bun run ./bin/bn.ts new --title "Project notes" "Initial content"
mkdir -p note/work
bun run ./bin/bn.ts new --path note/work --title "Project notes" "Initial content"

# List and search notes.
bun run ./bin/bn.ts list
bun run ./bin/bn.ts search project

# Show or edit by key or path.
bun run ./bin/bn.ts show <key|path>
EDITOR="$EDITOR" bun run ./bin/bn.ts edit <key|path>

# Open the terminal workspace.
bun run ./bin/bn.ts tui

# Optional: configure AI description generation, then process note descriptions.
bun run ./bin/bn.ts ai config set --base-url https://api.openai.com/v1 --api-key "$OPENAI_API_KEY" --model gpt-4o-mini
bun run ./bin/bn.ts ai describe <key|path>
bun run ./bin/bn.ts ai process-queue

# Optional: configure Codex, authenticate root-locally, then use AI commands.
bun run ./bin/bn.ts ai config set --provider codex --model <model>
bun run ./bin/bn.ts ai codex auth login
bun run ./bin/bn.ts ai codex auth status
bun run ./bin/bn.ts ai codex auth logout
```

When installed on your `PATH`, use `bn` or `bluenote` instead of `bun run ./bin/bn.ts`.

## Commands

| Command | Description |
| --- | --- |
| `init` | Initialize the managed BlueNote root. |
| `new [--title <title>] [--path note/<folder>] [--clipboard] <body>` | Create a draft from positional body text or clipboard; `--path` creates a normal note under `note/`. |
| `list [--drafts|--all]` | List notes with title, key, description, and path; default output shows normal notes, `--drafts` also includes drafts, and `--all` also includes archived notes. |
| `show [--drafts|--all] <key|path>` | Print a note summary and body. |
| `search [--drafts|--all] <query>` | Search indexed notes with contains-style matching; default output searches normal notes, `--drafts` also includes drafts, and `--all` also includes archived notes. |
| `edit [--drafts|--all] <key|path>` | Open a matching note in `$EDITOR`. |
| `archive [--drafts|--all] <key|path>` | Move a normal note to hidden `.data/archive/`. |
| `delete [--drafts|--all] <key|path> --force` | Permanently remove a note and its sidecar. |
| `rebuild` | Rebuild derived metadata and search indexes. |
| `tui` | Launch the terminal UI workspace. |
| `ai config set --base-url <url> --api-key <key> --model <model>` | Opt in to AI by configuring an OpenAI-compatible provider. |
| `ai config set --provider codex --model <model>` | Select the Codex provider. |
| `ai config show` | Show AI provider settings with the API key masked. |
| `ai codex auth login` | Authenticate Codex with root-local device-code OAuth. |
| `ai codex auth status` | Show Codex auth status without secrets. |
| `ai codex auth logout` | Remove stored Codex auth while keeping AI config. |
| `ai describe <key|path>` | Generate and automatically apply a description for one note. |
| `ai queue` | Show pending AI description refresh jobs. |
| `ai process-queue [--limit <n>]` | Manually process queued description refreshes. |

## Optional AI descriptions

BlueNote's AI feature is opt-in. Core CLI, storage, search, and TUI workflows continue to work offline without a provider. AI description generation only runs when you configure a provider and invoke an AI command or TUI background AI action; provider calls require network access.

Configure the current OpenAI-compatible provider with:

```bash
bn ai config set --base-url <url> --api-key <key> --model <model>
```

Warning: the API key is stored in plaintext under `.data/ai/config.json`. Do not commit or share a BlueNote managed root that contains secrets. `bn ai config show` masks the key for display, but the local config file remains plaintext in this phase. AI config also supports `--max-attempts <n>` for failed queue-job retries (default `3`) and `--output-language <text>` for the default generated description language (default `English`).

Codex provider auth is also available:

```bash
bn ai config set --provider codex --model <model>
bn ai codex auth login
bn ai codex auth status
bn ai codex auth logout
```

Codex provider now supports root-local `bn ai codex auth login`, `bn ai codex auth status`, and `bn ai codex auth logout`. Codex auth state is stored root-locally at `.data/ai/codex-auth.json` and is sensitive app state. Do not commit or share a managed root containing this file, OAuth codes, bearer tokens, refresh tokens, or API keys.

After note changes, BlueNote records cheap local queue updates under `.data/ai/queue.json`; normal create/edit/autosave paths do not perform network calls. Manual save and autosave never call the configured provider API. TUI editor changes schedule queue processing after the note is safely saved and the editor reaches a 10-second editor idle timer. Switching from Editor to Manager re-arms the same pending note on a 5-second manager idle timer, and opening another note from Manager queues the previous note immediately. All TUI AI work runs in the background: startup scans, idle queue processing, explicit TUI AI commands, provider calls, retries, status refreshes, and auth/setup checks do not block startup, rendering, typing, editing, navigation, note switching, saves, autosave, or quit. The TUI never starts `bn ai codex auth login` automatically; login is an explicit CLI action. CLI AI commands such as `bn ai describe` and `bn ai process-queue` remain foreground command executions; the non-blocking guarantee applies to the interactive TUI path.

Pending AI work is durable in `.data/ai/queue.json` and is recovered on TUI startup by scanning note sidecars for stale descriptions. Run `bn ai describe <key|path>` to refresh one note immediately, or `bn ai process-queue [--limit <n>]` to process queued stale descriptions. Failed queue jobs are retried until their configured maximum attempts, then left failed with sanitized error details. Generated descriptions must be one short sentence under 10 words and are automatically written to the note sidecar; there is no approval/reject flow in Phase 6. The default prompt asks for a direct description or summary description in the configured output language. Manager shows the AI status on the right side of the current-open row, omits normal queued-count wording, and colors status intent; Editor hides AI status and keeps editor shortcuts visible. Freshness is tracked with `ai.description.lastProcessedAt` timestamp metadata in the note sidecar for this phase.

## Storage layout

A BlueNote root separates user-authored notes from BlueNote-managed data:

```text
note/                 # normal user notes and custom folders
draft/                # draft notes
.data/
  archive/            # archived note files
  notes/              # sidecar metadata JSON
  ai/                 # opt-in AI config, prompts, queue, and logs
    config.json       # plaintext provider settings when configured
    codex-auth.json   # sensitive root-local Codex auth state when authenticated
    prompts/
      describe-note.md
    queue.json
    logs/
  recovery/
  tmp/
  logs/
  manifest.json
  metadata.sqlite     # rebuildable derived metadata cache
  search-index.json   # rebuildable derived search index
```

The note file is the source of the note body. Sidecars hold metadata that BlueNote needs for selection, search, display, and bookkeeping. Derived files such as `.data/metadata.sqlite` and `.data/search-index.json` can be recreated with:

```bash
bun run ./bin/bn.ts rebuild
```

## Search behavior

BlueNote search is deliberately literal. A query matches when the normalized query text appears in a searchable field or note body. For example, `123` can match `Receipt 123`, `meeting-123.md`, or body text containing `123`. It will not match unrelated fuzzy or subsequence results.

The CLI, Manager filtering, and Search Everything use the same contains-style contract.

## Terminal UI

Launch the workspace with:

```bash
bun run ./bin/bn.ts tui
```

The TUI reads and writes the same Markdown files and sidecars as the CLI. On startup, it reopens the latest recently opened note when that path is still valid, or creates and opens a fresh draft when there is no recent valid note.

### Manager

The Manager is a two-column browser and preview screen. It shows folders and notes, keeps empty user folders visible, and hides BlueNote internal folders.

Common controls:

| Key | Action |
| --- | --- |
| `Right` / `Enter` | Open a folder or note. |
| `Left`, `Esc`, `Ctrl+[` | Go back toward the root manager. |
| `/` | Filter visible notes and folders. |
| `n` | Create a note or folder in the current `note/` folder. |
| `N` | Create and open a quick draft. |
| `r` | Rename the focused note or folder. |
| `m` | Move the focused normal note to an existing `note/` folder. |
| `d` | Delete the focused note after confirmation. |
| `p` | Toggle the preview pane. |
| `e` | Return to the editor. |
| `Ctrl+P` | Open Search Everything. |
| `q` / `Ctrl+C` | Quit. |

### Editor

The Editor supports inline body editing, Unicode-safe cursor movement, newline, backspace, delete, undo/redo, wrap mode, `Ctrl+F` find, `Ctrl+R` replace, and `Ctrl+S` save. `Alt+S` saves an open draft as a normal note by choosing an existing `note/` folder and destination title. `Ctrl+PageDown` and `Ctrl+PageUp` switch to the next or previous note in the same folder; after switching, the topbar shows a temporary blue index label such as `03/10` before the title.

Autosave runs after 750 ms. Autosave and manual save use the same safe note-body write path. If a save fails, BlueNote keeps the buffer dirty and retries later.

BlueNote leaves normal visible-text selection to the terminal. Use your terminal's mouse selection and `Ctrl+Shift+C` to copy visible text, and `Ctrl+Shift+V` to paste. Whole-note clipboard operations are available through Search Everything commands: `/copy-all`, `/replace-all`, and `/paste`.

### Search Everything

`Ctrl+P` opens Search Everything from the Manager or Editor. Results include notes, body matches, folders, paths, and commands that work in the current context.

Editor commands include `/find`, `/replace`, `/save`, `/save-draft-as`, `/copy-all`, `/replace-all`, and `/paste`. Manager commands include `/new` and, when a note action is available, `/delete`.

## Development

This repository is currently in the Phase 8 separated-core setup (see `docs/phases/phase-8-temporary-monorepo.md`) with:

- `@lordierclaw/bluenote-core` from the sibling `../bluenote-core` repository: headless business logic, storage, search, indexing, domain helpers, and reusable AI services.
- `packages/term` (`bluenote-term`): the Bun-first CLI/TUI client, including `bn`/`bluenote` entrypoints, OpenTUI screens, terminal editor launch, clipboard helpers, and client orchestration. It consumes business logic through `@lordierclaw/bluenote-core` public exports.

The root `bin/bn.ts` and moved root `src/cli`, `src/tui`, `src/platform`, and editor-flow paths are compatibility shims so existing source imports, tests, and `bun run ./bin/bn.ts ...` usage keep working during the migration.

Run the full local verification suite:

```bash
bun run check
```

Useful individual checks:

```bash
bun run typecheck
bun run lint
bun test
bun run smoke:opentui
bun run smoke:cli
```

## Contributing

Issues and pull requests are welcome. Please keep changes within BlueNote's current scope: local/offline CLI and TUI behavior, plain Markdown note bodies, and sidecar metadata under `.data/notes/`.

Before opening a pull request, run the checks listed in the pull request template. If a check is not available on your machine, note that in the PR.

## License

Apache License 2.0. See [LICENSE](LICENSE).
