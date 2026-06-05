# BlueNote Design Language

BlueNote’s UI follows **Quiet Blue Dashboard**: a terminal-native design language for a local-first note workspace. It should feel calm while writing, structured while browsing, fast while searching, and explicit when an action is risky.

This document is canonical for Manager, Editor, Search Everything, prompts, status, and responsive TUI behavior. Future UI work should conform to this language unless a later approved design document changes it.

## Product personality

- **Local and trustworthy:** the UI should feel like it is operating directly on the user’s local notes.
- **Calm for writing:** editing should reduce chrome and keep the note body visually dominant.
- **Structured for browsing:** Manager and Search should feel like dashboards made from clear panels/cards, not debug boxes.
- **Explicit for risk:** destructive or failed states must be unmistakable and name the target/consequence.
- **Terminal-native, not noisy-retro:** use monospace alignment, subtle line art, keycaps, and restrained color.

## Principles

1. **Writing first.** The Editor body is the quietest surface. Chrome recedes once a note is open.
2. **Dashboard when browsing.** Manager and Search use meaningful regions: list, preview, command/action areas, status.
3. **One accent at a time.** Cyan/blue marks the active or focused control only. Non-focused surfaces are subtle.
4. **Semantic status.** Saved, saving, dirty, failed, destructive, warning, disabled, and info states have distinct labels and color roles.
5. **Progressive chrome.** Show richer hints on dashboards and empty states; collapse to prioritized hints while typing or on narrow screens.
6. **Titles over metadata.** Titles and note content dominate. Keys, paths, timestamps, and counts are muted and predictably truncated.
7. **Task sheets for prompts.** Create, filter, find, and delete use consistent prompt sheets with purpose, context/target, input, and grouped actions.
8. **Responsive by intent.** Small terminals simplify hierarchy. Large terminals add useful context, not empty bordered space.

## Color roles

Render code should choose colors by semantic role, not by raw hue.

| Role | Suggested value | Use |
| --- | --- | --- |
| `bg.app` | `#0b1020` / current `#0f172a` | Application background. |
| `bg.panel` | `#111827` | Default panel/card surface. |
| `bg.panelRaised` | `#162033` | Active task sheet, active preview header, or raised input. |
| `bg.selected` | restrained `#1d4ed8` | Selected list row only. |
| `border.subtle` | `#334155` | Passive panel borders/dividers. |
| `border.focus` | `#38bdf8` | Current focused region/input only. |
| `text.primary` | `#f8fafc` | Note body, titles, primary labels. |
| `text.secondary` | `#cbd5e1` | Descriptions and secondary labels. |
| `text.muted` | `#94a3b8` | Paths, timestamps, disabled metadata. |
| `accent.blue` | `#38bdf8` | Brand/focus highlight, active input caret/border. |
| `accent.cyan` | `#22d3ee` | Secondary hints; not default structural borders. |
| `status.success` | `#22c55e` | Saved, available, complete. |
| `status.warning` | `#f59e0b` | Unsaved, pending save, saving, caution. |
| `status.danger` | `#ef4444` | Delete, failed save, irreversible action. |
| `status.info` | `#60a5fa` | Neutral info, search count, command availability. |

Rules:

- Only one visible region gets `border.focus` at a time.
- Passive panels use `border.subtle`, dividers, or whitespace; avoid stacking cyan rectangles.
- Shortcut hints use muted text; keycaps may use accent.
- Destructive actions always use danger label + danger primary action.
- Pending/dirty is warning; failed is danger.

## Surfaces and borders

### App shell

- Topbar: one row, no heavy border, app/section title left, compact context/status right.
- Bottombar: muted, prioritized key/action hints; no cyan border.
- The app should not look like nested debug boxes.

### Panels/cards

- Manager/Search content regions are cards or panels with subtle borders/dividers.
- Active panel may use one focus cue: focused border, left rule, or selected row — not all at once.
- Empty panel space must be purposeful: empty-state copy, suggested actions, recent notes, or writing margin.

### Rows

- Selected rows use restrained blue background plus a `›` marker or left accent.
- Row hierarchy: title primary, description/snippet secondary, key/path/date muted.
- Avoid repeated loud category labels like `[command]`; prefer compact tags such as `cmd`, `note`, `folder`, `danger`, `disabled`.

## Text hierarchy

1. **Screen title:** `BlueNote`, `Search Everything`, current note title.
2. **Panel title:** `Inbox`, `Preview`, `Commands`, `Results`.
3. **Primary row label:** note title or command name.
4. **Secondary row text:** description, folder, result excerpt.
5. **Metadata:** key, path, timestamp, counts.
6. **Shortcut hints:** `[Key] action`, muted overall.

Text rules:

- Display title before key/path everywhere.
- Humanize timestamps; editor updated-time chrome uses local short `dd/MM/YYYY HH:mm` with 24-hour time.
- Use raw ISO timestamps only in detailed/debug contexts, not primary chrome.
- Paths truncate in the middle; titles truncate at the end.
- Root/home copy should orient the user in plain language.

