# Phase 4 TUI Manual QA and UX Acceptance Plan

> **For tester:** Test as a real BlueNote user first, not as an implementer. Use keyboard-only flows in an actual terminal, capture screenshots/pane text, inspect disk state after saves, and rate whether each visible component is usable, readable, and aligned with the approved Phase 4F UI contract.

**Status:** Approved and executed; follow-up hardening plan created from results.

**Goal:** Manually verify the full BlueNote TUI after Phase 4 subplans because recent work introduced unstable behavior: save failures, inability to quit or navigate, broken interactions, and UI design/styling/positioning drift.

**Scope:** Manual QA only. Do not implement fixes while executing this plan. Bugs found here should be recorded with reproduction steps, screenshots/pane captures, disk evidence, severity, and recommended follow-up tasks.

**Primary risks:**

- Editor typing shows `Unsaved` then `Autosave failed`.
- Manual save appears to succeed but does not update the Markdown file.
- After editing a note, Manager navigation/open/back/quit shortcuts stop working.
- Filter mode traps keys or opens the wrong note.
- Search Everything preview/results are unreadable or mis-positioned.
- UI does not meet the requested visual contract: color use, borders, top/bottom bars, spacing, positioning, highlights, responsive behavior.

---

## 1. Canonical references and acceptance contracts

Use these files as the product contract while testing:

- `docs/plans/2026-05-28-phase-4f-tui-cleanup-navigation-save-bugs-implementation.md`
- `docs/plans/2026-05-28-phase-4e-autosave-atomicity-design.md`
- `docs/phases/phase-4-search-editing-and-recovery.md`
- `README.md`, especially the TUI section

### 1.1 Storage contract

Must remain true throughout all manual tests:

- Note files are plain Markdown.
- No frontmatter is added by TUI editing.
- BlueNote metadata stays in `.data/notes/` sidecars.
- Autosave and manual save write directly to the actual Markdown note file through the safe note-body write path.
- Failed saves keep the editor buffer dirty, show visible failure, and retry later.
- No recovery-copy workflow is created by Phase 4E/4F.

### 1.2 Manager UI contract

Expected Manager behavior:

- Top left: exactly `BlueNote`.
- Top right: `x items | <app status>`.
- Filtered top right count: `x items (filtered) | <app status>`.
- Bottom bar: only the currently opened note full path; empty/calm placeholder when no note is open.
- Row highlight: only the hovered/focused row has background highlight.
- Currently opened note is not highlighted merely because it is open.
- No leading whitespace, open marker, or confusing row prefix before item text.
- Colors are restrained and readable; meaningful focus/status colors only.

Expected Manager keys:

- `Arrow Up` / `Arrow Down`: move focus.
- `Enter` / `Arrow Right`: open selected item/note.
- `Arrow Left` / `Esc`: go back where applicable.
- filter mode supports printable query, arrows, open, clear/back.
- `Ctrl+P`: Search Everything.
- `q` / `Ctrl+C`: quit reliably.

### 1.3 Editor UI contract

Expected Editor behavior:

- No outer full-screen editor border.
- No inner body title such as `Editor body · Line x, Col y`.
- No custom cursor glyph (`|` or `▌`) injected into note body text.
- Top bar: `Note Name | full-path/file-name.md | latest_updated_time`.
  - note name/path left aligned.
  - full path muted/gray.
  - updated time right aligned when width allows.
- Bottom bar row 1: `Line x, Col y                  Wrap word: Enabled                  Unsaved/Saving/Saved`.
  - wrap enabled: green.
  - wrap disabled: red.
  - unsaved: red.
  - saving: orange.
  - saved: green.
  - real error may also surface `Autosave failed`, but it must not hide the buffer state.
- Bottom bar row 2: shortcut list only.

Expected Editor keys:

- Normal character input, Unicode, punctuation, and paste-like text insertion work.
- `Enter`, `Backspace`, `Delete`, arrow movement, Home/End where supported, and multiline editing work.
- `Ctrl+S`: manual save.
- `Ctrl+F`: find mode.
- `Alt+Z`: wrap toggle.
- `Ctrl+P`: Search Everything.
- `Esc`: Manager.
- `Ctrl+C`: quit reliably.

---

## 2. Test environment and tools

### 2.1 Required tools and launch discipline

Use both terminal evidence and visual/user-perspective inspection:

- Use the Ubuntu default Terminal app for the primary manual UI session.
- In that terminal, `cd` to the project repository before launching or testing commands:
  ```bash
  cd /home/hainn/blue/code/bluenote-term
  ```
