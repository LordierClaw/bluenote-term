# Release Workflow

BlueNote publishes portable archives from GitHub Releases. These archives are built on GitHub-hosted runners and do not require a network install after extraction.

## Release assets

The release workflow publishes:

- `bluenote-windows-x64.zip` — Windows x64 portable ZIP containing `bn.exe`.
- `bluenote-linux-x64.tar.gz` — Linux x64 portable tarball containing `bn`.
- `SHA256SUMS.txt` — SHA-256 checksums for the release archives.

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

The Windows artifact is ZIP-first for corporate environments that allow executables extracted from ZIP files.

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

Download `SHA256SUMS.txt` next to the release archive.

To verify every downloaded asset in the current directory, run:

```bash
sha256sum -c SHA256SUMS.txt
```

If you downloaded only the Linux archive, verify just that line:

```bash
grep 'bluenote-linux-x64.tar.gz$' SHA256SUMS.txt | sha256sum -c -
```

On Windows PowerShell, compare the printed hash with the matching line in `SHA256SUMS.txt`:

```powershell
Get-FileHash .\bluenote-windows-x64.zip -Algorithm SHA256
```

## Maintainer release flow

From a clean main branch, run the public gate and push a version tag:

```bash
bun run check
git tag v0.1.0
git push origin v0.1.0
```

The GitHub Actions release workflow builds Windows and Linux assets on matching runners, generates checksums, and attaches them to a real GitHub Release for the pushed tag.

For a manual dry run from GitHub, use the `workflow_dispatch` trigger on the release workflow. A dispatch run builds and uploads workflow artifacts; publishing a GitHub Release still requires pushing a `v*` tag.