## Spacing and density

- Base spacing unit: one terminal cell.
- Editor gets 2-column writing margins on normal/wide terminals, 1-column on narrow terminals.
- Manager/Search rows are one line by default; selected row may expand on wide screens.
- Topbar + bottombar should not exceed three rows in writing mode unless find/error is active.
- Large dashboards should add useful sections or richer previews instead of large blank bordered rectangles.

## Prompt/task sheet model

Create/filter/find/delete prompts are task sheets, not extra footers.

Example create sheet:

```text
New note
Create in: notes/inbox
Title: Project plan draft_

[Enter] Create    [Esc] Cancel
```

Example delete sheet:

```text
Delete note?
Visual polish notes
notes/inbox/visual-polish.md

Deletes the Markdown file and BlueNote sidecar metadata.
This cannot be undone.

[y] Delete    [Esc] Cancel
```

Rules:

- Create shows destination and input purpose.
- Delete shows target, consequence, danger styling, and a safe cancel path.
- Find shows query, current/total matches, next/previous hints, and close hint.
- Key hints use keycap styling: `[Enter] Create`, not raw `Enter create`.

## Focus, status, and severity

### Focus

- Focus uses one primary cue per screen/region.
- Inactive panels are visibly secondary.
- Active input uses raised surface + focus border/cursor.
- Selected row uses selected background + marker.

### Status labels

| State | Label | Color role |
| --- | --- | --- |
| Clean | `Saved` | success |
| User typed/debounce pending | `Unsaved` / `Pending save` | warning |
| Save in flight | `Saving…` | warning/info |
| Save failed | `Autosave failed` | danger |
| Search idle | `Type to search` | muted/info |
| Destructive confirm | `Delete` / `Danger` | danger |
| Disabled command | `Unavailable` | muted |

## Responsive rules

### Width

- `<72 cols`: single-pane Manager; hide preview first and show `Preview hidden · p show` if recoverable.
- `72–99 cols`: standard two-pane layout with shortened metadata.
- `>=100 cols`: add column labels, richer preview metadata, recent/quick-action cards, and more hints.

### Height

- `<24 rows`: prioritize current task; hide preview/detail and secondary shortcuts.
- `24–32 rows`: standard layout.
- `>32 rows`: add useful context or more preview content, not blank bordered space.

### Mode-specific

- Editor at high zoom/low height: keep chrome calm; preserve save/autosave state, right-aligned highlighted `Wrap on` / `Wrap off`, and compact essential shortcuts only.
- Search empty: show examples, recent notes, and command suggestions.
- Manager root: show a home/dashboard state instead of only raw folders.

## Screen contracts

### Manager

- Manager is a dashboard and browser.
- Note rows are title-first; key/path/date are muted.
- Root/home explains where the user is and suggests next actions.
- Preview is a structured card: folder previews show item lists, while note previews emphasize title and content excerpt without metadata rows.
- Footer shows prioritized actions: `[Enter] Open`, `[/] Filter`, `[n] New`, `[Ctrl+P] Search`, `[Esc] Back`.

### Editor

- Editor is the calmest screen.
- Keep the borderless writing surface.
- Add intentional margins.
- Topbar: title primary; path/time/status compact and secondary.
- Save state transitions must be visible and unambiguous.
- While typing, shortcut chrome is minimized.

### Search Everything

- Search is the command/search hub.
- Empty state teaches examples and recent actions.
- Results distinguish notes, folders, commands, destructive commands, and unavailable commands.
- Query matches should be highlighted when feasible.
- Preview uses structured fields such as `Usage`, `Shortcut`, `Path`, `Match`, `Risk`.
- `Esc manager` becomes `[Esc] Manager` hint, not raw title copy.

## Current known violations to fix

- Cyan/accent overuse across passive borders.
- Box-first hierarchy instead of semantic grouping.
- Shortcut chrome too prominent and equally weighted.
- Create/delete prompts read like footers instead of task sheets.
- Delete lacks enough danger treatment, target, and consequence copy.
- Keys/paths/timestamps compete with titles and body.
- Long raw timestamps in primary editor chrome.
- Large Manager/Search screens underuse space.
- Root/home and Search empty states lack onboarding.
- Slash command rows are dense; risky/unavailable commands are not distinct enough.
- Responsive behavior squeezes before it simplifies.

## Acceptance checklist

A BlueNote TUI change satisfies the design language when:

- only one element appears focused at a glance;
- cyan is visible but not everywhere;
- Editor feels calmer than Manager/Search;
- Manager/Search large screens look intentionally populated or intentionally calm;
- prompts have purpose, context/target, input, and primary/secondary actions;
- delete is unmistakably destructive and names the target/consequence;
- titles/body dominate and metadata is muted;
- shortcuts are helpful but not louder than content;
- small terminals simplify layout;
- large terminals add context;
- Unicode/wide-character screenshots remain readable after visual changes.
