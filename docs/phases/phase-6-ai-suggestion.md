# Phase 6 — AI Suggestion

Phase 6 adds opt-in AI description generation while preserving BlueNote's local-first note format and offline core workflows.

## User-facing workflow

AI is disabled until configured:

```bash
bn ai config set --base-url <url> --api-key <key> --model <model> [--max-attempts <n>] [--output-language <text>]
bn ai config set --provider codex --model <model> [--max-attempts <n>] [--output-language <text>]
bn ai config show
bn ai codex auth login
bn ai codex auth status
bn ai codex auth logout
```

`bn ai config show` masks OpenAI-compatible API keys. The config command does not make provider calls; it only writes or reads local configuration. OpenAI-compatible API-key providers remain supported. `--provider codex` records a Codex provider selection without OpenAI-compatible `baseUrl` or `apiKey`; Codex auth is managed root-locally with `bn ai codex auth login`, `bn ai codex auth status`, and `bn ai codex auth logout`. Failed queue-job retries default to `maxAttempts: 3`, and generated output language defaults to `English`; both are configurable with `--max-attempts <n>` and `--output-language <text>`.

> Warning: API key is stored in plaintext under `.data/ai/config.json`.
> Codex auth state is stored in `.data/ai/codex-auth.json` and is sensitive app state.
> Do not commit or share your BlueNote managed root if it contains secrets.

After configuration, users can manually generate descriptions:

```bash
bn ai describe <key|path>
bn ai queue
bn ai process-queue [--limit <n>]
```

`bn ai describe <key|path>` generates one description and automatically applies valid output to the note sidecar. Valid generated descriptions are one short sentence under 10 words. `bn ai process-queue [--limit <n>]` processes pending stale-description jobs. There is no approval/reject flow in Phase 6.

## Storage

AI state lives under `.data/ai/`:

```text
.data/ai/
  config.json              # plaintext provider settings when configured
  codex-auth.json          # sensitive root-local Codex auth state when authenticated
  prompts/
    describe-note.md       # editable description prompt template
  queue.json               # pending description refresh jobs
  logs/                    # AI support logs
```

Note bodies remain plain Markdown under `notes/`. Generated descriptions are written to `.data/notes/<key>.json`; they are not inserted into frontmatter or the note body.

## Offline and network boundaries

Core CLI, storage, search, and TUI workflows continue to work offline. Normal note creation, editing, save, autosave, title changes, and index rebuilds must not wait on AI network calls. Manual save and autosave never call the configured provider API. Those paths only perform cheap local queue updates.

AI provider calls happen during explicit CLI AI commands or TUI background AI work, and require configured provider settings plus network access. TUI editor changes schedule queue processing after a 10-second editor idle timer following a successful save. Switching from Editor to Manager re-arms pending work on a 5-second manager idle timer, and opening another note from Manager queues the previous note immediately. All TUI AI work runs in the background: startup scans, idle queue processing, explicit TUI AI commands, provider calls, retries, status refreshes, and auth/setup checks must not block startup, rendering, editor input, opening Manager, opening another note, saving, autosave, or quitting. The TUI never starts Codex login automatically. CLI AI commands such as `bn ai describe` and `bn ai process-queue` remain foreground command executions because they are outside the interactive UI path.

## Queue and automatic description updates

When note content or metadata changes, BlueNote can mark the description stale by updating `.data/ai/queue.json`. Pending AI work is durable in `.data/ai/queue.json`, and jobs are deduplicated per note. Failed jobs are retried by later processing runs until their configured maximum attempts, then left failed/retryable only after config changes with sanitized error details. TUI startup recovery scans sidecar `updatedAt` against `ai.description.lastProcessedAt` and refreshes queue jobs for stale active notes. Users can also process the queue manually with `bn ai process-queue [--limit <n>]`.

Valid provider output is sanitized, validated, and automatically written to the note's sidecar description. It must be one short sentence under 10 words, as a direct description or summary description in the configured output language. Successful processing records timestamp-only freshness metadata at `ai.description.lastProcessedAt` in `.data/notes/<key>.json` for this phase; prompt and content hashes are not sidecar freshness fields. Invalid output leaves the existing description unchanged and records failure status/log details where enabled. Manager shows AI status on the right side of the current-open row without normal queued-count wording; Editor hides AI status and keeps shortcut hints visible.
