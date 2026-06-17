# BlueNote Terminal Development

## Cross-repo layout

Phase 8.2 splits the headless core into a sibling repository. For local development, keep the repositories next to each other:

```text
../bluenote-core
../bluenote-term
```

`bluenote-term` is the terminal client. It owns the public `bluenote-term` executable, reusable TUI command API, OpenTUI workspace, CLI presentation for terminal-owned commands, terminal editor launch, clipboard helpers, and terminal release packaging.

The sibling `bluenote` distribution repo owns the official `bluenote`/`bn` multi-command binary and top-level command routing. When that repo needs terminal behavior, expose or preserve a reusable public TUI command API here rather than moving OpenTUI implementation into `bluenote`.

The nested `bluenote-term` package exports that command API from both `@lordierclaw/bluenote-term` and `@lordierclaw/bluenote-term/command`:

```ts
import { runTuiCommand } from "@lordierclaw/bluenote-term"

const exitCode = await runTuiCommand(process.argv.slice(2))
```

`runTuiCommand(args)` preserves the existing terminal command behavior and runtime expectations. It requires the same Bun/OpenTUI-capable environment as the TUI bin and returns the command exit code after writing command output to the provided streams or the current process streams.

`bluenote-core` is the headless package. It owns note/domain logic, managed-root storage layout, sidecar metadata, search/indexing, and reusable AI config/queue/provider services. It must not depend on OpenTUI or terminal client code.

## Local dependency mode

Current shared-testing builds consume core through a pinned Git commit dependency so source checkouts are reproducible without a moving branch dependency:

```json
"@lordierclaw/bluenote-core": "git+https://github.com/LordierClaw/bluenote-core.git#<pinned-commit-sha>"
```

For active local core development, you may temporarily switch the root package to a local file dependency:

```json
"@lordierclaw/bluenote-core": "file:../bluenote-core"
```

The nested `packages/term` package uses the equivalent relative path from its own package directory when using local file mode:

```json
"@lordierclaw/bluenote-core": "file:../../../bluenote-core"
```

After changing core source, rebuild and verify core before reinstalling or checking the terminal client:

```bash
cd ../bluenote-core
npm ci --include=dev
npm run check

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

For shared pre-release testing before the next core tag is cut, prefer a pinned Git commit dependency rather than a branch dependency:

```json
"@lordierclaw/bluenote-core": "github:LordierClaw/bluenote-core#26586e011e04"
```

Do not use `github:LordierClaw/bluenote-core#main` as the default release dependency. Branch dependencies are not reproducible because the branch target can move.

## Future npm dependency mode

Once `@lordierclaw/bluenote-core` is published to npm, switch the terminal dependency to a semver range appropriate for the release:

```json
"@lordierclaw/bluenote-core": "^0.1.0"
```

Use semver discipline even while the package is pre-1.0:

- patch: compatible bugfix
- minor: new backward-compatible API, or breaking API while still in `0.x` if explicitly documented
- major: stable post-1.0 breaking API

## Updating the terminal client after core changes

1. Make and verify the change in `../bluenote-core`.
2. Update `bluenote-core/CHANGELOG.md` and tag the core release when sharing outside local file development.
3. In `../bluenote-term`, update the dependency to either temporary local file mode (`file:../bluenote-core` / `file:../../../bluenote-core`), a pinned Git commit such as `git+https://github.com/LordierClaw/bluenote-core.git#<pinned-commit-sha>`, or a future npm range such as `^0.1.0`.
4. Run `bun install` in `bluenote-term` to update `bun.lock`.
5. Run `bun run typecheck`, `bun run lint`, `bun test`, `bun run smoke:opentui`, `bun run smoke:cli`, and `bun run check` when practical.
6. Keep imports stable through `@lordierclaw/bluenote-core`; do not copy core logic back into this repository.
