export interface TuiBootstrapInfo {
  appName: string
  status: string
  nextPhase: string
}

export function getTuiBootstrapInfo(): TuiBootstrapInfo {
  return {
    appName: "BlueNote",
    status: "scaffold-ready",
    nextPhase: "phase-3-tui-workspace",
  }
}

const invokedPath = process.argv[1]
const isMainModule = invokedPath
  ? import.meta.url === new URL(invokedPath, "file://").href
  : false

if (isMainModule) {
  const info = getTuiBootstrapInfo()
  console.log(`${info.appName} TUI scaffold ready (${info.status}). Next: ${info.nextPhase}.`)
}
