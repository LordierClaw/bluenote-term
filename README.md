# BlueNote

BlueNote is a terminal-native notes app built for local Markdown files. It gives you a small CLI and a full-screen terminal workspace for capture, browsing, search, and editing.

BlueNote keeps note bodies as plain `.md` files under `notes/`. App metadata lives separately in `.data/notes/`, so your notes remain readable in any editor and easy to back up with ordinary file tools.

## What it does

- Stores notes as plain Markdown files, without required frontmatter.
- Keeps titles, descriptions, timestamps, and paths in sidecar JSON files.
- Provides CLI commands for creating, listing, showing, searching, editing, archiving, deleting, rebuilding, and migrating notes.
- Includes a terminal UI with a Manager, Editor, and Search Everything palette.
- Uses contains-style search, so queries match real substrings in titles, paths, descriptions, and note bodies.
- Runs locally. BlueNote does not require accounts, sync services, hosted backends, or cloud storage.

## Requirements

- Bun 1.3 or newer
- Node.js 20 or newer for shared TypeScript/runtime compatibility
- A terminal with standard keyboard input
- `tmux` only if you want to run the interactive smoke test

## Install from source

After cloning the repository, install dependencies and check the local runtime:

```bash
bun install
bun run check:env
```

Run the CLI directly from the repository with:

```bash
bun run ./bin/bn.ts --help
```

You can also link or wrap `bin/bn.ts` as `bn` if you want it on your `PATH`.

## Quick start

```bash
# Initialize a BlueNote root in the current directory.
bun run ./bin/bn.ts init

# Create a note.
bun run ./bin/bn.ts new --title "Project notes"

# List and search notes.
bun run ./bin/bn.ts list
bun run ./bin/bn.ts search project

# Show or edit by key or path.
bun run ./bin/bn.ts show <key|path>
EDITOR="$EDITOR" bun run ./bin/bn.ts edit <key|path>

# Open the terminal workspace.
bun run ./bin/bn.ts tui
```

When installed on your `PATH`, use `bn` or `bluenote` instead of `bun run ./bin/bn.ts`.

## Commands

| Command | Description |
| --- | --- |
| `init` | Initialize the managed BlueNote root. |
| `new --title <title>` | Create a note in `notes/inbox/` and print its key and path. |
| `list` | List active notes with title, key, description, and path. |
| `show <key|path>` | Print a note summary and body. |
| `search <query>` | Search indexed notes with contains-style matching. |
| `edit <key|path>` | Open a matching note in `$EDITOR`. |
| `archive <key|path>` | Move a note to `notes/archive/`. |
| `delete <key|path> --force` | Permanently remove a note and its sidecar. |
| `rebuild` | Rebuild derived metadata and search indexes. |
| `migrate` | Convert frontmatter-based notes into plain files plus sidecars. |
| `tui` | Launch the terminal UI workspace. |

## Storage layout

A BlueNote root separates user-authored notes from BlueNote-managed data:

```text
notes/
  inbox/
  journal/
  archive/
scratches/
templates/
.data/
  notes/              # sidecar metadata JSON
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

The TUI reads and writes the same Markdown files and sidecars as the CLI.

### Manager

The Manager is a two-column browser and preview screen. It shows folders and notes, keeps empty user folders visible, and hides BlueNote internal folders.

Common controls:

| Key | Action |
| --- | --- |
| `Right` / `Enter` | Open a folder or note. |
| `Left`, `Esc`, `Ctrl+[` | Go back toward the root manager. |
| `/` | Filter visible notes and folders. |
| `n` | Create a note. |
| `d` | Delete the focused note after confirmation. |
| `Ctrl+P` | Open Search Everything. |
| `q` / `Ctrl+C` | Quit. |

### Editor

The Editor supports inline body editing, Unicode-safe cursor movement, newline, backspace, delete, undo/redo, wrap mode, `Ctrl+F` find, `Ctrl+R` replace, and `Ctrl+S` save.

Autosave runs after 750 ms. Autosave and manual save use the same safe note-body write path. If a save fails, BlueNote keeps the buffer dirty and retries later.

BlueNote leaves normal visible-text selection to the terminal. Use your terminal's mouse selection and `Ctrl+Shift+C` to copy visible text, and `Ctrl+Shift+V` to paste. Whole-note clipboard operations are available through Search Everything commands: `/copy-all`, `/replace-all`, and `/paste`.

### Search Everything

`Ctrl+P` opens Search Everything from the Manager or Editor. Results include notes, body matches, folders, paths, and commands that work in the current context.

Editor commands include `/find`, `/replace`, `/save`, `/copy-all`, `/replace-all`, and `/paste`. Manager commands include `/new` and, when a note action is available, `/delete`.

## Development

Run the full local verification suite:

```bash
bun run check
```

Useful individual checks:

```bash
bun run typecheck
bun test
bun run smoke:opentui
bun run smoke:cli
```

The interactive smoke test launches `bn tui` inside a real TTY and requires `tmux`:

```bash
bun run smoke:opentui:interactive
```

## Contributing

Issues and pull requests are welcome. Please keep changes within BlueNote's current scope: local/offline CLI and TUI behavior, plain Markdown note bodies, and sidecar metadata under `.data/notes/`.

Before opening a pull request, run the checks listed in the pull request template. If a check is not available on your machine, note that in the PR.

## License

Apache License 2.0. See [LICENSE](LICENSE).
