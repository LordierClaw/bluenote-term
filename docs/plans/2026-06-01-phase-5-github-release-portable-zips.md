# Phase 5 GitHub Release Portable ZIPs Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task after user approval.

**Phase:** Phase 5 — GitHub release and portable distribution.

**Goal:** Add a simple real GitHub Release pipeline that publishes portable BlueNote artifacts for Windows x64 and Linux x64.

**Architecture:** Keep the first release path intentionally small: build platform artifacts on matching GitHub-hosted runners, package them as ZIP/tarball assets, generate checksums, and attach them to a GitHub Release created from `v*` tags. Prefer a single Bun-compiled executable when it passes platform smoke checks; keep the implementation structured so a future fallback portable-runtime ZIP can be added without changing the user-facing release contract.

**Tech Stack:** Bun 1.3+, GitHub Actions, `oven-sh/setup-bun`, shell/PowerShell packaging scripts, current BlueNote CLI/TUI entrypoint, OpenTUI native optional packages.

---

## Acceptance Criteria

- Pushing a `v*` tag creates a real GitHub Release.
- Release assets include:
  - `bluenote-windows-x64.zip`
  - `bluenote-linux-x64.tar.gz`
  - `SHA256SUMS.txt`
- Windows asset is ZIP-first for corp extraction workflows and contains `bn.exe` plus a short usage/readme file.
- Linux asset contains `bn` plus a short usage/readme file.
- Each platform build runs install, the normal public gate where practical, package creation, and at least `--help` smoke verification against the packaged executable.
- Documentation explains how to download, extract, verify checksum, and run the release artifacts.
- No Node 16 compatibility work is included in this first pass.
- No manual commit is made unless the user explicitly requests it.

## Non-Goals

- No auto-update mechanism.
- No installers/MSI/deb/rpm/Homebrew.
- No code signing/notarization in this first pass.
- No Node 16 CLI-only compatibility artifact.
- No macOS artifacts yet.
- No fallback `bun.exe + bn.js + node_modules` portable bundle unless single-executable packaging fails during implementation.

---

## Task 1: Add packaging scripts and docs scaffolding

**Objective:** Create a small, repeatable place for release packaging logic and release usage documentation.

**Files:**
- Create: `scripts/package-release.ts`
- Create: `docs/workflow/releases.md`
- Modify: `package.json`
- Modify: `README.md`

**Step 1: Add package script names**

Add scripts to `package.json`:

```json
{
  "scripts": {
    "build:release": "bun run ./scripts/package-release.ts",
    "package:release": "bun run ./scripts/package-release.ts"
  }
}
```

Keep existing scripts unchanged.

**Step 2: Create the release docs placeholder**

Create `docs/workflow/releases.md` with sections for:

- Release asset names
- Windows ZIP usage
- Linux tarball usage
- Checksum verification
- Maintainer tag workflow

Initial content can be minimal and updated after scripts/workflow are final.

**Step 3: Link from README**

Add a short `Releases` section to `README.md` pointing to `docs/workflow/releases.md` and describing GitHub Release artifacts.

**Step 4: Verify**

Run:

```bash
bun run typecheck
```

Expected: pass.

---

## Task 2: Implement platform-aware release packaging script

**Objective:** Package the current platform into the expected release asset layout.

**Files:**
- Modify: `scripts/package-release.ts`
- Test/verify via shell commands only for first pass

**Step 1: Detect platform and architecture**

In `scripts/package-release.ts`, detect:

```ts
const platform = process.platform
const arch = process.arch
```

Support only:

- `win32/x64` -> `windows-x64`
- `linux/x64` -> `linux-x64`

Fail with a clear error for other platforms.

**Step 2: Build executable**

Use Bun build compile:

- Windows: `bun build ./bin/bn.ts --compile --outfile dist/release/work/bluenote/bn.exe`
- Linux: `bun build ./bin/bn.ts --compile --outfile dist/release/work/bluenote/bn`

Use `Bun.spawnSync` or Node `child_process.spawnSync`, print command output, and fail non-zero on build failure.

**Step 3: Add release readme**

Write `dist/release/work/bluenote/README.txt` containing:

```text
BlueNote portable release

Windows:
  bn.exe --help
  bn.exe init
  bn.exe tui

Linux:
  ./bn --help
  ./bn init
  ./bn tui

Notes are local files. No network install is required after extraction.
```

**Step 4: Smoke packaged executable**

Run:

- Windows: `dist/release/work/bluenote/bn.exe --help`
- Linux: `dist/release/work/bluenote/bn --help`

Expected: exit code 0 and output contains `BlueNote v`.

**Step 5: Archive artifact**

