# Phase 4 TUI Manual QA Results

**Date:** 2026-05-28
**Plan:** `docs/plans/2026-05-28-phase-4-tui-manual-qa-plan.md`
**QA root:** `/tmp/bluenote-tui-manual-qa-iWRvsu` (session-local / ephemeral)
**Evidence directory:** `/tmp/bluenote-qa-evidence/` (session-local / ephemeral)
**Scope:** Historical manual/interactive QA results plus subsequent Phase 4G blocker verification/fixes and final visual acceptance evidence. The initial 2026-05-28 manual QA pass made no product-code fixes; later Phase 4G sections below record product-code fixes for autosave/cursor and docs-only verification for quit/final acceptance.

The `/tmp` paths above were not committed and may not survive outside the QA session. This results document therefore keeps the durable record inline: command outcomes, scenario pass/fail ratings, key status text, disk-truth snippets, screenshot status, and final Phase 4G acceptance caveats are summarized below for future readers.

## Executive summary

Critical save/navigation/quit flows are now **functionally accepted for Phase 4G** in the tested paths: autosave and `Ctrl+S` write real plain Markdown files, cursor-aware edits persist at the intended insertion point, `Esc` returns to Manager after saves, switching from edited notes to other notes works, permission failures are visible and recoverable, and `q`/`Ctrl+C` quit in the tested critical paths.

The initial 2026-05-28 manual QA pass could not be treated as full visual acceptance because screenshot/accessibility capture was blocked. That limitation is now superseded for Phase 4G by the focused-GNOME-Terminal `computer-use-linux` screenshot bridge documented below, which captured pixel evidence across multiple terminal sizes/scales. Remaining visual-risk notes from the initial pass should be read as historical unless explicitly restated in the Phase 4G final multi-size visual acceptance section.

Initial 2026-05-28 manual QA findings, updated by later Phase 4G sections where applicable:

1. **Medium:** Editor top bar consistently shows `Updated unknown` even though sidecars have timestamps; this violates the Phase 4F editor metadata contract.
2. **Medium / test-infra:** The required `bun run smoke:opentui:interactive` preflight fails because `tmux` is not installed in this environment.
3. **Medium / visual-risk, partially superseded:** Unicode/CJK/emoji UI display could not be conclusively accepted in the initial pass. Disk persistence was correct, but fallback text capture displayed corrupted wide-character layout because of harness limitations. Phase 4G later unblocked general pixel capture, but Unicode/wide-character-specific visual acceptance remains outside the three final screenshots unless covered by a future targeted pass.
4. **Low / visual-risk, historical:** Search Everything and prompt captures showed occasional fallback-harness artifacts (`[1 q`, replacement chars around box borders). These were likely PTY capture limitations. Phase 4G later captured real Search Everything pixel evidence for the `visual` query path.

### Historical continuation note — 2026-05-28

The user approved proceeding from the manual QA plan into hardening. At that time, a fresh `computer-use-linux` screenshot retry against Ubuntu Terminal window `2069271615` still failed with GNOME Shell / XDG portal denial, so screenshot-based visual acceptance remained open. This historical blocker is superseded for Phase 4G by the focused-terminal screenshot bridge and final multi-size visual acceptance section below.

### Historical Task 7 continuation note — 2026-05-29

Retried real visual capture for Task 7 before making any UI/code changes. At that time, `computer-use-linux doctor` still reported no blockers and `list_windows` found the Ubuntu Terminal window `2069271615` at `/home/hainn/blue/code/bluenote-term`, but a targeted screenshot retry against that window still failed: `GNOME Shell screenshot failed: GNOME Shell Screenshot call failed; XDG portal screenshot was denied or cancelled with response code 2`. Because no real screenshot evidence was available then, visual scenarios A/B/D/F/I/K were not re-rated and no speculative color/layout/product-code changes were made. This is historical; later Phase 4G sections document the focused-terminal screenshot bridge and the final multi-size visual acceptance pass.

## User-reported blocker update — 2026-05-29

The previous finish-branch attempt is invalidated by live user reports:

- Autosave always fails in the real TUI.
- The editor cursor does not show.
- `Ctrl+C` and `q` do not reliably quit.

Treat these as Blocker severity until disproven by reproducible evidence. Phase 4G now owns reproducing, root-causing, fixing, and live-verifying these issues before any visual-polish-only work resumes.

## Phase 4G live harness evidence — 2026-05-29

Task 2 established a fresh live TUI reproduction harness for the Phase 4G blockers:

- Repo working directory: `/home/hainn/blue/code/bluenote-term`
- Repo-local TUI command inside the launched terminal: `BLUENOTE_ROOT="$QA_ROOT" bun run ./bin/bn.ts tui`
- Exact terminal launch command:
  ```bash
  ROOT="$(cat /tmp/bluenote-phase4g-root.txt)"
  gnome-terminal --title='BlueNote Phase 4G Live Blocker QA' -- bash -lc "cd /home/hainn/blue/code/bluenote-term; export BLUENOTE_ROOT='$ROOT'; printf 'BLUENOTE_ROOT=%s\n' '$ROOT'; bun run ./bin/bn.ts tui; printf '\nTUI exited. Press Enter to close...'; read"
  ```
