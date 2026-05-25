export type TuiBootstrapStatus = "missing-root" | "ready"

export interface TuiBootstrapInfo {
  appName: "BlueNote"
  status: TuiBootstrapStatus
  rootPath: string
  nextPhase: "phase-3-tui-shell"
}
