## Summary

<!-- What changed, and why? -->

## Type of change

- [ ] Bug fix
- [ ] Feature
- [ ] Documentation
- [ ] Refactor or maintenance
- [ ] Test-only change

## Scope

- [ ] Preserves local/offline BlueNote behavior.
- [ ] Preserves plain Markdown note bodies under `notes/`.
- [ ] Preserves sidecar metadata under `.data/notes/`.
- [ ] Does not add required cloud services, sync providers, hosted backends, accounts, or telemetry.

## User-facing changes

<!-- Describe CLI commands, TUI screens, storage behavior, or docs that changed. Write "None" if not applicable. -->

## Screenshots or terminal output

<!-- Required for TUI changes when practical. Otherwise write "Not applicable." -->

## Testing

<!-- Check every command you ran. If a check was skipped, explain why. -->

- [ ] `bun run typecheck`
- [ ] `bun test`
- [ ] `bun run smoke:opentui`
- [ ] `bun run smoke:cli`
- [ ] `bun run smoke:opentui:interactive` (for TUI behavior changes, when `tmux` is available)

## Checklist

- [ ] README or other docs were updated if behavior changed.
- [ ] Tests were added or updated for behavior changes.
- [ ] Error messages and help text are user-facing and actionable.
- [ ] No private notes, local paths, secrets, or machine-specific artifacts are included.
