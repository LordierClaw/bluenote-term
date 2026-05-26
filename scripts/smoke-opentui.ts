import { getTuiBootstrapInfo } from "../src/tui/app"

const moduleRef = await import("@opentui/core")

if (typeof moduleRef.createCliRenderer !== "function") {
  throw new Error("@opentui/core did not expose createCliRenderer")
}

const info = getTuiBootstrapInfo()
if (info.status !== "phase-3-tui-workspace") {
  throw new Error(`Expected Phase 3 TUI workspace status, received ${info.status}`)
}

if (info.nextPhase !== "phase-4-search-editing-and-recovery") {
  throw new Error(`Expected Phase 4 search/editing/recovery metadata, received ${info.nextPhase}`)
}

console.log(`OpenTUI smoke check passed for ${info.appName} (${info.status}; next: ${info.nextPhase}).`)
