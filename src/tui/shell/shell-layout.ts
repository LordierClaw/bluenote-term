export interface ShellLayoutViewModel {
  sidebar: string
  main: string
  statusBar: string
}

export function renderShellLayout(view: ShellLayoutViewModel): string {
  return [
    "=== SIDEBAR ===",
    view.sidebar,
    "",
    "=== MAIN ===",
    view.main,
    "",
    "=== STATUS ===",
    view.statusBar,
  ].join("\n")
}