- Launch BlueNote through the repo command path, not a globally installed binary:
  ```bash
  BLUENOTE_ROOT="$QA_ROOT" bun run ./bin/bn.ts tui
  ```
- Run CLI setup/check commands through `bun run ./bin/bn.ts ...` from the project directory.
- Terminal/TMUX may still be used for reproducible scripted evidence, but the user-perspective visual pass must use the Ubuntu default Terminal.
- `/computer-use-linux` should target the Ubuntu default Terminal window for screenshots and visual review when available.
- Plain file inspection after save flows.
- `git status` before and after testing to ensure the QA run does not accidentally modify repo source files.

### 2.2 Preflight commands

Run from the project repo root in Ubuntu default Terminal:

```bash
cd /home/hainn/blue/code/bluenote-term
git status --short --branch
bun run typecheck
bun test
bun run smoke:opentui
bun run smoke:opentui:interactive
bun run smoke:cli
```

Record:

- command output,
- failures/timeouts,
- whether failures are pre-existing or caused by manual-test setup,
- stale `bun run ./bin/bn.ts tui` or `tmux` processes if any.

### 2.3 Desktop/computer-use readiness

If using `/computer-use-linux`, start with:

```text
mcp_computer_use_linux_doctor
mcp_computer_use_linux_list_windows
```

Acceptance:

- screenshots are possible,
- target terminal window can be identified by title/window id,
- tester can capture both full-screen and terminal-cropped screenshots,
- no blind coordinate actions unless accessibility/semantic targeting is unavailable.

---

## 3. Dedicated manual QA data set

Create a fresh temporary BlueNote root for manual testing. Do not use personal notes.

Recommended root and launch pattern:

```bash
cd /home/hainn/blue/code/bluenote-term
QA_ROOT="$(mktemp -d -t bluenote-tui-manual-qa-XXXXXX)"
BLUENOTE_ROOT="$QA_ROOT" bun run ./bin/bn.ts init
```

For every CLI/TUI command in this manual QA pass, stay in the project directory and pass the temporary managed root through `BLUENOTE_ROOT`:

```bash
cd /home/hainn/blue/code/bluenote-term
BLUENOTE_ROOT="$QA_ROOT" bun run ./bin/bn.ts <command>
BLUENOTE_ROOT="$QA_ROOT" bun run ./bin/bn.ts tui
```

Do not launch a globally installed `bn`, and do not run the primary visual pass from inside `$QA_ROOT`. The UI session should be the Ubuntu default Terminal running from `/home/hainn/blue/code/bluenote-term` with `BLUENOTE_ROOT="$QA_ROOT"` set.

### 3.1 Seed notes

Create notes that exercise sorting, filtering, Unicode, long lines, deep paths, and save edge cases:

1. `notes/inbox/alpha.md`
   - title/content includes `alpha`, `quick brown fox`, `123`, and several short lines.
2. `notes/inbox/beta.md`
   - content includes `beta`, `meeting`, checkboxes, punctuation, and `1234`.
3. `notes/projects/long-line.md`
   - includes one very long line over 180 columns.
4. `notes/projects/unicode-emoji.md`
   - includes CJK text, emoji, accents, and combining characters.
5. `notes/projects/nested/deep-note.md`
   - verifies nested folder browsing/preview paths.
6. `notes/empty.md`
   - empty or nearly empty note.
7. `notes/similar/alpha-summary.md`
   - similar name/content to test filtered selection and ambiguity.
8. `notes/similar/alpha-source.md`
   - similar name/content to test switching between close matches.

After seeding, run:

```bash
BLUENOTE_ROOT="$QA_ROOT" bun run ./bin/bn.ts rebuild
BLUENOTE_ROOT="$QA_ROOT" bun run ./bin/bn.ts list
BLUENOTE_ROOT="$QA_ROOT" bun run ./bin/bn.ts search alpha
```

Record actual keys/paths for later verification.

---

## 4. Evidence format for every manual finding

For each scenario below, record one row in a QA log:

```markdown
### Finding ID: TUI-MANUAL-###

- Scenario:
- Terminal size:
- Input sequence:
- Expected:
- Actual:
- Severity: Blocker | High | Medium | Low | Polish
- UX rating: 1 unusable / 2 confusing / 3 acceptable / 4 good / 5 excellent
- Reproducibility: Always | Often | Sometimes | Once
- Disk evidence:
- Screenshot/pane capture:
- Notes:
```