- Disposable QA root: `/tmp/bluenote-tui-phase4g-MhIDFt`
- Probe notes created:
  - `autosave-blocker-probe-9p4w87` → `notes/inbox/autosave-blocker-probe-9p4w87.md`
  - `cursor-blocker-probe-fxht7x` → `notes/inbox/cursor-blocker-probe-fxht7x.md`
  - `quit-blocker-probe-nr70yv` → `notes/inbox/quit-blocker-probe-nr70yv.md`
- Tool checks:
  - `tmux`: not installed / not on `PATH`.
  - `gnome-terminal`: `/usr/bin/gnome-terminal`.
  - Bun: `1.3.14`.
  - `computer-use-linux doctor`: ready with `can_query_windows`, `can_focus_windows`, and `can_send_development_input` true; blockers empty.
- Live terminal window:
  - Title: `BlueNote Phase 4G Live Blocker QA`
  - Window id: `2069271618`
  - Bounds: `814x577` at `(209, 62)`
  - TTY: `/dev/pts/2`
  - Active process: `bun run ./bin/bn.ts tui`, PID `130155`
  - Root shell command includes `BLUENOTE_ROOT=/tmp/bluenote-tui-phase4g-MhIDFt` and cwd `/home/hainn/blue/code/bluenote-term`.
- Screenshot/accessibility status:
  - Targeted screenshot against window `2069271618` failed with GNOME Shell / XDG portal denial: `XDG portal screenshot was denied or cancelled with response code 2`.
  - `get_app_state` without screenshot resolved the target window but AT-SPI extraction failed with `failed to connect to AT-SPI bus`.
  - At Task 2 time, functional live verification could still use `computer-use-linux` targeted keyboard input plus disk/process readback, but visual screenshot acceptance was not claimed until later focused-bridge screenshot evidence became available.

## Phase 4G autosave root-cause/fix evidence — 2026-05-29

Task 3 root cause was reproduced and fixed:

- Basic live autosave against the initial Phase 4G root did **not** reproduce a persistence failure:
  - Targeted `computer-use-linux` input opened `autosave-blocker-probe-9p4w87` in window `2069271618`.
  - Typing `autosave phase4g probe 20260529-012020` persisted after debounce, but the first four characters were lost by fast post-open targeted input, leaving `save phase4g probe 20260529-012020` on disk.
  - A second line `second autosave phase4g probe 20260529-012100` persisted fully after debounce.
- Controlled fault reproduction:
  - Replaced `.data/metadata.sqlite` with a directory in `/tmp/bluenote-tui-phase4g-MhIDFt`.
  - Typed `faulted rebuild autosave phase4g probe 20260529-012459` via `computer-use-linux`.
  - Markdown and sidecar updated, but `bn rebuild` failed with `EISDIR: illegal operation on a directory, open '/tmp/bluenote-tui-phase4g-MhIDFt/.data/metadata.sqlite'`.
  - Root cause: `persistTuiEditorBody()` treated `syncEditedNote + rebuildIndexes + showTuiNote` as one persistence operation. A post-write derived-index rebuild failure caused the controller to mark autosave as failed even after note content/sidecar had already been saved.
- RED test added:
  - `tests/integration/tui-workflow.test.ts`: `autosave keeps saved state when derived-index rebuild fails after note persistence`.
  - Initial RED failure showed the file had the new body but controller `savedBody` remained stale (`Original body`).
- Fix:
  - `src/tui/app.ts` now reads back the saved note after `syncEditedNote` even if `rebuildIndexes` fails, so editor save state reflects the durable note write instead of a derived-index failure.
- Automated verification:
  - Targeted RED→GREEN test passed.
  - `bun test tests/unit/tui/workspace-controller.test.ts tests/unit/tui/render-routing.test.ts tests/integration/tui-workflow.test.ts` passed: 136 pass, 0 fail.
  - `bun run typecheck` passed.
- Live fix verification:
  - Fresh QA root: `/tmp/bluenote-tui-phase4g-autosave-fix-Oa1UyA`.
  - Window: `BlueNote Phase 4G Autosave Fix QA`, id `2069271619`, active process `bun run ./bin/bn.ts tui`, PID `138406`.
  - Replaced `.data/metadata.sqlite` with a directory after opening the note.
  - Typed `autosave fixed postwrite failure 20260529-012734` via `computer-use-linux`; due the same fast-input/opening issue, disk received `save fixed postwrite failure 20260529-012734`.
  - Markdown and sidecar updated after debounce while `bn rebuild` still failed with the intentional `EISDIR` fault.
  - After the editor was stable, typed `full autosave fixed postwrite verification 20260529-013015` via `computer-use-linux`; the full line appeared on disk after debounce.
  - Disk readback showed `HAS_FRONTMATTER False`, sidecar JSON parsed successfully, sidecar key remained `autosave-fixed-probe-t1a6ev`, and `updatedAt` advanced to `2026-05-28T18:30:24.812Z`.
  - This confirms the live TUI can persist autosave content under a derived-index rebuild failure after the fix. At that moment screenshot/status visual confirmation was still blocked by GNOME/XDG portal denial, so visual status text was not claimed until the later focused-bridge capture setup.

## Phase 4G cursor root-cause/fix evidence — 2026-05-29

Task 4 root cause was reproduced at render-code level and verified functionally in live TUI:

- Root cause:
  - The editor body displayed note text with `TextRenderable`, while `bluenote-editor-body-input` was a focusable `BoxRenderable`, not a native `InputRenderable`/editor view.
  - Earlier cleanup removed the old cursor glyph and tests explicitly prohibited cursor glyphs, leaving no visible cursor representation in body mode.
  - This explains the user report that the editor cursor does not show, even though cursor-aware state and arrow-key insertion logic can still work.
- RED test added:
  - `tests/unit/tui/render-routing.test.ts`: `editor body renders a visible styled cursor cell without inserting a glyph`.
  - Initial RED failure: rendered body text was `body` with no styled cursor cell; expected `body ` with an accent-background cursor cell.
- Fix:
  - `src/tui/render-editor.ts` now renders the body as OpenTUI `StyledText` with a render-only cursor cell.
  - The cursor cell uses primary accent background `#38bdf8` and background-colored foreground `#0f172a`, so the cursor is visible as a block/cell without adding `|`, `▌`, or `█` to the note text.
  - When the cursor is on an existing character, the existing character is highlighted; when the cursor is at end-of-body, a styled trailing space is rendered.
  - The note body itself remains unchanged; the cursor is a render-only styled cell.
- Automated verification:
  - Targeted RED→GREEN tests passed.
  - `tests/unit/tui/render-routing.test.ts`: `editor body renders a visible styled cursor cell before a newline` covers the reviewer-found edge case where styling `"\n"` produced no visible cursor cell.
  - `bun test tests/unit/tui/render-routing.test.ts tests/unit/tui/render-view-models.test.ts` passed: 72 pass, 0 fail.
  - `bun run typecheck` passed.
- Live verification:
  - Corrected reproduction navigation: the first Enter opens `inbox`; the second Enter opens the note. Earlier failed cursor probes only reached Manager shortcuts and did not edit the note.
  - PTY check using the repo TUI command verified cursor-aware insertion: typed `abcdef`, moved left three times, typed `MID`; disk contained `abcMIDdef`, with no cursor glyph artifact and no frontmatter.
  - Live `computer-use-linux` check used window `BlueNote Phase 4G Cursor Fix QA` id `2069271621`, active process `bun run ./bin/bn.ts tui`, root `/tmp/bluenote-tui-phase4g-cursor-fix-V6Hwpi`.
  - Live input sequence: `Enter` to open `inbox`, `Enter` to open note, typed `abcdef`, pressed Left three times, typed `MID`.
  - Disk readback: `BODY='abcMIDdef'`, `HAS_CURSOR_GLYPH_ARTIFACT=False`, `HAS_FRONTMATTER=False`, sidecar description `abcMIDdef`.
  - Pixel evidence was later unblocked with the focused GNOME Terminal screenshot bridge.
  - Newline-cursor visual QA root: `/tmp/bluenote-tui-phase4g-cursor-newline-P26FqO`.
  - Newline-cursor TUI window: `BlueNote Phase 4G Cursor Newline Visual QA`, id `2069271635`, launched with `--geometry=100x30 --zoom=1.5`.
  - Screenshot evidence: `/tmp/cul-cursor-newline-screenshot.png` (`2560x1600` PNG) captured through focused terminal MCP bridge.
  - Visual inspection showed editor text `abc` / `def` and a cyan cursor cell immediately after `abc` before the line break; the small capture bridge terminal did not obstruct the important editor area.
  - Functional and pixel-level cursor verification passed for normal in-line insertion, end-of-body cursor, and newline-position cursor.

## Phase 4G computer-use visual setup evidence — 2026-05-29

The GNOME Wayland visual-capture blocker is now understood and has a repeatable workaround:

- Local readiness:
  - `computer-use-linux doctor` reports green readiness: `can_query_windows`, `can_focus_windows`, `can_send_development_input`, and AT-SPI support are true; blockers are empty.
  - Direct MCP screenshots can still fail from the Hermes/background process with `GNOME Shell Screenshot call failed; XDG portal screenshot was denied or cancelled with response code 2`.
- Root cause of screenshot failure:
  - Direct GNOME Shell DBus screenshot call fails with `org.freedesktop.DBus.Error.AccessDenied: Screenshot is not allowed`.
  - XDG portal logs show `Only the focused app is allowed to show a system access dialog` and `Failed to associate portal window with parent window` when screenshot requests originate from a non-focused/background process.
- Working screenshot workaround:
  - Launch a small focused GNOME Terminal bridge and run `computer-use-linux mcp` from that terminal.
  - Call the MCP `screenshot` tool from that focused terminal process, decode the returned PNG payload, and inspect the PNG with vision.
  - Verified screenshot files:
    - `/tmp/cul-focused-mcp-screenshot.png` (`2560x1600`, captured desktop successfully).
    - `/tmp/cul-resize-scale-screenshot.png` (`2560x1600`, captured terminal size/zoom probes successfully).
    - `/tmp/cul-cursor-newline-screenshot.png` (`2560x1600`, captured BlueNote cursor newline visual QA successfully).
- Terminal size verification:
  - `gnome-terminal --geometry=80x24` produced bounds about `814x577`.
  - `gnome-terminal --geometry=120x40` produced bounds about `1214x929`.
