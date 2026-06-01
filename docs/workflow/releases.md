# Release Workflow

BlueNote publishes portable archives from GitHub Releases. These archives are built on GitHub-hosted runners and do not require a network install after extraction.

## Release assets

The release workflow publishes:

- `bn.exe` — Windows x64 standalone executable.
- `bluenote-windows-x64.zip` — Windows x64 portable ZIP containing `bn.exe`.
- `bluenote-linux-x64.tar.gz` — Linux x64 portable tarball containing `bn`.

SHA-256 checksums are printed directly in the GitHub Release notes.

macOS, Linux arm64, installers, package-manager recipes, and code signing are future follow-ups.

## Windows usage

1. Download `bluenote-windows-x64.zip` from the GitHub Release.
2. Extract the ZIP.
3. Open a terminal in the extracted `bluenote` folder.
4. Run:

```powershell
.\bn.exe --help
.\bn.exe init
.\bn.exe tui
```

The Windows release also publishes `bn.exe` directly for environments where downloading executables is acceptable. The ZIP assets are provided for environments that prefer or require executables to arrive inside an archive.

## Linux usage

Download `bluenote-linux-x64.tar.gz`, then run:

```bash
tar -xzf bluenote-linux-x64.tar.gz
cd bluenote
./bn --help
./bn init
./bn tui
```

## Checksum verification

Copy the matching SHA-256 checksum from the GitHub Release notes.

To verify a downloaded Linux archive, compare the release-note checksum with:

```bash
sha256sum bluenote-linux-x64.tar.gz
```

On Windows PowerShell, compare the printed hash with the matching checksum in the GitHub Release notes:

```powershell
Get-FileHash .\bluenote-windows-x64.zip -Algorithm SHA256
Get-FileHash .\bn.exe -Algorithm SHA256
```

## Maintainer release flow

From a clean main branch, run the public gate and push a version tag:

```bash
bun run check
git tag v0.1.0
git push origin v0.1.0
```

The GitHub Actions release workflow builds Windows and Linux assets on matching runners, prints checksums in the GitHub Release notes, and attaches the binaries/archives to a real GitHub Release for the pushed tag.

For a manual dry run from GitHub, use the `workflow_dispatch` trigger on the release workflow. A dispatch run builds and uploads workflow artifacts; publishing a GitHub Release still requires pushing a `v*` tag.
