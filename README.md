# @lordierclaw/bluenote-term

Terminal-native BlueNote client for local Markdown notes. It provides the `bluenote-term` executable, reusable TUI command API, terminal CLI presentation, and full-screen OpenTUI workspace.

## Role in BlueNote

This repo owns:

- terminal layout, keybindings, and OpenTUI behavior
- terminal editor and clipboard integration
- terminal-owned CLI/TUI command presentation
- reusable `runTuiCommand` public command API
- terminal release packaging and smoke checks

It does not own core storage/search/AI semantics, browser UI behavior, or top-level distribution routing.

## Install

For the full BlueNote app, install the distribution CLI first, then install this optional terminal client:

```sh
npm install -g @lordierclaw/bluenote
bluenote doctor
```

Start the local daemon through the distribution CLI, then launch the terminal workspace through the distribution command:

```sh
bluenote daemon start
bluenote tui
```

The distribution README is the canonical guide for full app install, uninstall, PATH setup, and optional client verification.

The published `@lordierclaw/bluenote-term` npm package exposes the public command API plus daemon/runtime probing helpers. For end-user full-screen TUI usage, prefer the built terminal artifact managed by the distribution installer. Bun is still required for source execution, local development, and direct repo scripts.

## Local development

Expected sibling checkout layout:

```text
../bluenote-core
../bluenote-term
../bluenote
```

For source-link app setup, link from the public package workspace so `bluenote doctor` can discover `bluenote-term` on `PATH`:

```sh
cd ../bluenote
npm ci --include=dev
npm run check
npm link

cd ../bluenote-term
bun install
bun run check
cd packages/term
bun link
cd ../..

bluenote doctor
```

For terminal-only development:

```sh
cd ../bluenote-core
npm ci --include=dev
npm run check

cd ../bluenote-term
bun install
bun run check
bun run ./bin/bn.ts --help
bun run ./bin/bn.ts tui
```

See [Development](DEVELOPMENT.md) for local `file:`, reproducible Git tag, and future npm dependency modes. Do not import from `@lordierclaw/bluenote-core/src/*` or relative paths into `../bluenote-core/src/*`.

## Scripts

```sh
bun install
bun run check:env
bun run lint
bun run typecheck
bun test
bun run smoke:opentui
bun run smoke:cli
bun run check
bun run build:release
```

Common local command examples:

```sh
bun run ./bin/bn.ts init

# Create a draft, or pass --path note/<folder> with --title to create a normal note
# in an existing folder under note/.
bun run ./bin/bn.ts new --title "Project notes" "Initial content"
mkdir -p note/work
bun run ./bin/bn.ts new --path note/work --title "Project notes" "Initial content"

bun run ./bin/bn.ts list
bun run ./bin/bn.ts search project
bun run ./bin/bn.ts show <key|path>
EDITOR="$EDITOR" bun run ./bin/bn.ts edit <key|path>
bun run ./bin/bn.ts tui
```

Command surface:

- `new [--title <title>] [--path note/<folder>] [--clipboard] <body>` creates a draft from positional body text or clipboard; `--path` creates a normal note under `note/`.
- `show [--drafts|--all] <key|path>` prints a matching note summary and body.
- `edit [--drafts|--all] <key|path>` opens a matching note in `$EDITOR`.
- `archive [--drafts|--all] <key|path>` archives a matching normal note.
- `delete [--drafts|--all] <key|path> --force` permanently removes a matching note and sidecar.
- `ai config set --base-url <url> --api-key <key> --model <model>` configures an OpenAI-compatible provider.
- `ai config set --provider codex --model <model>` selects the Codex provider.
- `ai codex auth login`, `ai codex auth status`, and `ai codex auth logout` manage root-local Codex auth.
- `ai describe <key|path>` refreshes one note description.
- `ai queue` shows pending AI work.
- `ai process-queue [--limit <n>]` processes queued AI description jobs.

Optional AI description commands are opt-in and require configured provider/auth state:

```sh
bun run ./bin/bn.ts ai config set --base-url https://api.openai.com/v1 --api-key "$OPENAI_API_KEY" --model gpt-4o-mini
bun run ./bin/bn.ts ai describe <key|path>
bun run ./bin/bn.ts ai process-queue
```

BlueNote's AI feature is opt-in. Core CLI, storage, search, and TUI workflows continue to work offline without a provider. OpenAI-compatible API-key providers remain supported. API key is stored in plaintext under `.data/ai/config.json`; do not commit or share a managed root containing secrets.

Codex provider now supports root-local `bn ai codex auth login`, `bn ai codex auth status`, and `bn ai codex auth logout`. Codex auth state is stored root-locally at `.data/ai/codex-auth.json` and is sensitive app state. The TUI never starts `bn ai codex auth login` automatically.

After note changes, BlueNote records cheap local queue updates under `.data/ai/queue.json`; normal create/edit/autosave paths do not perform network calls. Manual save and autosave never call the configured provider API. Pending AI work is durable in `.data/ai/queue.json` and is recovered on TUI startup. Freshness is tracked with `ai.description.lastProcessedAt` timestamp metadata in the note sidecar. Generated descriptions must be one short sentence under 10 words.

All TUI AI work runs in the background; provider calls and queue processing do not block startup, rendering, typing, editing, navigation, note switching, saves, autosave, or quit. CLI AI commands such as `bn ai describe` and `bn ai process-queue` remain foreground command executions. Editor saves use a 10-second editor idle timer for AI queueing; switching from Editor to Manager uses a 5-second manager idle timer.

`Ctrl+PageDown` and `Ctrl+PageUp` switch to the next or previous note in the same folder and shows a temporary blue index label such as `03/10` before the title.

## Packaging and versions

The public npm package is `@lordierclaw/bluenote-term`. The public executable discovered on `PATH` is `bluenote-term`.

Release automation for this repo runs when a maintainer publishes a GitHub Release for the matching `v*` tag. The workflow verifies `packages/term` first and only then publishes the npm package.

The package consumes the latest published `@lordierclaw/bluenote-core` through public exports by default. Distribution packages should call the public executable or public command API instead of importing terminal internals:

```ts
import { runTuiCommand } from "@lordierclaw/bluenote-term"
```

## Cross-platform notes

- Bun 1.3 or newer is required for terminal development and source execution.
- The published optional terminal client runs through Node.js; source execution and development still require Bun.
- Terminal UI behavior depends on a terminal with standard keyboard input.
- If your shell cannot find `bluenote-term` after `bun link`, ensure Bun's link directory is on `PATH` (`~/.bun/bin` on Linux/macOS).
- Core note workflows stay local-first. Optional AI provider calls require explicit configuration and network access.

## Related packages

- `@lordierclaw/bluenote`: official distribution CLI and top-level app command.
- `@lordierclaw/bluenote-core`: shared headless note/search/storage/AI behavior.
- `@lordierclaw/bluenote-webui`: local browser UI client.