Severity definitions:

- **Blocker:** data loss, cannot save, cannot quit, cannot navigate, crash, terminal left unusable.
- **High:** important TUI workflow broken but workaround exists.
- **Medium:** edge case or secondary workflow broken.
- **Low:** minor mismatch, transient visual issue, unclear copy.
- **Polish:** styling/readability improvement only.

UX rating definitions:

- **1:** user cannot complete the task or cannot see what happened.
- **2:** task possible but confusing/error-prone.
- **3:** functional and understandable, but rough.
- **4:** clear, comfortable, visually aligned.
- **5:** excellent terminal-native experience.

---

## 5. Manual test scenarios

### Scenario A: Launch, first impression, and quit safety

Purpose: verify the app starts cleanly, UI is legible, and quit is always possible.

Steps:

1. Open a real terminal at a comfortable size, e.g. `120x36`.
2. Launch `BLUENOTE_ROOT="$QA_ROOT" bun run ./bin/bn.ts tui` from `/home/hainn/blue/code/bluenote-term` in Ubuntu default Terminal.
3. Observe initial Manager without pressing keys for 5 seconds.
4. Capture screenshot/pane text.
5. Press `q`.
6. Relaunch.
7. Press `Ctrl+C`.
8. Relaunch.
9. Press `Esc`, then `q`.

Expected:

- Manager renders without overlapping bars or blank unusable state.
- Top/bottom bars match Manager UI contract.
- Initial focus is obvious.
- App exits on `q` and `Ctrl+C` without requiring multiple attempts.
- Terminal shell prompt returns cleanly; no orphaned raw-mode keyboard behavior.

User-perspective checks:

- Can I immediately tell this is BlueNote?
- Can I tell where focus is?
- Are colors readable on the current terminal theme?
- Are top/bottom bars too noisy?
- Is quit discoverable and reliable?

### Scenario B: Manager browsing and preview

Purpose: verify normal browsing, paths, highlighting, and preview readability.

Steps:

1. Launch TUI at `120x36`.
2. Move through all visible rows with `Arrow Down` and `Arrow Up`.
3. Enter folders with `Enter` or `Arrow Right`.
4. Go back with `Arrow Left` and `Esc`.
5. Hover every seeded note and folder.
6. Toggle preview with the documented preview shortcut if visible, e.g. `Alt+P`.
7. Capture screenshots for root folder, nested folder, note preview, folder preview, preview hidden.

Expected:

- Focus never disappears.
- Only hovered row has background highlight.
- Open-note highlight does not appear unless that row is also focused.
- No leading whitespace/prefix clutter before row labels.
- Preview content is readable and does not overlap rows or bars.
- Full/nested paths are understandable and not misleading.
- Bottom bar only shows opened note full path, not focused/hovered path.

Edge checks:

- Empty note preview.
- Very long line preview.
- Unicode/emoji preview.
- Nested path preview.
- Movement at first and last row.

### Scenario C: Manager filtering navigation

Purpose: verify filter mode is usable and does not trap input.

Steps:

1. Launch TUI.
2. Activate Manager filter using the visible shortcut.
3. Type `alpha`.
4. Verify top right count changes to `x items (filtered) | <status>`.
5. Use `Arrow Down` and `Arrow Up` inside filtered results.
6. Press `Enter` on `alpha-summary.md`.
7. Return to Manager with `Esc`.
8. Repeat filter `alpha`, select `alpha-source.md`, press `Arrow Right`.
9. Return to Manager.
10. Type a query with no results, e.g. `zzzz-no-match`.
11. Test `Arrow Up`, `Arrow Down`, `Enter`, `Arrow Left`, `Esc`, `q`, and `Ctrl+C` from no-result state.
12. Repeat with query `123` and verify contains-style semantics.

Expected:

- Printable keys update query only while in filter input.
- Arrows navigate filtered rows, not the filter text cursor unless that is explicitly the designed behavior.
- `Enter`/`Arrow Right` opens the focused filtered note.
- `Arrow Left` clears filter and returns to browse mode.
- `Esc` leaves filter mode without trapping the app.
- No-result state is clear and non-crashing.
- `q`/`Ctrl+C` still quit.

User-perspective checks:

- Is it obvious that the list is filtered?
- Is selected filtered row visually obvious?
- Does the count help or confuse?
- Does keyboard behavior match common terminal file manager expectations?

### Scenario D: Open editor and visual contract

Purpose: verify Editor layout, colors, positioning, and text visibility before editing.