Use platform-native commands available on GitHub runners:

- Windows PowerShell: `Compress-Archive -Path dist/release/work/bluenote -DestinationPath dist/release/bluenote-windows-x64.zip -Force`
- Linux: `tar -czf dist/release/bluenote-linux-x64.tar.gz -C dist/release/work bluenote`

**Step 6: Verify output exists**

Expected files:

- Windows: `dist/release/bluenote-windows-x64.zip`
- Linux: `dist/release/bluenote-linux-x64.tar.gz`

---

## Task 3: Add GitHub Actions release workflow

**Objective:** Build release assets on matching OS runners and publish them to a GitHub Release on tags.

**Files:**
- Create: `.github/workflows/release.yml`

**Step 1: Add tag trigger**

Workflow trigger:

```yaml
on:
  push:
    tags:
      - "v*"
  workflow_dispatch:
```

**Step 2: Add Windows build job**

Use `windows-latest`:

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: oven-sh/setup-bun@v2
    with:
      bun-version: 1.3.14
  - run: bun install --frozen-lockfile
  - run: bun run check
  - run: bun run package:release
  - uses: actions/upload-artifact@v4
    with:
      name: bluenote-windows-x64
      path: dist/release/bluenote-windows-x64.zip
```

If `bun run check` fails on Windows due to an existing platform-specific test issue unrelated to packaging, stop and report rather than weakening the gate without approval.

**Step 3: Add Linux build job**

Use `ubuntu-latest` with the same structure and upload `dist/release/bluenote-linux-x64.tar.gz`.

**Step 4: Add release job**

Use `ubuntu-latest`, needs both build jobs:

- download artifacts into `dist/release-assets`
- generate `SHA256SUMS.txt`
- create/upload GitHub Release via `softprops/action-gh-release@v2` or `gh release create`

Prefer `softprops/action-gh-release@v2` for a simple first pass:

```yaml
permissions:
  contents: write
```

Attach:

```yaml
files: |
  dist/release-assets/**/bluenote-windows-x64.zip
  dist/release-assets/**/bluenote-linux-x64.tar.gz
  dist/release-assets/SHA256SUMS.txt
```

---

## Task 4: Update release documentation

**Objective:** Make the release workflow understandable for users and maintainers.

**Files:**
- Modify: `docs/workflow/releases.md`
- Modify: `README.md`

**Step 1: Document user download/install**

Windows instructions:

```text
1. Download bluenote-windows-x64.zip from the GitHub Release.
2. Extract the ZIP.
3. Run bn.exe --help.
4. Run bn.exe init in the folder where you want BlueNote-managed notes.
```

Linux instructions:

```bash
tar -xzf bluenote-linux-x64.tar.gz
cd bluenote
./bn --help
./bn init
```

**Step 2: Document checksums**

Linux/macOS:

```bash
sha256sum -c SHA256SUMS.txt
```

Windows PowerShell example:

```powershell
Get-FileHash .\bluenote-windows-x64.zip -Algorithm SHA256
```

**Step 3: Document maintainer workflow**

```bash
bun run check
git tag v0.1.0
git push origin v0.1.0
```

Mention that the workflow builds platform assets on GitHub runners and attaches them to the release.

---

## Task 5: Verify locally and inspect final changes

**Objective:** Prove the Linux packaging path works locally and the repo is ready for GitHub Actions validation.

**Files:**
- No intentional source changes beyond previous tasks

**Step 1: Run package script locally**

On Linux:

```bash
bun run package:release
```

Expected:

- `dist/release/bluenote-linux-x64.tar.gz` exists
- smoke output contains `BlueNote v`

**Step 2: Extract and run local artifact**

```bash
rm -rf /tmp/bluenote-release-check
mkdir -p /tmp/bluenote-release-check
tar -xzf dist/release/bluenote-linux-x64.tar.gz -C /tmp/bluenote-release-check
/tmp/bluenote-release-check/bluenote/bn --help
```

Expected: exit code 0 and help text prints.

**Step 3: Run full public gate**

```bash
bun run check
```

Expected: pass.

**Step 4: Inspect git diff**

```bash
git diff -- package.json scripts/package-release.ts .github/workflows/release.yml README.md docs/workflow/releases.md
```

Expected: only planned release packaging/docs changes.

---

## Future Follow-Ups

- Add macOS arm64/x64 release assets.
- Add Linux arm64 release asset if needed.
- Add code signing/notarization if corp policy later requires it.
- Add fallback portable-runtime artifact if Bun single executable cannot reliably package OpenTUI native assets on Windows.
- Add a short release checklist to PR template if the project later adds one.