- Terminal scale/zoom verification:
  - `gnome-terminal --geometry=100x30 --zoom=1.0` produced terminal grid `30 100` and bounds about `1014x709`.
  - `gnome-terminal --geometry=100x30 --zoom=1.5` produced terminal grid `30 100` and bounds about `1514x1009`.
  - This gives a repeatable UI QA matrix for small/medium/large windows and scaled/readability captures.
- Phase 4G resume decision:
  - Task 5 and Task 6 may resume because pixel-level visual evidence is no longer blocked, but Task 6 UI polish must still ask the user which style/improvements they want before any polish plan or subjective styling changes.

## Phase 4G quit shortcut live verification — 2026-05-29

Task 5 attempted to reproduce the reported quit shortcut failures mode-by-mode before making any fix. The blocker did **not** reproduce in the tested live TUI paths:

- QA root: `/tmp/bluenote-tui-phase4g-quit-Jb5LMF`.
- Seed note: `Quit Probe` under `notes/inbox/quit-probe-2x7m9f.md`.
- Manager browse `q`:
  - Window: `BlueNote Phase 4G Quit QA q-manager`, id `2069271637`, active TUI PID `181204`.
  - Input: `q` via `computer-use-linux` targeted keypress.
  - Result: target window disappeared and the TUI process for that window ended.
- Manager browse `Ctrl+C`:
  - Window: `BlueNote Phase 4G Quit QA ctrlc-manager`, id `2069271638`, active TUI PID `182714`.
  - Input: `Ctrl+C` via targeted keypress.
  - Result: target window disappeared and the TUI process for that window ended.
- Clean editor `Ctrl+C`:
  - Window: `BlueNote Phase 4G Quit QA ctrlc-clean-editor`, id `2069271639`, active TUI PID `184059`.
  - Input: `Enter`, `Enter` to open note, then `Ctrl+C`.
  - Result: target window disappeared and the TUI process for that window ended.
- Dirty editor `Ctrl+C`:
  - Window: `BlueNote Phase 4G Quit QA ctrlc-dirty-editor`, id `2069271640`, active TUI PID `185631`.
  - Input: `Enter`, `Enter`, typed `dirty quit probe 20260529`, then `Ctrl+C`.
  - Result: target window disappeared and the TUI process for that window ended; disk readback showed the note body persisted as `dirty quit probe 20260529`.
- Search Everything `Ctrl+C`:
  - Window: `BlueNote Phase 4G Quit QA ctrlc-search`, id `2069271641`, active TUI PID `187332`.
  - Input: `Ctrl+P`, then `Ctrl+C`.
  - Result: target window disappeared and the TUI process for that window ended.
- Search Everything `Esc` then Manager `q`:
  - Window: `BlueNote Phase 4G Quit QA esc-search-then-q`, id `2069271642`, active TUI PID `188618`.
  - Input: `Ctrl+P`, `Esc`, then `q`.
  - Result: target window disappeared and the TUI process for that window ended.
- Automated coverage already exercises the routing contract for dirty manager quit, manager filter/create prompt `q`, Search `Esc`, and `Ctrl+C`/exit routing.
- Automated verification for Task 5 passed:
  - `bun test tests/unit/tui/render-routing.test.ts tests/unit/tui/workspace-controller.test.ts tests/integration/tui-workflow.test.ts`: 138 pass, 0 fail.
  - `bun run typecheck`: passed.
- Evidence caveat: the live checks used window presence/title and active process context to verify the target `bun run ./bin/bn.ts tui` process ended. The harness windows often disappeared or changed out of the original title after exit, so reusable shell prompt text was not captured separately for each mode. No lingering target TUI process was observed for the tested windows.
- No product-code root cause was proven in this session, so no quit-code fix was made.

## Phase 4G final automated regression — 2026-05-29

Task 6 objective automated regression ran after Tasks 3–5:

- `bun run typecheck`: passed (`tsc --noEmit`).
- `bun test`: passed, 445 pass / 0 fail across 49 files.
- `bun run smoke:opentui`: passed with marker `phase-4f-tui-cleanup-navigation-save-bugs; next: phase-4-next-hardening-subplan`.
- `bun run smoke:opentui:interactive`: expected environment failure because `tmux` is not installed. The script now reports the explicit actionable message: `tmux is required for interactive OpenTUI smoke tests. Install tmux or run the non-interactive smoke with bun run smoke:opentui`.
- `bun run smoke:cli`: passed.
- `git status --short --branch`: clean at the time of the check, branch `feat/opentui-implement` ahead of origin.

Subjective UI polish/rating was paused until the user chose the desired visual style and improvement direction.

## Phase 4G final multi-size visual acceptance — 2026-05-29

User-selected UI direction: **Modern dashboard** — stronger panels/sections, clearer hierarchy, more accent color, friendlier empty/status states.

Fresh QA root for final visual pass: `/tmp/bluenote-phase4g-final-visual-HgjD2C`.

Visual capture method:

- Real GNOME Terminal TUI windows launched with explicit `--geometry` and `--zoom`.
- Screenshots captured through focused-terminal `computer-use-linux` MCP bridge and decoded to PNG. These screenshot paths are ephemeral `/tmp` evidence; the durable record is this table and the inline observations.
- Capture bridge was visible in the screenshots but did not obstruct the important BlueNote content.

