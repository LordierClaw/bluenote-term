# Phase 4H TUI Redesign Visual Acceptance Results

**Date:** 2026-05-29
**Plan:** `docs/plans/2026-05-29-phase-4h-tui-redesign-implementation.md`
**Task:** Task 7 — Responsive and Unicode visual acceptance
**QA root:** `/tmp/bluenote-phase4h-visual-IRtgsN` *(ephemeral)*
**Evidence:** `/tmp/p4h-*.png`, `/tmp/p4h-crops/*.png`, `/tmp/p4h-contact-sheet.png` *(ephemeral; durable observations recorded here)*

## Summary

Phase 4H visual acceptance is **accepted with minor follow-up notes**. The redesigned TUI is substantially more readable and user-oriented than the earlier unstable Phase 4 subplans:

- Manager, Editor, Search Everything, and prompt/task-sheet states are visually coherent under the Quiet Blue Dashboard direction.
- Focus state is clear across manager rows, editor cursor, prompt inputs, and search rows.
- Color roles are mostly disciplined: cyan is used as active/key accent, muted blue-gray is used for secondary metadata, green is used for saved/available, red/yellow are used for destructive/risk command tags.
- Responsive fit works at the representative required terminal sizes: `80x24`, `100x30`, `100x30 --zoom=1.5`, and `120x40`.
- Unicode editor display is visually accepted in a real terminal screenshot for CJK, emoji, accents, and a combining-character sample.
- No blocker or high-severity visual defect was found during this pass.

Minor follow-up notes remain around dense metadata/truncation and prompt/result panel polish, but they do not block Phase 4H acceptance.

## Automated verification baseline

The full Task 7 verification was run before screenshot capture after the Task 6 adapter-test alignment:

| Command | Result |
| --- | --- |
| `bun run typecheck` | Pass |
| `bun test` | Pass — 455 pass / 0 fail |
| `bun run smoke:opentui` | Pass |
| `bun run smoke:opentui:interactive` | Pass |
| `env -u BLUENOTE_ROOT bun run smoke:cli` | Pass |
| `git diff --check` | Pass |

## Visual capture method

Direct `mcp_computer_use_linux_screenshot(window_id=...)` is still denied by GNOME/XDG portal in this desktop session:

```text
GNOME Shell Screenshot call failed; XDG portal screenshot was denied or cancelled with response code 2
```

`computer-use-linux doctor` reported readiness with no blockers, including window query, focus, and targeted input. Pixel evidence was captured using the documented focused GNOME Terminal screenshot bridge:

```bash
python3 /home/hainn/.hermes/skills/computer-use-linux/scripts/focused_mcp_screenshot.py <out.png>
```

The bridge captures full desktop PNGs; for review, each image was cropped to the target TUI window and combined into `/tmp/p4h-contact-sheet.png`.

## Seed data

Fresh disposable root: `/tmp/bluenote-phase4h-visual-IRtgsN`.

Seeded plain Markdown notes:

| Note | Purpose |
| --- | --- |
| `Daily Dashboard` | Manager list, ordinary editor content |
| `Client Launch Brief` | Search result, preview, editor saved/dirty/find scenarios |
| `Unicode Café 测试 🙂` | CJK/emoji/accent/combining-character visual acceptance |

Indexes were rebuilt successfully before visual QA.

## Screenshot matrix and ratings

Ratings are from a user perspective against `docs/product/design-language.md` — focus clarity, hierarchy, color-role discipline, metadata/content balance, shortcut noise, responsive fit, and Unicode correctness where applicable.

