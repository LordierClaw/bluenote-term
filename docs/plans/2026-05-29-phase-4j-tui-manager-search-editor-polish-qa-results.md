# Phase 4J TUI manager/search/editor polish QA results

Task 14 extends the automated visual/manual QA harness so Task 15 can collect screenshot-backed acceptance evidence for every Phase 4J scenario.

## Harness scope

The harness now seeds a disposable BlueNote root through CLI-created notes and rebuilds indexes after shaping the QA data. Seed coverage includes:

- long filenames/titles/descriptions for manager row truncation;
- nested folders under `notes/projects/client/` for manager and Search Everything folder previews;
- repeated `needle-repeat` content for multi-result Search Everything evidence;
- editor body markers for find/replace (`replace-target`), clipboard attempts (`clipboard-source`), and undo/redo (`undo-redo-start`).

## Phase 4J visual/manual evidence cases

| Requirement(s) | Harness case/artifact prefix | Scenario | Expected evidence |
| --- | --- | --- | --- |
| 2 | `manager-long-row-truncation-100x30` | Manager long-row truncation | Long row text remains clamped and does not bleed into preview pane. |
| 3 | `manager-folder-preview-100x30` | Manager folder preview | Folder preview shows immediate items only, without metadata rows. |
| 4 | `manager-note-preview-100x30` | Manager note preview | Note preview shows title/body content, without path/description metadata rows. |
| 7, 8 | `manager-filter-name-only-100x30` | Manager filter | `/ Filter` visible; filtering matches visible item names in the current folder. |
| 9 | `search-folder-preview-100x30` | Search Everything folder preview | Full folder path title, highlighted match, item-style folder contents. |
| 10 | `search-file-title-preview-100x30` | Search Everything file/title preview | Title + filename preview with highlighted title/filename match. |
| 11 | `search-multi-content-results-100x30` | Search Everything multi-content results | Multiple result rows for repeated content matches. |
| 5 | `editor-separator-100x30` | Editor separator | Calm visible separation between topbar/body/bottombar. |
| 12 | `editor-find-replace-highlight-100x30` | Editor find-highlight state | Automated pane evidence opens find mode and confirms matching editor text is highlighted/selected; Task 15 live QA covers terminal delivery of `Ctrl+R` replace. |
| 6, 14 | `editor-clipboard-attempt-100x30` | Clipboard shortcut attempt | Live QA records whether `Ctrl+Shift+C/X/V` are delivered or terminal-consumed and validates fallback. |
| 13, 14 | `editor-undo-flow-100x30` | Undo flow | Recent edit can be undone; pane evidence requires inserted text to be absent after `Ctrl+Z`. |
| 13, 14 | `editor-redo-flow-100x30` | Redo flow | Recent edit can be redone; pane evidence requires inserted text to return after `Ctrl+Y`. |

Each harness run writes per-case `pane.txt`, `screen.png` when screenshots are enabled, `screenshot.log`, and a report section containing a per-requirement evidence table with screenshot paths.

## Screenshot artifact policy

Focused target-window screenshots remain preferred. If target capture fails or the desktop portal blocks it, the screenshot bridge attempts a fullscreen fallback and preserves fallback/raw artifacts (`screen.fallback-<n>.png`, `screen.raw.png`) while still producing the canonical `screen.png` when possible. Existing small-terminal crop handling continues to preserve `screen.raw.png` before writing the cropped acceptance artifact.

## Process cleanup policy

The post-run process check remains scoped to the disposable QA root: the harness lists and cleans only BlueNote TUI processes whose environment contains `BLUENOTE_ROOT=<qa root>`, then writes `process-after.txt` and embeds the scoped result in `report.md`.

## Task 14 verification log

To be filled by the implementing run:

| Command | Result | Notes |
| --- | --- | --- |
| `bun test tests/unit/tui/visual-tui-qa-script.test.ts` | Pass — 5 tests, 0 failures | Unit coverage for case list, evidence rows, screenshot fallback, seed expectations. |
| `bun run qa:visual:tui -- --no-screenshots --out-dir=/tmp/bluenote-4j-visual-dryrun` | Pass | Dry-run report: `/tmp/bluenote-4j-visual-dryrun/report.md`; no `Needs review` entries after harness navigation/expectation fixes. |
| `bun run qa:visual:tui -- --out-dir=/tmp/bluenote-4j-visual-final` | Pass with screenshot capture blocked by GNOME/XDG portal | Screenshot-mode report: `/tmp/bluenote-4j-visual-final/report.md`; command completed, pane evidence passed, each screenshot log captured focused-window and fullscreen fallback denial diagnostics (`XDG portal screenshot was denied or cancelled with response code 2`), and process cleanup passed. |

