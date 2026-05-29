export type TuiColorIntent =
  | "background"
  | "surfacePanel"
  | "surfacePanelRaised"
  | "borderSubtle"
  | "borderFocus"
  | "textPrimary"
  | "textSecondary"
  | "textMuted"
  | "statusSuccess"
  | "statusWarning"
  | "statusDanger"
  | "statusInfo"
  | "panel"
  | "focusedRow"
  | "activeItem"
  | "mutedText"
  | "danger"
  | "success"
  | "warning"
  | "info"
  | "primaryAccent"
  | "secondaryAccent"

export const tuiTheme: Record<TuiColorIntent, `#${string}`> = {
  background: "#000000",
  surfacePanel: "#111827",
  surfacePanelRaised: "#162033",
  borderSubtle: "#334155",
  borderFocus: "#38bdf8",
  textPrimary: "#f8fafc",
  textSecondary: "#cbd5e1",
  textMuted: "#94a3b8",
  statusSuccess: "#22c55e",
  statusWarning: "#f59e0b",
  statusDanger: "#ef4444",
  statusInfo: "#60a5fa",
  panel: "#111827",
  focusedRow: "#1e3a8a",
  activeItem: "#0e7490",
  mutedText: "#94a3b8",
  danger: "#ef4444",
  success: "#22c55e",
  warning: "#f59e0b",
  info: "#60a5fa",
  primaryAccent: "#38bdf8",
  secondaryAccent: "#22d3ee",
}