Captured evidence:

| State | Terminal setup | Screenshot | Rating vs Modern dashboard | Acceptance notes |
| --- | --- | --- | --- | --- |
| Manager, small | `--geometry=80x24 --zoom=1.0` | `/tmp/p4g-small-manager.png` | 6/10 | Functionally readable at small size. Two-pane layout is stable, focus row is obvious, shortcuts are visible. Visual hierarchy is still mostly raw terminal chrome: cyan borders dominate, topbar lacks dashboard-style grouping, right-pane rows truncate keys/titles aggressively, and empty space feels unstructured rather than intentionally dashboard-like. |
| Editor, scaled | `--geometry=100x30 --zoom=1.5` | `/tmp/p4g-zoom-editor.png` | 7/10 | Body readability is strong, line wrapping works, bottom status/shortcut chrome remains visible, green `Saved` state is clear, and the cyan cursor block is visible. Modern-dashboard gaps: title/path/updated metadata line is long and visually flat, body has little margin/section framing, and status/autosave information could use clearer card-like grouping. |
| Search Everything, large | `--geometry=120x40 --zoom=1.0` | `/tmp/p4g-large-search.png` | 6.5/10 | Input, result list, focused row, and preview are readable; the query cursor is visible and result count is clear. Dashboard gaps: preview is separated mostly by whitespace rather than a strong panel, selected row contrast is adequate but subdued, large-width layout underuses available space, and result metadata lines can become visually dense/truncated. |

Objective live acceptance status after Phase 4G fixes:

- Autosave: accepted from Task 3 live evidence; typed content persisted after debounce even when derived-index rebuild failed after the note write.
- Manual save/cursor-aware edit: accepted from Task 4 PTY and live evidence; text inserted at the intended cursor location and persisted without cursor glyph artifacts.
- Cursor: accepted; visible cyan cursor cell works at normal positions and at newline positions.
- Manager quit/global quit: accepted from Task 5 live evidence for Manager `q`, Manager `Ctrl+C`, clean Editor `Ctrl+C`, dirty Editor `Ctrl+C`, Search `Ctrl+C`, and Search `Esc` then Manager `q`.
- Terminal size/scale: accepted; GNOME Terminal `--geometry` and `--zoom` produce deterministic character-grid and pixel-size variations for future UI QA.
- Storage: accepted; note files remained plain Markdown and metadata remained in `.data/notes` during final visual QA setup.

Recommended future UI polish plan, not implemented in Phase 4G because it needs a new approved plan:

1. Add clearer dashboard-style panel hierarchy: topbar grouping, pane headers, and preview/editor/status sections should read as intentional dashboard regions rather than raw bordered boxes.
2. Tune color roles: keep cyan as an accent, but reduce border dominance and introduce distinct subdued surfaces, selected-row color, success/warning/error tokens, and secondary metadata color.
3. Improve truncation and responsive metadata: keys/paths/timestamps should shorten predictably with ellipses or secondary lines, especially in 80-column manager and editor topbar.
4. Make empty and status states friendlier: large blank panes should show calm hints or contextual summaries rather than empty rectangles.
5. Use large-width Search Everything space better: consider preview as a stronger side/bottom card with clearer section headers and less dense metadata.

No UI polish code changes were made in this pass; these recommendations should become a separate approved polish plan if pursued.

## Environment and preflight

### Desktop/tool readiness

- `mcp_computer_use_linux_doctor`: readiness passed after login:
  - `can_query_windows: true`
  - `can_focus_windows: true`
  - `can_send_development_input: true`
  - `blockers: []`
- `mcp_computer_use_linux_list_windows`: identified Ubuntu Terminal window `2069271615` and VS Code.
- Ubuntu Terminal input worked through `mcp_computer_use_linux_type_text` / `press_key`.
- Screenshot failed:
  - `GNOME Shell screenshot failed: GNOME Shell Screenshot call failed; XDG portal screenshot was denied or cancelled with response code 2`
- AT-SPI terminal extraction failed during `get_app_state`:
  - `failed to connect to AT-SPI bus`

### Automated preflight commands

Run from `/home/hainn/blue/code/bluenote-term`:

| Command | Result | Notes |
| --- | --- | --- |
| `git status --short --branch` | Pass | Branch `feat/opentui-implement`; untracked plan doc already present. |
| `bun run typecheck` | Pass | `tsc --noEmit` completed. |
| `bun test` | Pass | 437 pass, 0 fail. |
| `bun run smoke:opentui` | Pass | Phase marker `phase-4f-tui-cleanup-navigation-save-bugs`. |
| `bun run smoke:opentui:interactive` | Fail | Script requires `tmux`; environment has `/usr/bin/bash: tmux: command not found`; script throws `Failed to launch q route tmux TUI smoke session: null`. |
| `bun run smoke:cli` | Pass | CLI smoke check passed when run separately. |

Preflight cleanup:

- Killed stale `bun run ./bin/bn.ts tui` processes after testing.
- Initial manual-QA repo status showed only untracked plan/results docs and no source files modified by that initial QA pass. Later Phase 4G commits intentionally changed source/tests/docs for autosave and cursor fixes plus verification evidence.

## QA data set

Seeded eight plain Markdown notes with sidecars under `/tmp/bluenote-tui-manual-qa-iWRvsu`:

