# Phase 6 — AI Descriptions, Queue Processing, Provider Abstraction, and Codex Auth

## Status

Approved Phase 6 plan. This is now the single canonical Phase 6 plan for the current branch.

It consolidates and supersedes these earlier branch-local planning artifacts:

- `2026-06-01-phase-6-ai-suggestion-design.md`
- `2026-06-01-phase-6-ai-suggestion-implementation.md`
- `2026-06-02-phase-6-ai-idle-queue-processing-design.md`
- `2026-06-02-phase-6-ai-idle-queue-processing-implementation.md`
- `2026-06-02-phase-6-ai-manual-qa-and-tuning-plan.md`
- `2026-06-02-phase-6-ai-manual-qa-results.md`
- `2026-06-03-phase-6-ai-queue-provider-abstraction-plan.md`
- `2026-06-04-bluenote-codex-auth-design.md`
- `2026-06-04-bluenote-codex-auth-implementation-plan.md`

Phase 6.1 Codex auth is part of this Phase 6 scope. The branch should keep a small, reviewable commit history and avoid retaining scattered approval/update docs as separate active plan files.

## Non-goals

- Do not add hosted BlueNote services, network sync, daemon/autostart background services, or cloud-only assumptions.
- Do not modify Markdown note bodies, add AI frontmatter, or require notes to embed metadata.
- Do not make normal create/edit/save/autosave/search/TUI workflows require AI, provider credentials, network access, Codex CLI auth, or Hermes auth.
- Do not start Codex login from the TUI.
- Do not make provider calls on save/autosave/input/navigation/quit critical paths.
- Do not commit secrets, auth caches, device codes, API keys, bearer tokens, JWT-like strings, or manual QA roots containing them.

## Consolidated requirements

### 1. Storage and configuration

- Note bodies remain plain Markdown under `notes/`.
- BlueNote-managed metadata remains sidecar state under `.data/notes/` and `.data/ai/`.
- AI state lives under the managed root:

  ```text
  .data/ai/
    config.json              # plaintext provider settings when configured
    codex-auth.json          # sensitive root-local Codex auth state when authenticated
    prompts/
      describe-note.md       # editable description prompt template
    queue.json               # durable pending/failed description jobs
    logs/                    # usage/result logs; full conversations disabled by default
  ```

- Existing sidecars without AI metadata remain valid.
- Successful AI description processing records timestamp-only freshness metadata at `ai.description.lastProcessedAt` in the note sidecar.
- `lastProcessedAt` updates only after a valid provider result is applied.
- If a note `updatedAt` is newer than `ai.description.lastProcessedAt`, or freshness metadata is absent, the note is AI-stale.
- Existing OpenAI-compatible config remains usable with `baseUrl`, `apiKey`, and `model`.
- Codex config is an alternative provider selection with `provider: "codex"` and `model`.
- Config schema remains backward-compatible and defaults missing new fields:
  - `maxAttempts: 3`
  - `outputLanguage: "English"`
- `maxAttempts` is validated and configurable.
- `outputLanguage` is configurable as a non-secret raw string.
- `bn ai config show` masks API keys and does not expose Codex token state.
- `.data/ai/codex-auth.json` is written atomically where practical, uses restrictive POSIX mode `0600` where supported, and never stores transient device/user codes after login completion/expiry.

### 2. Provider abstraction and auth

- AI generation is behind a provider-neutral text generation abstraction.
- Description services, queue services, CLI, and TUI code depend on the abstraction, not direct provider implementation details.
- The existing OpenAI-compatible API-key provider remains supported and unchanged behind the abstraction.
- OpenAI-compatible provider calls use the configured `baseUrl`, `apiKey`, and `model`, with injected `fetch` support for tests.
- Provider results normalize text, usage when available, provider request IDs when available, and sanitized errors.
- Codex is an alternative provider, not a replacement.
- Codex auth is implemented in BlueNote itself; it must not rely on Codex CLI auth, Hermes auth, or `~/.codex/auth.json`.
- Codex auth follows stable official/OpenAI/Codex contracts where practical. The implementation baseline discovered from official Codex source is:
  - issuer: `https://auth.openai.com`
  - client id: `app_EMoamEEZ73f0CkXaXp7hrann`
  - user-code endpoint: `POST {issuer}/api/accounts/deviceauth/usercode`
  - poll endpoint: `POST {issuer}/api/accounts/deviceauth/token`
  - token exchange endpoint: `POST {issuer}/oauth/token`
  - refresh endpoint: `POST {issuer}/oauth/token`
- If a required real Codex generation/auth contract cannot be verified from official/stable sources, stop and document the blocker rather than fabricating behavior.
- Codex auth statuses include `not-configured`, `setup-required`, `authenticated`, `expired`, and `invalid`.
- Token refresh happens before provider use when practical.
- Provider/auth errors are sanitized and must not leak API keys, access tokens, refresh tokens, bearer tokens, JWT-like strings, device codes after immediate display use, or sensitive account/workspace values.

