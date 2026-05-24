# BlueNote

BlueNote is a terminal-native, local-first note tool under active Phase 1 CLI development with Bun, TypeScript, and OpenTUI.

## Status

This repository now includes Phase 1 CLI implementation and verification work, building on the earlier **Phase 0: project preparation** pass.

Current goals:
- keep repository and Git hygiene aligned with active CLI work
- maintain runtime/tooling conventions
- keep Hermes and project docs aligned with the implemented workflow
- verify the command-first Phase 1 CLI workflow with tests and smoke checks

## Runtime

- Bun `1.3+` preferred for TUI/dev workflows and the current CLI scripts
- Node.js `20+` compatibility target for shared core pieces; repo-entry scripts are currently Bun-first

## Commands

```bash
bun install
bun run check:env
bun run typecheck
bun test
bun run smoke:opentui
bun run smoke:cli
```

## Current CLI workflow

- Notes are plain `.md` files under `notes/`; canonical BlueNote metadata lives in `.state/notes/<key>.json` sidecars.
- Derived artifacts such as `.state/metadata.sqlite` and `.state/search-index.json` are rebuildable.
- `bn new`, `bn edit`, `bn archive`, and `bn delete --force` rebuild derived indexes automatically after mutating note storage.
- Selectors are key-first for everyday use; `show`, `edit`, `archive`, and `delete --force` accept canonical `key|path` selectors.
- `bn search` prints grouped note blocks with the title first, then key, path, and the highest-value match label or excerpt.

## Completion and migration

- Install shell completion by printing a script, then sourcing or saving it for your shell:
  - `bun run ./bin/bn.ts completion bash`
  - `bun run ./bin/bn.ts completion zsh`
  - `bun run ./bin/bn.ts completion fish`
- The completion backend is selector-aware: `bn complete selectors <command> <prefix>` prints matching keys one per line and stays quiet when the root or indexes are unavailable.
- `bn migrate` converts legacy frontmatter notes into plain note files plus `.state/notes/` sidecars, rebuilds derived indexes, and fails hard on mixed or unsafe roots instead of guessing.

## Repository map

- `AGENTS.md` — project-local agent guidance
- `docs/product/overview.md` — product scope and goals
- `docs/architecture/` — runtime, storage, and indexing references
- `docs/phases/` — staged implementation roadmap
- `docs/workflow/` — developer + Hermes workflow conventions
- `docs/plans/` — saved planning artifacts and implementation/design plans

## Current implementation note

The repository now includes a working Phase 1 CLI flow plus automated verification. Some surrounding project history and planning artifacts still reference the earlier preparation pass, so docs are being normalized alongside the implementation work.
