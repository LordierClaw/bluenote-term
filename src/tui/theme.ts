export type TuiColorIntent =
  | "background"
  | "panel"
  | "focusedRow"
  | "activeItem"
  | "mutedText"
  | "danger"
  | "success"
  | "warning"
  | "primaryAccent"
  | "secondaryAccent"

export const tuiTheme: Record<TuiColorIntent, `#${string}`> = {
  background: "#0f172a",
  panel: "#111827",
  focusedRow: "#1e3a8a",
  activeItem: "#0e7490",
  mutedText: "#94a3b8",
  danger: "#ef4444",
  success: "#22c55e",
  warning: "#f97316",
  primaryAccent: "#38bdf8",
  secondaryAccent: "#22d3ee",
}
