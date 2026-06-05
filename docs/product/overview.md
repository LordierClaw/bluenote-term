# BlueNote Product Overview

BlueNote is a terminal-native note tool optimized for fast local capture, browsing, search, editing, and navigation over ordinary Markdown files.

## Product principles

- **File-first:** notes are ordinary Markdown files without required frontmatter; BlueNote-managed metadata lives in sidecar JSON under `.data/notes/`.
- **Local-first:** user files remain the source of truth inside a managed notes root.
- **Offline-first:** the CLI, storage, search, and TUI workflows must work fully offline.
- **No AI by default:** Phase 6 adds opt-in AI description generation, but core CLI, storage, search, and TUI workflows remain local/offline by default.
- **Quiet Blue Dashboard UI:** TUI/UI work follows `docs/product/design-language.md` unless a later approved design changes it.

## Current delivered scope

Current public behavior includes:

- managed root initialization
- plain Markdown note files under `notes/`
- canonical BlueNote metadata sidecars under `.data/notes/`
- rebuildable metadata/search artifacts at `.data/metadata.sqlite` and `.data/search-index.json`
- safe migration input handling for legacy frontmatter notes and legacy `.state/` metadata
- CLI flows for `init`, `new`, `list`, `show`, `search`, `edit`, `archive`, `delete`, `rebuild`, `migrate`, and `tui`
- `key|path` selector UX for everyday note targeting
- contains-style search output over keys, paths, titles, descriptions, and note bodies
- automatic index rebuilds after CLI mutations so list/search output reflects changes immediately
- an OpenTUI workspace launched with `bn tui`
- opt-in AI description commands through `bn ai ...` for configured providers; OpenAI-compatible API-key providers remain supported, and Codex has root-local `bn ai codex auth login`, `bn ai codex auth status`, and `bn ai codex auth logout`
- console verification through lint, typecheck, tests, import-only OpenTUI smoke, and CLI smoke checks

## Phase 6 opt-in AI model

Phase 6 adds opt-in AI description generation without changing BlueNote's file-first storage boundary. AI is disabled until the user runs `bn ai config set --base-url <url> --api-key <key> --model <model>` for an OpenAI-compatible provider, or `bn ai config set --provider codex --model <model>` plus explicit Codex auth. OpenAI-compatible API-key providers remain supported, and their API keys are stored in plaintext under `.data/ai/config.json` for this phase. Codex provider now has root-local `bn ai codex auth login`, `bn ai codex auth status`, and `bn ai codex auth logout`; `.data/ai/codex-auth.json` is sensitive root-local app state. Config defaults failed-job retries to `maxAttempts: 3` and generated output language to `English`; `bn ai config set` can override them with `--max-attempts <n>` and `--output-language <text>`. Users must not commit or share managed roots containing secrets.

Normal note creation, editing, save, autosave, and indexing do not wait on AI network calls; save and autosave paths never call the provider API. Those paths only update durable local stale-description work under `.data/ai/queue.json`. TUI editor changes schedule idle/background processing after the note is safely saved; the TUI uses a 10-second editor idle timer, a 5-second manager idle timer after switching from Editor to Manager, and immediate queueing when Manager opens another note; all TUI AI work is non-blocking for startup, rendering, editor input, navigation, opening another note, saves, autosave, status refreshes, and quit. The TUI never starts Codex login automatically; `bn ai codex auth login` remains an explicit CLI step.

On TUI startup, BlueNote scans sidecar `updatedAt` against `ai.description.lastProcessedAt` and refreshes queue jobs for stale active notes. Successful description generation records timestamp-only sidecar freshness metadata at `ai.description.lastProcessedAt` for this phase; prompt/content hashes are not sidecar freshness fields.

Users can still manually run `bn ai describe <key|path>` for one note or `bn ai process-queue [--limit <n>]` for queued jobs. Failed queue jobs retry until the configured attempt limit and keep sanitized error details when exhausted. Generated descriptions are one short sentence under 10 words, using a direct description or summary description in the configured output language. Valid generated descriptions are applied automatically to `.data/notes/<key>.json` and indexes are refreshed. Manager shows AI status on the right side of the current-open row without normal queued-count wording; Editor hides AI status and keeps editor shortcuts visible.

Core BlueNote behavior works offline. AI requires a configured provider and network access when a CLI AI command or TUI background AI action runs.

## TUI model

The TUI workspace launches with `bn tui` and is split into three screens over the same storage and service contract as the CLI:

- **Manager:** a file-browser-like note/folder manager with a responsive browser/preview layout, current-folder context, filtering, create/delete prompts, and Search Everything access.
- **Editor:** focused inline editing of the selected plain Markdown body with Unicode-safe cursor movement, newline/backspace/delete, undo/redo, find/replace modes, wrap mode, manual save, and 750 ms autosave through the same safe note-body write path.
- **Search Everything:** global note/content/folder search plus slash-prefixed command discovery for actions available in the current context.

Across screens, `Escape` and `Ctrl+[` close the active mode or overlay first, then navigate back toward the root manager. Quitting remains explicit through `q` or `Ctrl+C`.

Terminal text selection/copy is owned by the terminal. BlueNote does not enable app mouse capture for normal editor use; users can select visible rendered text in the terminal and use terminal copy/paste shortcuts. Whole-note clipboard actions are explicit Search Everything commands where available, such as `/copy-all`, `/replace-all`, and `/paste`.

The current TUI bootstrap smoke status is `tui-workspace-ready` with follow-up metadata `hardening-follow-up`.

## Storage and search contract

Notes remain plain Markdown under `notes/`. BlueNote metadata sidecars are stored under `.data/notes/`. Derived metadata/search artifacts are rebuildable under `.data/` as `.data/metadata.sqlite` and `.data/search-index.json`. Legacy `.state/` directories are migration input only and are not the active canonical storage layout.

`bn search`, Manager filtering, Search Everything, and slash-command discovery use contains-style matching rather than fuzzy subsequence matching. For example, `123` matches `Receipt 123`, `meeting-123.md`, or body text containing `123`, but it does not match notes without an actual `123` substring in a searchable field or content.

## Still out of scope

- sync backends and hosted services
- cloud login/subscriptions
- mobile clients
- embedding BlueNote metadata into note frontmatter as the canonical format
- standalone AI daemon/autostart provider processing outside the running app, approval/reject UI, encrypted secret storage, title generation, note rewriting, automatic TUI-started Codex login, and hosted BlueNote AI services

## Delivery stance

Implementation should proceed in small approved phases. Architecture constraints should remain strict until local file, index, and TUI behavior are stable across the public verification gate.
