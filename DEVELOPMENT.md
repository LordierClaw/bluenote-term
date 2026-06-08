# BlueNote Terminal Development

## Cross-repo layout

Phase 8.2 splits the headless core into a sibling repository. For local development, keep the repositories next to each other:

```text
../bluenote-core
../bluenote-term
```

`bluenote-term` is the terminal client. It owns the `bn`/`bluenote` entrypoints, CLI presentation, OpenTUI workspace, terminal editor launch, clipboard helpers, and release packaging.

`bluenote-core` is the headless package. It owns note/domain logic, managed-root storage layout, sidecar metadata, search/indexing, and reusable AI config/queue/provider services. It must not depend on OpenTUI or terminal client code.

## Local dependency mode

During local development, `bluenote-term` consumes the sibling package with a reproducible local file dependency:

```json
"@lordierclaw/bluenote-core": "file:../bluenote-core"
```

The nested `packages/term` package uses the equivalent relative path from its own package directory:

```json
"@lordierclaw/bluenote-core": "file:../../../bluenote-core"
```

After changing core source, rebuild and verify core before reinstalling or checking the terminal client:

```bash
cd ../bluenote-core
bun install
bun run typecheck
bun run build
bun test

cd ../bluenote-term
bun install
bun run check
```

The terminal repo should import only public package exports:

```ts
import { createBlueNoteCore } from "@lordierclaw/bluenote-core"
```

Never import core internals:

```ts
// Forbidden
import "@lordierclaw/bluenote-core/src/..."
import "../bluenote-core/src/..."
```

## Shared testing before npm publishing

For shared pre-release testing, prefer a Git tag dependency rather than a branch dependency:

```json
"@lordierclaw/bluenote-core": "github:LordierClaw/bluenote-core#v0.4.0"
```

Do not use `github:LordierClaw/bluenote-core#main` as the default release dependency. Branch dependencies are not reproducible because the branch target can move.

## Future npm dependency mode

Once `@lordierclaw/bluenote-core` is published to npm, switch the terminal dependency to a semver range appropriate for the release:

```json
"@lordierclaw/bluenote-core": "^0.4.0"
```

Use semver discipline even while the package is pre-1.0:

- patch: compatible bugfix
- minor: new backward-compatible API, or breaking API while still in `0.x` if explicitly documented
- major: stable post-1.0 breaking API

## Updating the terminal client after core changes

1. Make and verify the change in `../bluenote-core`.
2. Update `bluenote-core/CHANGELOG.md` and tag the core release when sharing outside local file development.
3. In `../bluenote-term`, update the dependency to either `file:../bluenote-core`, a Git tag such as `github:LordierClaw/bluenote-core#v0.4.0`, or a future npm range such as `^0.4.0`.
4. Run `bun install` in `bluenote-term` to update `bun.lock`.
5. Run `bun run typecheck`, `bun run lint`, `bun test`, `bun run smoke:opentui`, `bun run smoke:cli`, and `bun run check` when practical.
6. Keep imports stable through `@lordierclaw/bluenote-core`; do not copy core logic back into this repository.