| Key | Path | Purpose |
| --- | --- | --- |
| `alpha` | `notes/inbox/alpha.md` | Save/autosave, find, `123` search. |
| `beta` | `notes/inbox/beta.md` | Permission/save error and switching. |
| `long-line` | `notes/projects/long-line.md` | Long-line wrapping/preview. |
| `unicode-emoji` | `notes/projects/unicode-emoji.md` | CJK, emoji, accents, combining characters. |
| `deep-note` | `notes/projects/nested/deep-note.md` | Nested browsing. |
| `empty` | `notes/empty.md` | Empty preview. |
| `alpha-summary` | `notes/similar/alpha-summary.md` | Similar-match switching. |
| `alpha-source` | `notes/similar/alpha-source.md` | Similar-match switching. |

Validation commands passed after seeding:

- `BLUENOTE_ROOT="$QA_ROOT" bun run ./bin/bn.ts rebuild` → `Rebuilt indexes for 8 note(s).`
- `bn list` showed all seeded notes.
- `bn search alpha` returned Alpha, Alpha Source, Alpha Summary, and Deep Note.

## Scenario results

| Scenario | Result | UX rating | Evidence |
| --- | --- | ---: | --- |
| A. Launch / first impression / quit | Partial pass | 3 | Ubuntu Terminal launch worked; `q` and `Ctrl+C` returned to shell. Screenshot/visual acceptance blocked. PTY evidence: `scenario-a-launch.txt`. |
| B. Manager browsing and preview | Pass with visual caveat | 3 | Folder entry/back, note/folder previews, long/empty/nested previews captured. Evidence: `scenario-b-*.txt`. |
| C. Manager filtering | Pass | 3 | `/` filter, `alpha` results, arrow navigation, filtered open, no-result state, `Esc`, and `q` worked. Evidence: `scenario-c-*.txt`; `filter q exit: 0`. |
| D. Editor visual contract | Partial pass | 3 | No outer editor border/body title seen in text capture; status rows present; wrap toggles worked. **Issue:** top bar says `Updated unknown`. Evidence: `scenario-d-*.txt`. |
| E. Basic typing, autosave, manual save, disk truth | Pass | 4 | Autosave and `Ctrl+S` saved to disk; reopened note showed both lines; no frontmatter. Evidence: `critical-scenarios-output.txt`, `scenario-e-*.txt`. |
| F. Editor input edge cases | Partial pass | 3 | Unicode/CJK/emoji/accent text persisted correctly to disk; Backspace smoke persisted `ab`. Visual Unicode display is inconclusive due PTY capture limitations. Evidence: `unicode-supplement-output.txt`, `scenario-f2-*.txt`. |
| G. Editor find mode | Partial pass | 3 | `Ctrl+F`, typed query, `Esc` back to editor, subsequent typing/save worked in fallback route. Evidence: `scenario-g-*.txt`. Needs real user-eye confirmation of match highlighting/count. |
| H. Critical lockup: edit then switch notes | Pass | 4 | Edited `alpha-summary`, switched to `alpha-source`, then `beta`, saved, returned to Manager, `q` exited. Evidence: `scenario-h-*.txt`; `proc after q: 0`. |
| I. Search Everything | Pass with visual caveat | 3 | `Ctrl+P`, `alpha` search, arrows, `/` command list, `/save` command result, `Esc`, quit route worked. Evidence: `scenario-i-*.txt`. Visual pane border artifacts are likely harness limitations. |
| J. Create/delete prompts | Pass with caveat | 3 | `n` prompt appears, empty title validates as `Title required`, valid note opens editor, delete prompt cancel/confirm works when a note row is focused. Evidence: `scenario-j-output.txt`, `scenario-j2-output.txt`, `scenario-j3-delete-quit-output.txt`. Root-level `d` on focused folder calmly says folders cannot be deleted. |
| K. Responsive sizes | Partial pass, historically superseded for core size/scale QA | 2–3 initial text-capture rating | Initial 160x48, 90x28, 72x24, 60x20, 40x15 text captures did not crash and `Ctrl+C` exited, but real visual acceptance was blocked. Phase 4G later added pixel evidence for representative 80x24, 100x30 zoomed, and 120x40 windows; see final multi-size visual acceptance above. |
| L. Permission/save error | Pass | 4 | Read-only parent directory produced visible `Autosave failed Unsaved`; disk remained unchanged; after restoring permissions, `Ctrl+S` saved and status returned to `Saved`; quit worked. Evidence: `scenario-l-*.txt`. |
| M. Restart/persistence/cleanup | Pass | 4 | CLI list/search/show agree with disk; restart shows persisted Alpha edits; files contain only expected notes and `.data` artifacts. Evidence: `scenario-m-*.txt`, broad output file list. |

## Detailed findings

### TUI-MANUAL-001 — Editor top bar shows `Updated unknown` for notes with valid sidecar timestamps

