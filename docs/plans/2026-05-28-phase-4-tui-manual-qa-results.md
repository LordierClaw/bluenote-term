# Phase 4 TUI Manual QA Results

**Date:** 2026-05-28
**Plan:** `docs/plans/2026-05-28-phase-4-tui-manual-qa-plan.md`
**QA root:** `/tmp/bluenote-tui-manual-qa-iWRvsu` (session-local / ephemeral)
**Evidence directory:** `/tmp/bluenote-qa-evidence/` (session-local / ephemeral)
**Scope:** Manual/interactive QA only. No product code fixes were made.

The `/tmp` paths above were not committed and may not survive outside the QA session. This results document therefore keeps the durable record inline: command outcomes, scenario pass/fail ratings, key status text, disk-truth snippets, and the unresolved screenshot retry/visual-acceptance caveat are summarized below for future readers.

## Executive summary

Critical save/navigation/quit flows are **functionally better than the reported failure state** in this run: autosave and `Ctrl+S` wrote real Markdown files, `Esc` returned to Manager after saves, switching from edited notes to other notes worked, permission failures were visible and recoverable, and `q`/`Ctrl+C` quit in the tested critical paths.

However, this QA pass should **not be treated as full visual acceptance** yet because the Ubuntu desktop screenshot/accessibility route was partially blocked:

- `computer-use-linux doctor` reports ready and window targeting works.
- Window focus/input through GNOME Terminal works.
- Screenshot capture failed with portal denial/cancel response.
- `get_app_state` against GNOME Terminal failed AT-SPI extraction: `failed to connect to AT-SPI bus`.
- The fallback PTY harness captured text layouts and raw ANSI, but it is not a trustworthy color/Unicode visual oracle because it does not fully emulate terminal device responses or wide-cell rendering.

Primary product findings from this run:

1. **Medium:** Editor top bar consistently shows `Updated unknown` even though sidecars have timestamps; this violates the Phase 4F editor metadata contract.
2. **Medium / test-infra:** The required `bun run smoke:opentui:interactive` preflight fails because `tmux` is not installed in this environment.
3. **Medium / visual-risk:** Unicode/CJK/emoji UI display could not be conclusively accepted. Disk persistence is correct, but fallback text capture displayed corrupted wide-character layout because of harness limitations; this requires a real screenshot/user-eye pass.
4. **Low / visual-risk:** Search Everything and prompt captures show occasional fallback-harness artifacts (`[1 q`, replacement chars around box borders). These are likely PTY capture limitations, but they also mean a real terminal visual pass is still required before accepting color/styling/positioning.

### Continuation note — 2026-05-28

The user approved proceeding from the manual QA plan into hardening. A fresh `computer-use-linux` screenshot retry against Ubuntu Terminal window `2069271615` still failed with GNOME Shell / XDG portal denial, so screenshot-based visual acceptance remains open. Product code should focus first on confirmed UI contract drift and regression coverage, while visual acceptance is retried after screenshot tooling is unblocked.

### Task 7 continuation note — 2026-05-29

Retried real visual capture for Task 7 before making any UI/code changes. `computer-use-linux doctor` still reported no blockers and `list_windows` found the Ubuntu Terminal window `2069271615` at `/home/hainn/blue/code/bluenote-term`, but a targeted screenshot retry against that window still failed: `GNOME Shell screenshot failed: GNOME Shell Screenshot call failed; XDG portal screenshot was denied or cancelled with response code 2`. Because no real screenshot evidence was available, visual scenarios A/B/D/F/I/K were not re-rated and no speculative color/layout/product-code changes were made.

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
  - Functional live verification can still use `computer-use-linux` targeted keyboard input plus disk/process readback; do not claim visual screenshot acceptance until screenshot/recording evidence is available.

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
  - This confirms the live TUI can persist autosave content under a derived-index rebuild failure after the fix. Screenshot/status visual confirmation remains blocked by GNOME/XDG portal denial, so visual status text was not claimed.

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
- Final repo status still only shows untracked plan/results docs; no source files were modified by QA.

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
| K. Responsive sizes | Partial pass | 2–3 | 160x48, 90x28, 72x24, 60x20, 40x15 text captures did not crash and `Ctrl+C` exited. Real visual acceptance of clipping/colors remains blocked. Evidence: `scenario-k-*.txt`. |
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

