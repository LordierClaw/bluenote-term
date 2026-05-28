# Phase 4 — Search, Editing, and Recovery Hardening

## Goal

Harden the day-to-day workflows after the Phase 3 TUI workspace is usable while keeping notes plain Markdown.

## Primary outcomes

- canonical BlueNote metadata sidecars under `.data/notes/`, with legacy `.state/` used only as safe migration input
- rebuildable derived artifacts under `.data/`, including `.data/metadata.sqlite` and `.data/search-index.json`
- contains-style search semantics across `bn search`, Manager filtering, Search Everything, and slash-command discovery; query `123` only matches actual fields or content containing `123`
- deeper Search Everything UX polish across CLI and TUI through Phase 4D work after the delivered 4C Manager refinement
- scratch/today/template flows
- autosave and crash recovery beyond the initial Phase 3 dirty-state save path
- external editor support and safe write flows where still useful beside inline editing
- archive/history behavior hardening

Phase 4A covers the `.data` migration and contains-search foundation. Phase 4B delivers the accepted editor input/cursor/responsive-chrome work. Phase 4C Manager performance/responsive layout/style is accepted and delivered: the Manager now keeps minimal Manager chrome around the current folder path, focused item/hovered path, compact action hints, cached/avoidable preview work, preview auto-hide on narrow terminals, and a manual preview toggle. After 4C, Phase 4D is next for Search Everything readability/responsiveness and responsive preview behavior.