### 3. CLI behavior

- AI CLI surface:

  ```bash
  bn ai config set --base-url <url> --api-key <key> --model <model> [--max-attempts <n>] [--output-language <text>]
  bn ai config set --provider codex --model <model> [--max-attempts <n>] [--output-language <text>]
  bn ai config show
  bn ai describe <key|path>
  bn ai queue
  bn ai process-queue [--limit <n>]
  bn ai codex auth login
  bn ai codex auth status
  bn ai codex auth logout
  ```

- OpenAI-compatible config writes warn that API keys are stored plaintext under `.data/ai/config.json`.
- Codex login starts the device-code flow, prints the verification URL and one-time user code, polls to success/expiry/cancel/error, stores auth root-locally, and prints no token material.
- Codex status reports sanitized auth state.
- Codex logout removes auth while preserving provider/model config.
- `bn ai describe <key|path>` resolves the note, calls the provider via the abstraction, validates output, auto-applies valid descriptions to the sidecar, updates freshness metadata, refreshes indexes, logs usage/results when enabled, and leaves the prior description unchanged on invalid/provider failure.
- `bn ai process-queue [--limit <n>]` processes jobs sequentially, respects `--limit`, retries failed/retryable jobs up to `maxAttempts`, skips exhausted jobs without infinite loops, removes deleted-note jobs without provider calls, sanitizes errors, and prints a clear summary.
- Foreground CLI AI commands may await provider work because they are explicit non-interactive command invocations.

### 4. TUI and background processing

- TUI startup, rendering, input, typing, navigation, note switching, Manager opening, save, autosave, quit, and dispose do not await provider calls, queue processing, auth login, auth refresh, or startup scans.
- Save/autosave/manual save never call the configured provider API.
- Save/autosave only persist local note state and schedule/refresh background AI work.
- Queue write/scheduling failures do not roll back note saves.
- Startup schedules stale-note scanning in the background after initial UI interactivity.
- Startup stale scan enqueues stale active notes and starts queue processing as soon as practical without blocking rendering/input.
- Editor idle policy:
  - while staying in Editor, saved changes queue after 10 seconds of editor idle;
  - switching Editor to Manager starts a 5-second manager-idle timer for the note being left;
  - opening another note from Manager immediately queues the previous note.
- Continued typing resets idle timers and only the latest saved note state is queued.
- Background provider processing starts after queueing without being awaited by editor/manager actions.
- Explicit TUI AI commands return control immediately and update status asynchronously.
- Lifecycle-owned timers/promises are cancelled or ignored on dispose.
- Late provider results cannot overwrite newer note state or mark refreshed content fresh.
- TUI AI status is Manager-only chrome; Editor hides AI status and preserves editor shortcuts.
- Manager places `Current open: <label>` on the left and `AI: <status>` on the right on the same row, with predictable truncation.
- Normal Manager AI status avoids `x queued` and `empty` wording. It may show connected/updated/running/failed/error/auth-required/not-configured and `processing x/y` during active runs.
- Status wording is provider-neutral during normal operation and only mentions Codex in setup guidance such as `run bn ai codex auth login`.
- Status color/style intents:
  - processing/running: warning/orange
  - connected/updated: success/green
  - failed/error: danger/red
  - auth-required/not-configured: muted or warning as appropriate
- Manager shortcut hints advertise only actually-routed shortcuts.

### 5. Description policy, queue policy, and logging

- Phase 6 auto-applies valid descriptions; there is no approval/reject flow.
- Generated descriptions must be exactly one short sentence under 10 words.
- 9-word descriptions pass; 10-word descriptions fail.
- Output must not contain Markdown, lists, code fences, wrapping quotes after sanitization, multiline text, provider refusal/error-looking text, prompt leakage, or instruction-like starts such as “Summarize” / “Describe”.
- Prompt templates include configured `outputLanguage`, defaulting to English, and treat note content as untrusted data.
- Invalid provider output leaves the existing description unchanged and records sanitized failure details where appropriate.
- Queue jobs dedupe by kind/key and processing is sequential.
- Retry policy: jobs retry while `attempts < maxAttempts`; exhausted jobs are skipped/reported without infinite loops.
- Deleted-note queue jobs are removed/forgotten without provider calls, including pending and failed/retryable jobs.
- Stale-result safety prevents older provider results from mutating newer note/sidecar state.
- Usage/result logs contain no secrets. Full conversation logging remains disabled by default.

### 6. Documentation and help

Current-facing docs/help must agree on:

- AI is opt-in.
- Core note workflows remain local-first/offline.
- OpenAI-compatible API-key provider remains supported.
- Codex is an alternative provider behind the same abstract AI layer.
- BlueNote implements root-local Codex auth itself.
- Codex CLI/Hermes auth are not product auth behavior.
- TUI never starts login automatically.
- TUI AI work is background/non-blocking.
- Save/autosave do not call provider APIs.
- Durable queue recovers pending work.
- Startup stale scan is background/non-blocking.
- Valid generated descriptions auto-apply after validation.
- Description contract is under 10 words.
- Retry/default/config and output-language/default/config behavior.
- Manager-only AI status and provider-neutral wording.
- `.data/ai/config.json` may contain plaintext API keys.
- `.data/ai/codex-auth.json` is sensitive root-local state.
- Manual QA artifacts belong in ignored `.tmp/` locations and must not commit secrets.

## Implementation task sequence

All tasks use TDD: write a failing test, confirm it fails, implement the smallest fix, run targeted tests, then commit green work.

1. Add AI root layout, config schema/repository, defaults, secret masking, and sidecar AI freshness metadata.
2. Add prompt repository, under-10-word description policy, sanitized validation, and output-language-aware default prompt.
3. Add queue repository/service with dedupe, sequential processing, retry attempts, stale-result safety, deleted-note cleanup, and sanitized errors.
4. Add provider abstraction and preserve OpenAI-compatible provider behavior behind it.
5. Add description generation service that auto-applies valid output to sidecars, updates freshness metadata, refreshes indexes, and logs safely.
6. Add CLI AI config/describe/queue/process-queue commands and help/docs tests.
7. Add Codex auth repository and status model.
8. Add Codex auth client using official-source device-code/token/refresh flow with injected fetch/sleep/clock/abort support.
9. Add Codex auth CLI login/status/logout commands.
10. Add auth-backed Codex provider client behind the provider abstraction, preserving OpenAI-compatible behavior.
11. Wire note mutation enqueue behavior for create/edit/save flows with local-only queue updates.
12. Wire TUI Manager-only AI status, provider-neutral status/color intents, explicit AI commands, non-blocking background queue processing, idle timers, startup stale scan, and lifecycle cleanup.
13. Add E2E/mock-provider workflow proving note Markdown stays plain, sidecars update, list/search surface descriptions, and logs are secret-safe.
14. Align README, product docs, architecture docs, phase docs, CLI help, smoke scripts, and tests.
15. Run final automated verification, PTY/manual TUI lifecycle verification, Codex provider manual validation where credentials are available, final spec/code-quality/security review, and clean branch history before push.

## Verification matrix

Targeted coverage must include:

- `tests/unit/ai/*`
- `tests/unit/storage/ai-root-layout.test.ts`
- `tests/unit/storage/sidecar-schema.test.ts`
- `tests/integration/cli-ai-config.test.ts`
- `tests/integration/cli-ai-describe.test.ts`
- `tests/integration/cli-ai-queue.test.ts`
- `tests/integration/cli-ai-queue-mutations.test.ts`
- `tests/integration/cli-help.test.ts`
- `tests/integration/tui-workflow.test.ts`
- `tests/unit/tui/ai-status.test.ts`
- `tests/unit/tui/render-routing.test.ts`
- `tests/unit/tui/render-view-models.test.ts`
- `tests/unit/tui/workspace-controller.test.ts`
- `tests/e2e/ai-description-workflow.test.ts`

Final automated gate:

```bash
bun run lint
bun run typecheck
bun test
bun run smoke:opentui
bun run smoke:cli
bun run check
```

Manual/PTTY verification:

1. Start `bun run ./bin/bn.ts tui` in a PTY, confirm initial render and Manager status are responsive.
2. Quit with `q` and verify process exits.
3. Start again, send Ctrl+C, and verify process exits.
4. Start again, terminate with SIGTERM, and verify process exits.
5. Confirm no matching `bun run ./bin/bn.ts tui` / `bin/bn.ts tui` processes remain.
6. With a configured provider or fake/manual QA root, verify editor typing/save/navigation remains responsive while queue work is pending or processing.
7. When real Codex credentials are available, run one CLI Codex auth status/login/describe/process flow against a temporary ignored root without printing or committing secrets.

Final review focus:

- Requirements in this document match implementation and docs/help.
- Existing OpenAI-compatible provider still works.
- Codex auth/generation path follows verified official/OpenAI/Codex contracts where practical.
- TUI AI processing is non-blocking.
- Save/autosave do not call providers.
- Secret redaction covers configured keys, bearer tokens, JWT-like tokens, Codex tokens, and persisted/displayed errors.
- Queue retry/deleted-note cleanup/stale-result safety are covered.
- Branch history is reduced to a few focused commits and force-pushed with lease only after final verification.
