# Development Workflow

## Preparation phase goals

This repo starts with scaffold-first work before feature delivery:

1. stabilize repository layout
2. document architecture and constraints
3. validate runtime/tooling
4. commit a clean baseline

## Day-to-day flow

1. read `AGENTS.md`
2. check the current phase document in `docs/phases/`
3. make the smallest change that advances the active phase
4. run validation commands
5. commit with a clear scoped message

## Validation commands

```bash
bun run typecheck
bun test
bun run smoke:opentui
bun run smoke:cli
```