Steps:

1. Open `alpha.md` from Manager.
2. Capture screenshot.
3. Inspect top bar, editor body, bottom row 1, bottom row 2.
4. Move cursor with arrows, Home/End if supported, and page/vertical movement if supported.
5. Toggle wrap with `Alt+Z` twice.
6. Capture wrap enabled/disabled screenshots.

Expected:

- No outer editor border.
- No `Editor body · Line x, Col y` title.
- Top bar shows note name, muted path, and latest update time.
- Bottom row 1 shows line/col, wrap status, and save status in requested colors.
- Bottom row 2 contains shortcut list only.
- No custom cursor glyph is inserted into the text.
- Cursor movement updates line/column accurately.
- Wrap enabled/disabled color is clearly green/red without overwhelming the UI.

User-perspective checks:

- Is the editing area easy to see?
- Are status labels readable and not noisy?
- Is full path useful without stealing focus from content?
- Does layout still look intentional after wrap toggles?

### Scenario E: Basic typing, autosave, manual save, and disk truth

Purpose: verify the save path using actual Markdown files, not only UI status.

Steps:

1. Open `alpha.md`.
2. Append a unique line: `Manual QA autosave alpha <timestamp>`.
3. Immediately observe save status: should become `Unsaved` or `Saving`.
4. Wait at least 2 seconds.
5. Observe save status: should become `Saved`, with no `Autosave failed`.
6. Without quitting, inspect the note file from a second terminal:
   ```bash
   grep -n "Manual QA autosave alpha" "$QA_ROOT/notes/inbox/alpha.md"
   ```
7. Type another unique line: `Manual QA ctrl-s alpha <timestamp>`.
8. Press `Ctrl+S`.
9. Wait until status stabilizes.
10. Inspect disk again.
11. Return to Manager with `Esc`.
12. Reopen `alpha.md` and verify both lines are visible.

Expected:

- UI status transitions are understandable.
- No normal typing flow shows `Autosave failed`.
- Markdown file contains typed text after autosave.
- Markdown file contains typed text after manual save.
- Reopened editor shows persisted content.
- Note file remains plain Markdown with no frontmatter.

Failure probes:

- If status says `Saved` but disk does not change, mark Blocker.
- If disk changes but status says `Autosave failed`, mark High.
- If typed content disappears after reopening, mark Blocker.
- If `Esc`, `q`, or `Ctrl+C` stops working after save failure, mark Blocker.

### Scenario F: Editor input edge cases

Purpose: verify input correctness and cursor/buffer stability.

Steps:

1. Open `unicode-emoji.md`.
2. Insert text containing:
   - CJK: `测试中文输入`
   - emoji: `🙂🚀`
   - accents: `café naïve résumé`
   - punctuation: `[]{}()_*~\`"'`
3. Insert multiline text with blank lines.
4. Use Backspace at:
   - middle of line,
   - start of line,
   - after emoji/CJK,
   - empty line.
5. Use Delete at:
   - middle of line,
   - end of line,
   - before emoji/CJK.
6. Move cursor across Unicode text and check line/column behavior.
7. Save/autosave and inspect disk.

Expected:

- No character corruption.
- No cursor/body desynchronization.
- No custom cursor glyph saved to disk.
- Backspace/Delete do not delete unexpected adjacent characters.
- Disk file contains expected Unicode and plain text.

### Scenario G: Editor find mode

Purpose: verify find mode does not trap editor/global shortcuts.

Steps:

1. Open a note containing repeated `alpha`.
2. Press `Ctrl+F`.
3. Type `alpha`.
4. Navigate matches using documented keys if shown.
5. Try a no-match query.
6. Press `Esc` to return to editor body.
7. Type normal text.
8. Press `Ctrl+S`.
9. Press `Esc` to Manager.
10. Relaunch and verify no saved corruption from find query.

Expected:

- Find input is visually distinct from editor body.
- Match count is accurate and readable.
- No-match state is clear.
- `Esc` leaves find mode, then later leaves editor to Manager.
- Find query is not accidentally inserted into note body.
- Save and quit still work after find mode.

### Scenario H: The critical lockup reproduction — edit then switch notes

Purpose: reproduce or disprove the user-reported bug: after editing current note, opening another note and quit/back actions stop working.

Steps:

