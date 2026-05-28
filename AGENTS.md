# BlueNote Agent Guide

## Project intent

BlueNote is a terminal-native, local-first note tool. This repository is currently in **preparation / scaffold mode**.

- Phase 1 scope is local/offline only.
- Notes remain plain Markdown files without frontmatter; BlueNote-managed metadata lives in sidecars under `.data/notes/`.
- Do not introduce AI features, network sync, hosted backends, or cloud-only assumptions during initial implementation.

## Runtime and architecture rules

- Prefer **Bun** for TUI development, smoke checks, and the current scaffold CLI entrypoint.
- Preserve **Node.js 20+ compatibility** for shared core code where practical, but treat the repo-entry scripts/bin as Bun-first until a dedicated Node-compatible build path exists.
- Avoid native SQLite bindings; planned metadata cache uses `sql.js`.
- Treat the TUI as a presentation/input layer only; storage, indexing, config, and note rules belong in core services.
- TUI/UI work must follow `docs/product/design-language.md` (Quiet Blue Dashboard) unless the user approves a later design-language change.

## Workflow rules

- Follow a **plan-first** workflow for anything beyond trivial edits.
- Use the docs in `docs/phases/` as the delivery roadmap.
- Update docs when architecture or repo conventions change.
- Keep commits small and intention-revealing.

## Hermes-specific repo conventions

- Keep project plans in `docs/plans/`.
- Treat `.hermes/plans/` as a legacy location; migrate older plan files into `docs/plans/` instead of writing new plans there.
- Keep the current `.hermes/skills/opentui/` skill assets in-repo for this project unless the user says otherwise.
- `.agents/` is not part of the desired clean scaffold and should be removed unless the user explicitly reintroduces it.
- Do not remove `.hermes/skills/` without explicit user approval.
- Prefer `AGENTS.md` as the project-local source of truth for agent behavior.

## Verification expectations

Before committing code or scaffolding changes:

1. Run `bun run typecheck`
2. Run `bun test`
3. Run `bun run smoke:opentui`
4. Run `bun run smoke:opentui:interactive`
5. Run `bun run smoke:cli`
6. Review `git status`

## Primary docs

- `README.md`
- `docs/product/overview.md`
- `docs/architecture/*.md`
- `docs/phases/*.md`
- `docs/workflow/*.md`