### TUI-MANUAL-003 — Desktop visual QA could not capture real screenshots despite computer-use readiness

- Scenario: A, all visual scenarios
- Terminal size: Ubuntu Terminal window `814x577` pixels at test time
- Input sequence: `mcp_computer_use_linux_screenshot`, then `get_app_state(... include_screenshot=true ...)`.
- Expected: terminal-cropped screenshots and/or AT-SPI state are available for visual review.
- Actual:
  - screenshot failed with portal denied/cancel response;
  - AT-SPI extraction failed with `failed to connect to AT-SPI bus`.
- Severity: Medium (test execution blocker, not BlueNote product bug)
- UX rating: N/A
- Reproducibility: Always in this run after login
- Disk evidence: none
- Screenshot/pane capture: no screenshot available; evidence in MCP tool outputs.
- Notes: This blocks reliable color/style/positioning acceptance from an AI/user-perspective workflow. Window focus and keyboard input did work.

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

## UX score summary

| Area | Score | Rationale |
| --- | ---: | --- |
| Manager readability | 3 | Text layout is understandable in captures; real color/focus review blocked. |
| Manager focus clarity | 3 | Keyboard routing works, but focus highlight cannot be judged without color/screenshot. |
| Editor readability | 3 | Content/status rows readable in text captures; top-bar timestamp says unknown. |
| Editor save feedback | 4 | `Unsaved`, `Saved`, and `Autosave failed Unsaved` states are visible and match disk truth. |
| Search Everything readability | 3 | Results/preview structure is clear; fallback capture artifacts prevent final visual approval. |
| Responsive layout | 2–3 | No crashes at tested sizes; real clipping/color acceptance still needed. |
| Error clarity | 4 | Permission failure was honest and recoverable. |
| Keyboard reliability | 4 | Critical navigation/quit paths worked after save, delete, and permission-error recovery. |

## Prioritized backlog

### Blocker functional fixes

None confirmed in this run for Scenarios A/E/H/L/M. The previously reported save/quit/switch lockups did not reproduce under the tested sequences.

### High workflow fixes

None confirmed as product defects. Keep the critical lockup sequence in regression coverage because it was user-reported and high risk.

### Medium fixes / visual-contract mismatches

1. Fix editor timestamp plumbing so the top bar shows the note's latest updated/modified time instead of `Updated unknown` when metadata exists.
2. Complete a real screenshot-based visual pass once desktop capture is working; specifically verify focus colors, highlight contrast, Unicode/wide-character rendering, Search Everything pane borders, and responsive clipping.
3. Make `bun run smoke:opentui:interactive` dependency handling actionable (`tmux` install doc/check) or replace with a portable PTY smoke path.

### Responsive/readability polish

1. Re-rate 72x24, 60x20, and 40x15 with screenshots; current text captures show no crash but do not prove good UX.
2. Confirm Search Everything preview border and shortcut row in a real terminal; fallback capture showed artifacts that are likely harness/device-response limitations.
3. Confirm Manager selected/focused row color and whether root folder preview makes initial focus obvious.

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
5. **Manual screenshot unblock**
   - Fix or document `computer-use-linux` screenshot/AT-SPI issue separately from product code.
   - Re-run visual scenarios A/B/D/I/K/F with real terminal screenshots before final UI acceptance.

## Completion status

Manual QA plan execution is complete enough to produce a prioritized backlog. Visual/color acceptance remains blocked by desktop capture, so Phase 4 UI design should **not** be declared visually accepted yet. Functional critical blockers around save, switching, permission-error recovery, and quit were not reproduced in this run.
