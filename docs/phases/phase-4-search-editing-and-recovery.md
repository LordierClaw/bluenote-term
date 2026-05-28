# Phase 4 — Search, Editing, and Recovery Hardening

## Goal

Harden the day-to-day workflows after the Phase 3 TUI workspace is usable while keeping notes plain Markdown.

## Primary outcomes

- canonical BlueNote metadata sidecars under `.data/notes/`, with legacy `.state/` used only as safe migration input
- rebuildable derived artifacts under `.data/`, including `.data/metadata.sqlite` and `.data/search-index.json`
- contains-style search semantics across `bn search`, Manager filtering, Search Everything, and slash-command discovery; query `123` only matches actual fields or content containing `123`
- delivered Phase 4D Search Everything readability/responsive preview behavior: contains-style semantics, readable typed results, separated preview sections, responsive preview auto-hide, manual `Alt+P` preview toggle, and safe unavailable command status
- scratch/today/template flows remain future hardening and are not yet planned in an approved subplan
- autosave and crash recovery beyond the initial Phase 3 dirty-state save path remain future hardening and are not yet planned in an approved subplan
- external editor support and safe write flows where still useful beside inline editing
- archive/history behavior hardening remains future hardening and is not yet planned in an approved subplan

Phase 4A covers the `.data` migration and contains-search foundation. Phase 4B delivers the accepted editor input/cursor/responsive-chrome work. Phase 4C Manager performance/responsive layout/style is accepted and delivered: the Manager now keeps minimal Manager chrome around the current folder path, focused item/hovered path, compact action hints, cached/avoidable preview work, preview auto-hide on narrow terminals, and a manual preview toggle. Phase 4D Search Everything readability/responsive preview is accepted and delivered: Search Everything uses contains-style matching, readable typed results, separated preview sections, responsive preview auto-hide, a manual `Alt+P` preview toggle, and safe unavailable command status for unwired commands. The current neutral follow-up marker is `phase-4-next-hardening-subplan`; 4E/scratch/autosave/archive hardening is not yet planned in an approved subplan.
