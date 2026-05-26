export type TuiColorIntent =
  | "background"
  | "panel"
  | "focusedRow"
  | "selectedOpenNote"
  | "mutedText"
  | "success"
  | "warning"
  | "danger"
  | "primaryAccent"
  | "secondaryAccent"

export const tuiTheme: Record<TuiColorIntent, `#${string}`> = {
  background: "#0f172a",
  panel: "#111827",
  focusedRow: "#1e3a8a",
  selectedOpenNote: "#0e7490",
  mutedText: "#94a3b8",
  success: "#22c55e",
  warning: "#f59e0b",
  danger: "#ef4444",
  primaryAccent: "#38bdf8",
  secondaryAccent: "#a78bfa",
}

export interface TuiIntentStyle {
  foreground?: string
  background?: string
}

export function styleForIntent(intent: TuiColorIntent): TuiIntentStyle {
  if (intent === "background" || intent === "panel" || intent === "focusedRow" || intent === "selectedOpenNote") {
    return { background: tuiTheme[intent] }
  }

  return { foreground: tuiTheme[intent] }
}