| State | Terminal setup | Screenshot | Crop | Rating | Acceptance notes |
| --- | --- | --- | --- | ---: | --- |
| Manager root/home | `80x24 --zoom=1.0` | `/tmp/p4h-manager-small.png` | `/tmp/p4h-crops/manager-small.png` | 8/10 | Intended root/home state is visible. Focus on `inbox` is obvious, two-pane structure remains readable at small size, footer shortcuts are compact, and Unicode note title is readable in preview. Minor: footer is tight near the bottom edge and right preview truncates long text aggressively, but this is acceptable for 80 columns. |
| Manager inbox/preview | `120x40 --zoom=1.0` | `/tmp/p4h-manager-large-inbox.png` | `/tmp/p4h-crops/manager-large-inbox.png` | 8/10 | Intended inbox state with note preview is visible. Three-column information balance is good: list, key/path metadata, and preview body are understandable. Focus is clear. Minor: right preview metadata is still dense and can feel code-like rather than fully dashboard-like. |
| Create task sheet | `100x30 --zoom=1.0` | `/tmp/p4h-create-sheet.png` | `/tmp/p4h-crops/create-sheet.png` | 7/10 | Create prompt/task-sheet appears as an anchored task area with `New note` framing and focused title input. It is recoverable and not visually noisy. Minor: because it is bottom-anchored inside the manager chrome, it reads more like a command panel than a centered modal; acceptable for the current task-sheet design. |
| Delete task sheet | `100x30 --zoom=1.0` | `/tmp/p4h-delete-sheet.png` | `/tmp/p4h-crops/delete-sheet.png` | 8/10 | Delete prompt is visible and semantically dangerous with red framing/action. It clearly asks for confirmation and does not imply accidental Enter-to-delete. Minor: preview behind the destructive prompt remains visually active, but danger color makes the task state clear. |
| Editor saved | `100x30 --zoom=1.5` | `/tmp/p4h-editor-saved.png` | `/tmp/p4h-crops/editor-saved.png` | 8/10 | Zoomed editor is readable. Title/path/updated metadata and calm body area work well, cyan cursor is visible, and body text remains clean with no surrounding clutter. Minor: top metadata truncates at high zoom, but content remains understandable. |
| Editor dirty/typing | `100x30 --zoom=1.0` | `/tmp/p4h-editor-dirty.png` | `/tmp/p4h-crops/editor-dirty.png` | 8/10 | Dirty editing state is visually clear; newly typed line appears in the body and the cursor is visible at the insertion point. The editor remains calm and easy to read. Minor: topbar metadata is long and can dominate the top row. |
| Editor find mode | `100x30 --zoom=1.0` | `/tmp/p4h-editor-find.png` | `/tmp/p4h-crops/editor-find.png` | 8/10 | Find mode appears as a focused task sheet. Query, match count, and find-specific actions are readable; body remains visible below. Focus shift from body to find input is clear. Minor: task-sheet border and body content compete slightly because both use strong horizontal cyan lines. |
| Search empty | `100x30 --zoom=1.0` | `/tmp/p4h-search-empty.png` | `/tmp/p4h-crops/search-empty.png` | 8/10 | Empty search state is useful and calm: query is visible, result count is honest, examples/recent actions/commands give next-step help. No impossible Enter action is shown. Minor: preview area is mostly empty and could be friendlier in a future polish pass. |
| Search results | `120x40 --zoom=1.0` | `/tmp/p4h-search-results.png` | `/tmp/p4h-crops/search-results.png` | 7.5/10 | Result list and preview are readable at large size; focused row is clear and the preview starts to use extra space. Minor: large-width layout still leaves dense metadata and a lot of empty area; a future polish pass could make preview sections more card-like. |
| Search slash commands | `100x30 --zoom=1.0` | `/tmp/p4h-search-slash.png` | `/tmp/p4h-crops/search-slash.png` | 8/10 | Slash-command list is readable and semantically tagged. Unavailable, destructive, maintenance, note, and folder labels are visibly differentiated. Minor: command rows are dense, especially with long descriptions truncated in the same row. |
| Unicode editor | `100x30 --zoom=1.0` | `/tmp/p4h-unicode-editor-2.png` | `/tmp/p4h-crops/unicode-editor-2.png` | 8/10 | Recaptured state shows the actual Unicode note editor. CJK title/body text, emoji, accents, `Ångström`, and combining-character sample are readable. The cursor cell is visible on its own line. Wide-character alignment is acceptable in the real terminal screenshot. Minor: the top path truncates the emoji/title tail, but body rendering is correct and readable. |

## Confirmed non-blockers / follow-up notes

1. **Dense metadata/truncation:** Editor and preview top metadata can be long, especially at high zoom or narrow widths. It remains readable enough for Phase 4H, but future polish could shorten path/timestamp display more intentionally.
2. **Panel polish:** Search preview and prompt/task-sheet panels are functional and clear, but could become more obviously dashboard/card-like in a future style-only pass.
3. **Bridge artifacts:** Some full-desktop screenshots include overlapping GNOME Terminal windows or the focused screenshot bridge. Cropped evidence isolates the target TUI. This is a capture-method artifact, not a BlueNote defect.
4. **Initial Unicode attempt:** The first Unicode screenshot attempt stayed in Search Everything because CJK query input through targeted keyboard input was unreliable in that route. The final Unicode acceptance used manager navigation and successfully opened the Unicode note.

## Acceptance decision

Phase 4H Task 7 is accepted:

- Required screenshot matrix was captured with real pixel evidence.
- Representative responsive sizes and zoom scale were verified.
- Unicode/wide-character rendering is accepted in the editor.
- No blocker or high-severity visual bug was found.
- Any remaining issues are polish/backlog items, not Phase 4H blockers.

## Suggested future polish backlog

These should require a new approved plan before implementation:

1. Add smarter topbar truncation for editor path/timestamp metadata.
2. Improve Search Everything large-width preview usage with stronger card/section grouping.
3. Consider making bottom task sheets visually more distinct from the underlying manager dashboard while keeping them lightweight.
4. Re-test the CJK text-input path in Search Everything if direct non-Latin search entry becomes a formal acceptance target; editor display itself is accepted.
