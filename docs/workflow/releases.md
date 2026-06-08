# Release Workflow

BlueNote publishes portable archives from GitHub Releases. These archives are built on GitHub-hosted runners and do not require a network install after extraction.

## Release assets

The release workflow publishes only versioned archive assets:

- `bluenote-v0.3.0-windows-x64.zip` — Windows x64 portable ZIP containing `bn.exe`, `sql-wasm.wasm`, and usage notes.
- `bluenote-v0.3.0-linux-x64.tar.gz` — Linux x64 portable tarball containing `bn`, `sql-wasm.wasm`, and usage notes.

SHA-256 checksums are printed directly in the GitHub Release notes for the two archives.

macOS, Linux arm64, installers, package-manager recipes, and code signing are future follow-ups.

## Windows usage

1. Download `bluenote-v0.3.0-windows-x64.zip` from the GitHub Release.
2. Extract the ZIP.
3. Open a terminal in the extracted `bluenote` folder.
4. Run:

```powershell
.\bn.exe --help
.\bn.exe init
.\bn.exe tui
```

The extracted archive already includes `sql-wasm.wasm` next to `bn.exe`. Keep the extracted folder contents together so the executable can load its SQL.js runtime companion file.

## Linux usage

Download `bluenote-v0.3.0-linux-x64.tar.gz`, then run:

```bash
tar -xzf bluenote-v0.3.0-linux-x64.tar.gz
cd bluenote
./bn --help
./bn init
./bn tui
```

The extracted archive already includes `sql-wasm.wasm` next to `bn`. Keep the extracted folder contents together so the executable can load its SQL.js runtime companion file.

## Checksum verification

Copy the matching SHA-256 checksum from the GitHub Release notes.

To verify a downloaded Linux archive, compare the release-note checksum with:

```bash
sha256sum bluenote-v0.3.0-linux-x64.tar.gz
```

On Windows PowerShell, compare the printed hash with the matching checksum in the GitHub Release notes:

```powershell
Get-FileHash .\bluenote-v0.3.0-windows-x64.zip -Algorithm SHA256
```

## Maintainer release flow

From a clean main branch, run the public gate and push a version tag:

```bash
bun run check
git tag v0.3.0
git push origin v0.3.0
```

The GitHub Actions release workflow builds Windows and Linux archives on matching runners, prints checksums in the GitHub Release notes, and attaches only the versioned archives to a real GitHub Release for the pushed tag.

For a manual dry run from GitHub, use the `workflow_dispatch` trigger on the release workflow and leave `release_version` at the current package version (for example `v0.3.0`). A dispatch run builds and uploads workflow artifacts using the same versioned archive names; publishing a GitHub Release still requires pushing a `v*` tag.