1. Launch TUI.
2. Open `alpha-summary.md`.
3. Type a unique line.
4. Wait for autosave to settle.
5. Press `Esc` to Manager.
6. Move to `alpha-source.md`.
7. Press `Enter`.
8. Verify editor opens `alpha-source.md`, not the previous note.
9. Press `Esc` to Manager.
10. Move to `beta.md`.
11. Press `Arrow Right`.
12. Verify editor opens `beta.md`.
13. Type and save in `beta.md`.
14. Press `Esc`, then `q`.
15. Relaunch and repeat using `Ctrl+C` instead of `q`.
16. Repeat while autosave is still `Unsaved`/`Saving` by switching quickly before the debounce completes.

Expected:

- After editing and save success, Manager navigation works normally.
- Reopening the same note is not the only working action.
- `Enter`, `Arrow Right`, `Esc`, `q`, and `Ctrl+C` remain routed.
- If switching is intentionally blocked while dirty/saving/error, the UI gives clear status and does not trap the user.
- No lockup occurs.

Severity:

- Any inability to leave editor, open another note, or quit is Blocker.
- Any silent refusal to switch notes without visible explanation is High.

### Scenario I: Search Everything user workflow

Purpose: verify global search/command screen readability and interaction.

Steps:

1. From Manager, press `Ctrl+P`.
2. Type `alpha`.
3. Move through results with arrows.
4. Verify note/content/folder/command result types are visually distinguishable.
5. Open a note result with `Enter`.
6. Return to Manager.
7. Press `Ctrl+P`; type `/`.
8. Check commands such as `/new`, `/archive`, `/delete`, `/rebuild`, `/migrate`, `/find`, `/replace`, `/save`.
9. Select an unavailable/unwired command if present and verify calm status, not crash.
10. Search `123` and verify contains-style results.
11. Search a no-result query.
12. Toggle preview with `Alt+P` if available.
13. Test `Esc`, `q`, `Ctrl+C` from Search Everything.

Expected:

- Search input is readable and focused.
- Selected and unselected typed results remain readable.
- Preview sections are separated and do not overlap.
- Responsive preview behavior works at narrow widths.
- Command availability/unavailability is clear.
- No crashes or trapped modes.

### Scenario J: Create/delete/archive prompts if visible from TUI

Purpose: verify mutation prompts do not corrupt state or trap input. Only run if these actions are exposed in current TUI shortcuts/search commands.

Steps:

1. Invoke create note flow if available.
2. Submit empty input, invalid nested path, existing path, and valid path.
3. Verify created note appears and disk/sidecar are correct.
4. Invoke archive/delete prompt on a disposable note if available.
5. Cancel with `Esc`.
6. Reinvoke and confirm only if safe/disposable.
7. Rebuild/search/list from CLI after mutation.

Expected:

- Prompts are visible, positioned correctly, and do not hide critical context.
- Invalid input gives clear status.
- Cancel returns to previous mode.
- Confirmed mutations update Manager and disk consistently.
- No accidental deletion/archive from navigation keys.

If TUI mutation commands are not wired, record that clearly and do not mark as a bug unless docs claim they are wired.

### Scenario K: Responsive layout and terminal resizing

Purpose: verify UI positioning, clipping, and readability across realistic sizes.

Run Scenarios A–I partially at these sizes:

- `160x48` wide desktop terminal.
- `120x36` normal.
- `90x28` medium.
- `72x24` narrow threshold.
- `60x20` very narrow.
- `40x15` extremely constrained.

For each size:

1. Capture Manager screenshot.
2. Capture Editor screenshot.
3. Capture Search Everything screenshot.
4. Test at least one navigation action and one quit action.

Expected:

- No overlapping top/bottom bars.
- No unreadable selected text due foreground/background color conflict.
- Preview hides or compresses intentionally at narrow widths.
- Shortcut row truncates gracefully.
- Essential actions remain visible or still work.
- App remains responsive after live resize.

UX rating focus:

- Is this size usable for real note work?
- Is text clipped in a misleading way?
- Are components positioned consistently?

### Scenario L: Error and permission behavior

Purpose: verify save failures are honest, recoverable, and do not lock the UI.

Use only disposable QA root.

Steps:

1. Open `beta.md` in editor.
2. From second terminal, make the file or parent directory read-only if safe:
   ```bash
   chmod a-w "$QA_ROOT/notes/inbox/beta.md"
   ```
3. Type a unique line.
4. Wait for autosave.
5. Observe error state.
6. Try `Ctrl+S`.
7. Try `Esc`, Manager navigation, Search Everything, `q`, and `Ctrl+C`.
8. Restore write permission:
   ```bash
   chmod u+w "$QA_ROOT/notes/inbox/beta.md"
   ```
