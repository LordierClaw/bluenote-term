# BlueNote

BlueNote is a terminal-native, local-first note tool being prepared for implementation with Bun, TypeScript, and OpenTUI.

## Status

This repository is currently in **Phase 0: project preparation**.

Current goals:
- normalize repository and Git hygiene
- establish runtime/tooling conventions
- prepare Hermes project guidance
- split product/architecture docs into maintainable files
- scaffold the directory layout for future implementation

## Runtime

- Bun `1.3+` preferred for TUI/dev workflows and the current scaffold CLI entrypoint
- Node.js `20+` compatibility target for shared core pieces; repo-entry scripts remain Bun-first in Phase 0

## Commands

```bash
bun install
bun run check:env
bun run typecheck
bun test
bun run smoke:opentui
bun run smoke:cli
```

## Repository map

- `AGENTS.md` — project-local agent guidance
- `docs/product/overview.md` — product scope and goals
- `docs/architecture/` — runtime, storage, and indexing references
- `docs/phases/` — staged implementation roadmap
- `docs/workflow/` — developer + Hermes workflow conventions
- `.hermes/plans/` — saved planning artifacts

## Current implementation note

Feature work has not started yet. The CLI and TUI files currently provide a scaffold/placeholder baseline only.
