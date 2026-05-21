# Hermes Workflow for BlueNote

## Project-local expectations

- `AGENTS.md` is the primary project-local instruction file.
- `.hermes/plans/` stores planning artifacts generated during repo work.
- `.hermes/skills/opentui/` is intentionally kept in this repo as current Hermes/OpenTUI skill context.
- `.agents/` is not part of the clean scaffold baseline and should stay removed unless intentionally reintroduced.

## Recommended agent behavior

- use plan-first execution for multi-step work
- keep edits aligned with the active phase document
- avoid speculative feature implementation outside the documented phase scope
- validate changes before committing

## Cleanup policy

- generated files such as `node_modules/` should not be committed
- duplicated vendored skill copies may be removed only when clearly redundant and only if project-local setup remains intact