9. Press `Ctrl+S` or type again to trigger retry.
10. Verify disk eventually contains the line.

Expected:

- Save failure is visible and calm.
- Buffer remains dirty/in memory.
- File on disk remains at last saved version while unwritable.
- App does not trap navigation/quit.
- Retry succeeds after permission restoration.

Mark Blocker if failure causes data loss, permanent lockup, or prevents quit.

### Scenario M: Restart, persistence, and cleanup

Purpose: verify data remains correct after closing/reopening.

Steps:

1. Complete several edits across multiple notes.
2. Quit normally.
3. Run CLI checks:
   ```bash
   BLUENOTE_ROOT="$QA_ROOT" bun run ./bin/bn.ts list
   BLUENOTE_ROOT="$QA_ROOT" bun run ./bin/bn.ts search "Manual QA"
   BLUENOTE_ROOT="$QA_ROOT" bun run ./bin/bn.ts show <selector-for-edited-note>
   ```
4. Inspect files directly.
5. Relaunch TUI.
6. Open edited notes and verify content/status.
7. Check for stale temp/recovery artifacts:
   ```bash
   find "$QA_ROOT" -maxdepth 5 -type f | sort
   ```

Expected:

- All saved content persists.
- CLI and TUI agree.
- No frontmatter inserted.
- No unexpected recovery files.
- Only expected `.data/` internal artifacts are present.

---

## 6. Visual QA rubric

For every Manager, Editor, and Search Everything screenshot, rate these from 1–5:

| Area | Questions |
| --- | --- |
| Readability | Can a user read focused/unfocused text without strain? |
| Focus clarity | Is current focus unmistakable? |
| Color discipline | Are colors meaningful, restrained, and accessible? |
| Layout stability | Do bars, panels, prompts, and body content avoid overlap? |
| Information hierarchy | Are primary task/content and secondary metadata visually balanced? |
| Keyboard discoverability | Are visible shortcuts enough to know what to try next? |
| Error clarity | Are failures visible without being noisy or hiding recovery options? |
| Edge handling | Do no-results, empty notes, long lines, Unicode, and narrow widths look intentional? |

Overall acceptance target:

- No Blocker or High severity functional bugs.
- Average UX rating at least 4 for Manager and Editor at `120x36` and `90x28`.
- No component rated below 3 at `72x24` unless explicitly documented as out-of-scope.
- No red/green/orange status color misuse.
- No hidden data-loss risk.

---

## 7. Manual QA execution order

Run in this order to isolate blockers early:

1. Preflight automated checks.
2. Scenario A: launch/quit safety.
3. Scenario E: basic autosave/manual save disk truth.
4. Scenario H: edit then switch notes lockup reproduction.
5. Scenario B: Manager browsing/preview.
6. Scenario C: Manager filtering.
7. Scenario D: Editor visual contract.
8. Scenario F: editor input edge cases.
9. Scenario G: find mode.
10. Scenario I: Search Everything.
11. Scenario K: responsive sizes.
12. Scenario L: permission/save error behavior.
13. Scenario M: restart/persistence/cleanup.
14. Optional Scenario J only if current TUI exposes create/delete/archive workflows.

Stop rule:

- If a Blocker appears in Scenarios A, E, or H, stop broad exploratory testing.
- Record full evidence, then write a focused bug-fix implementation plan before coding.
- Do not continue polishing UI while save/quit/navigation blockers remain unresolved.

---

## 8. Deliverables from manual QA

Produce these artifacts after executing the plan:

1. `docs/plans/2026-05-28-phase-4-tui-manual-qa-results.md`
   - scenario pass/fail table,
   - all findings,
   - UX score summary,
   - screenshot/pane capture links or file paths,
   - disk evidence snippets.
2. A prioritized bug backlog grouped by:
   - Blocker functional fixes,
   - High workflow fixes,
   - UI contract mismatches,
   - responsive/readability polish,
   - test coverage gaps.
3. A follow-up implementation plan for the first bug-fix batch before any code changes.

---

## 9. Completion criteria

Manual QA is complete when:

- Every required scenario has a pass/fail result or explicit blocked reason.
- Every failure has reproduction steps and severity.
- Save-related scenarios include direct disk evidence.
- UI/design scenarios include screenshot or pane capture evidence.
- Quit/navigation lockup scenarios include exact key sequence.
- Results are reviewed against the Phase 4F contract.
- No code fixes have been made without a new approved implementation plan.