Task 15 replaced the TODO with live manual acceptance results below.

## Task 15 live computer-use/manual acceptance log

### Environment and screenshot status

- Live terminal: GNOME Terminal + tmux-backed TUI sessions from `/home/hainn/blue/code/bluenote-term`.
- Computer-use readiness: window listing/focus and ydotool input delivery worked; `CTRL+R` was sent through ydotool to the focused `BlueNote Live CtrlR QA` window with exact window-focus verification.
- Screenshot status: blocked by GNOME/XDG portal in this desktop session. `mcp_computer_use_linux_screenshot` and the harness screenshot bridge both failed with portal denial (`XDG portal screenshot was denied or cancelled with response code 2`). Pane captures and screenshot logs are preserved instead of claiming screenshot success.
- Visual harness after Task 14A: `/tmp/bluenote-4j-visual-dryrun/report.md` and `/tmp/bluenote-4j-visual-final/report.md` completed with no `Needs review`, no missing expected text, and no forbidden text. The final report marks every screenshot row as `Screenshot blocked` with per-case `screenshot.log` diagnostics.

### Live manual evidence matrix

| Requirement(s) | Evidence | Actual result | UX rating | Status |
| --- | --- | --- | --- | --- |
| 1, 2, 3, 4, 5, 6 | Pane captures in `/tmp/bluenote-live-qa-evidence/manager-footer.txt`, `manager-long-row.txt`, `manager-folder-preview.txt`, `manager-note-preview.txt`, `manager-filter-negative.txt`, `manager-filter-positive.txt`; harness report `/tmp/bluenote-4j-visual-final/report.md` | Manager current-open footer, long-row truncation, folder preview, note preview, and filename/folder-name-only filtering are readable. Negative body-only filter returned `0 items (filtered)`; positive filename filter returned `name-only-target.md`. | 4/5 | Pass |
| 7, 15 | `/tmp/bluenote-live-qa-evidence/ctrlr-before.txt`; render tests; harness `editor-separator-100x30` | Editor topbar starts flush with `Editor Body Replace Note` (no leading blank), top/body/bottom separators are clear, and shortcut row advertises `Ctrl+R Replace`. | 4/5 | Pass |
| 9, 10, 11, 12 | `/tmp/bluenote-live-qa-evidence/search-folder.txt`, `search-file-title.txt`, `search-content.txt`; harness Search Everything cases | Folder, title/file, centered content, and repeated content result cases were readable and matched expected result types. | 4/5 | Pass |
| 13, 15 | Computer-use `CTRL+R` delivery plus `/tmp/bluenote-live-qa-evidence/ctrlr-after-key.txt`, `ctrlr-replace-open-with-query.txt`, `ctrlr-after-replace-save.txt`, `ctrlr-disk-readback.txt` | Focused GNOME Terminal received `CTRL+R`; replace dialog opened from editor body; existing find query carried into replace; replacing current match changed one `replace-target` to `live-replaced`; `Ctrl+S` saved; disk readback confirmed `editor-body live-replaced ...`. | 4/5 | Pass |
| 14 | `/tmp/bluenote-live-qa-evidence/editor-undo.txt`, `editor-redo.txt`; harness split `editor-undo-flow-100x30` and `editor-redo-flow-100x30` cases | Undo removed the inserted marker; redo restored `added`; harness also proves absent/present marker expectations. | 4/5 | Pass |
| 8 | Harness `editor-clipboard-attempt-100x30` plus live no-op/fallback policy | Clipboard shortcuts remain best-effort terminal events. No data loss was observed; fallback/pane evidence records delivery status rather than overclaiming terminal clipboard support. | 4/5 | Pass with terminal-dependent caveat |
| 16, 17 | `/tmp/bluenote-live-qa-evidence/process-before-cleanup.txt`, `process-after-cleanup.txt`, `process-after-forced-cleanup.txt` | Back/quit/navigation flows remained usable during the above checks. One orphaned live QA process required forced scoped cleanup after tmux session cleanup; final process readback is empty (`After forced scoped cleanup:` only). | 4/5 | Pass after cleanup |

### Task 15 acceptance decision

- Functional blockers: none after Task 14A changed the primary replace binding from undeliverable `Ctrl+H` to terminal-deliverable `Ctrl+R`.
- Visual acceptance: pass from a user perspective at 4/5. The UI is calm/readable in pane evidence; screenshots could not be accepted because the desktop portal denied capture, not because the TUI failed.
- Disk/state truth: replace save and undo/redo evidence match UI claims.
- Process cleanup: final scoped process readback is clean after forced cleanup of an orphaned live QA process.