- Scenario: D, E, H, M
- Terminal size: fallback PTY 120x36
- Input sequence: open any seeded note in editor.
- Expected: editor top bar includes note name, full path, and latest updated time.
- Actual: every editor capture shows `| Updated unknown`, e.g. `Alpha | notes/inbox/alpha.md | Updated unknown`.
- Severity: Medium
- UX rating: 3
- Reproducibility: Always in this run
- Disk evidence: sidecars were generated with `createdAt` and `updatedAt`; rebuild/list/search worked.
- Screenshot/pane capture:
  - `/tmp/bluenote-qa-evidence/scenario-e-alpha-open.txt`
  - `/tmp/bluenote-qa-evidence/scenario-h-beta-open.txt`
  - `/tmp/bluenote-qa-evidence/scenario-m-restart-alpha.txt`
- Notes: This is not data-loss, but it violates the approved editor chrome contract and makes recency metadata untrustworthy.

### TUI-MANUAL-002 — Required interactive smoke verification fails because `tmux` is missing

- Scenario: Preflight
- Terminal size: non-interactive shell
- Input sequence: `bun run smoke:opentui:interactive`
- Expected: required verification smoke passes or reports actionable setup.
- Actual: script fails at `tmux new-session`; environment output: `/usr/bin/bash: line 3: tmux: command not found`; Bun error says `Failed to launch q route tmux TUI smoke session: null`.
- Severity: Medium (test infrastructure / verification blocker)
- UX rating: N/A
- Reproducibility: Always in this environment
- Disk evidence: none
- Screenshot/pane capture: terminal preflight output in session log
- Notes: Either document/install `tmux` as a required dev dependency, make the smoke script skip with a clear dependency error, or replace it with a dependency-light PTY harness.

### TUI-MANUAL-003 — Historical initial blocker: desktop visual QA could not capture real screenshots despite computer-use readiness

- Scenario: A, all visual scenarios in the initial 2026-05-28 pass
- Terminal size: Ubuntu Terminal window `814x577` pixels at test time
- Input sequence: `mcp_computer_use_linux_screenshot`, then `get_app_state(... include_screenshot=true ...)`.
- Expected: terminal-cropped screenshots and/or AT-SPI state are available for visual review.
- Actual at that time:
  - screenshot failed with portal denied/cancel response;
  - AT-SPI extraction failed with `failed to connect to AT-SPI bus`.
- Severity: Medium (test execution blocker, not BlueNote product bug)
- UX rating: N/A
- Reproducibility: Always in that run after login
- Disk evidence: none
- Screenshot/pane capture: no screenshot available; evidence in MCP tool outputs.
- Notes: This initially blocked reliable color/style/positioning acceptance from an AI/user-perspective workflow, even though window focus and keyboard input worked. It is superseded for Phase 4G representative cases by the focused-terminal screenshot bridge and final multi-size visual acceptance section above.

### TUI-MANUAL-004 — Unicode visual rendering remains unaccepted; disk persistence is correct

- Scenario: F
- Terminal size: fallback PTY 120x36
- Input sequence: open `unicode-emoji.md`, insert `测试中文输入 🙂🚀 café naïve résumé []{}()_*~\`"'`, save.
- Expected: Unicode and combining characters remain readable on screen and persist unchanged.
- Actual:
  - disk file is correct and plain Markdown;
  - fallback text capture shows corrupted wide-character layout in preview/editor, but the harness is not Unicode-width aware and may be the cause.
- Severity: Medium visual-risk until verified in a real screenshot/user-eye pass
- UX rating: 2–3, inconclusive
- Reproducibility: Always in fallback capture; not confirmed in real terminal screenshot
- Disk evidence:
  - `/tmp/bluenote-tui-manual-qa-iWRvsu/notes/projects/unicode-emoji.md`
  - line 8: `测试中文输入 🙂🚀 café naïve résumé []{}()_*~\`"'`
- Screenshot/pane capture:
  - `/tmp/bluenote-qa-evidence/unicode-supplement-output.txt`
  - `/tmp/bluenote-qa-evidence/scenario-f2-unicode-after-save.txt`
- Notes: Do not mark this as a product bug until a real terminal screenshot confirms it. Do keep it on the visual QA backlog.

## Disk-truth evidence highlights

Autosave/manual save:

```text
notes/inbox/alpha.md:7:Manual QA autosave alpha pty-1
notes/inbox/alpha.md:8:Manual QA ctrl-s alpha pty-1
frontmatter starts: False
```

Critical switch/save:

```text
notes/similar/alpha-summary.md:5:Manual QA switch summary pty-1
notes/inbox/beta.md:7:Manual QA beta pty-1
frontmatter starts: False
```

Permission failure and retry:

```text
Readonly autosave: status = Autosave failed Unsaved; disk did not contain token.
After restore + Ctrl+S: status = Saved; disk contains token.
notes/inbox/beta.md:8:Manual QA permission failure pty-1
```

Unicode persistence:

```text
notes/projects/unicode-emoji.md:8:测试中文输入 🙂🚀 café naïve résumé []{}()_*~`"'
notes/projects/unicode-emoji.md:10:ab
frontmatter starts: False
```

Restart/cleanup:

```text
.data/manifest.json
.data/metadata.sqlite
.data/notes/*.json
.data/search-index.json
notes/**/*.md
```

No unexpected recovery-copy workflow was observed.

## Initial manual-QA UX score summary

These 1–4 scores are historical ratings from the initial text/fallback-capture manual QA pass. The later Phase 4G final visual section uses separate 1–10 ratings for representative Modern-dashboard pixel captures.

| Area | Score | Rationale |
| --- | ---: | --- |
| Manager readability | 3 | Text layout was understandable in initial captures; later representative pixel capture rated small Manager 6/10 for Modern-dashboard fit. |
| Manager focus clarity | 3 | Keyboard routing worked; later pixel capture showed focus row is obvious, while modern-dashboard hierarchy still needs polish. |
| Editor readability | 3 | Content/status rows were readable in text captures; later zoomed editor pixel capture rated 7/10 and confirmed body readability/cursor visibility. |
| Editor save feedback | 4 | `Unsaved`, `Saved`, and `Autosave failed Unsaved` states were visible and matched disk truth. |
| Search Everything readability | 3 | Initial fallback capture showed clear structure but artifacts; later real Search Everything pixel evidence rated 6.5/10 for the `visual` query path. |
| Responsive layout | 2–3 | Initial text captures showed no crashes; later representative 80x24, 100x30 zoomed, and 120x40 pixel captures accepted core size/scale behavior, with smaller extremes still future targeted QA if needed. |
| Error clarity | 4 | Permission failure was honest and recoverable. |
| Keyboard reliability | 4 | Critical navigation/quit paths worked after save, delete, and permission-error recovery. |

## Prioritized backlog

### Blocker functional fixes

None confirmed in this run for Scenarios A/E/H/L/M. The previously reported save/quit/switch lockups did not reproduce under the tested sequences.

### High workflow fixes

None confirmed as product defects. Keep the critical lockup sequence in regression coverage because it was user-reported and high risk.

### Medium fixes / visual-contract mismatches

1. Fix editor timestamp plumbing so the top bar shows the note's latest updated/modified time instead of `Updated unknown` when metadata exists.
2. Complete targeted real-screenshot passes for remaining gaps not covered by Phase 4G representative captures: Unicode/wide-character rendering, smaller responsive extremes such as 72x24/60x20/40x15, and any future color/positioning changes.
3. Make `bun run smoke:opentui:interactive` dependency handling actionable (`tmux` install doc/check) or replace with a portable PTY smoke path.

### Responsive/readability polish

1. Re-rate 72x24, 60x20, and 40x15 with real screenshots if those extreme sizes become acceptance targets; Phase 4G representative size/scale evidence covers 80x24, 100x30 zoomed, and 120x40.
2. For future Search Everything polish changes, re-confirm preview border/card treatment and shortcut row in a real terminal screenshot; Phase 4G has representative evidence for the current `visual` query path.
3. Confirm Manager selected/focused row color and whether root folder preview makes initial focus obvious when a new Modern-dashboard polish plan changes visual hierarchy.

### Test coverage gaps

1. Add/keep regression for editor timestamp display when sidecar `updatedAt` exists.
2. Add an automated permission-failure path that makes the note parent directory non-writable, asserts `Autosave failed Unsaved`, restores write permission, then asserts retry success.
3. Add a mixed note-switch regression mirroring Scenario H: edit/save summary note → switch source → switch beta → save → `q` and `Ctrl+C` exit.
4. Add TUI create/delete prompt regression for: empty title validation, valid create opens editor, cancel delete, confirm delete removes file and sidecar.
5. Add a visual/manual checklist item requiring real screenshot evidence before accepting color/positioning changes.

## Recommended follow-up implementation plan outline

Do not implement without approval. Suggested next plan:

1. **Timestamp contract fix**
   - RED: renderer/controller test opens a note with valid sidecar `updatedAt` and expects non-unknown top-bar updated label.
   - GREEN: plumb existing metadata timestamp to editor view model/runtime render.
   - VERIFY: targeted TUI view-model/render tests plus `bun run typecheck`, `bun test`.
2. **Interactive smoke dependency hardening**
   - RED: simulate missing `tmux` and expect clear actionable error or skip.
   - GREEN: dependency precheck or PTY fallback.
   - VERIFY: `bun run smoke:opentui:interactive` in an environment with dependency satisfied, and missing-dependency unit/smoke test.
3. **Permission failure regression**
   - RED: TUI controller/integration test for read-only note parent save failure and retry.
   - GREEN: ensure current behavior is locked by tests.
   - VERIFY: targeted TUI workflow tests and full suite.
4. **Create/delete prompt regression**
   - RED/GREEN coverage for Scenario J behavior.
   - VERIFY: note file + sidecar deletion on confirm, cancellation leaves both intact.
5. **Manual screenshot unblock — completed for Phase 4G representative cases**
   - Historical action: fix or document `computer-use-linux` screenshot/AT-SPI issue separately from product code.
   - Phase 4G result: focused-terminal screenshot bridge documented above; representative Manager/Editor/Search pixel captures completed across multiple sizes/scales. Unicode/wide-character-specific visual QA remains a targeted future pass if needed.

## Completion status

Initial manual QA plan execution produced a prioritized backlog; later Phase 4G work resolved the confirmed autosave/cursor blockers, verified quit behavior did not reproduce in tested paths, unblocked representative pixel capture through the focused-terminal bridge, and completed final automated regression. Phase 4G is visually accepted for the recorded Manager/Editor/Search representative size/scale cases, with future polish recommendations captured above for a separate approved Modern-dashboard plan. Unicode/wide-character-specific visual acceptance and broader style polish remain future targeted work rather than blockers for this Phase 4G closure.
