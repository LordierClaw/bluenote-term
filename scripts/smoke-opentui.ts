import { getTuiBootstrapInfo } from "../src/tui/app"

const moduleRef = await import("@opentui/core")

if (typeof moduleRef.createCliRenderer !== "function") {
  throw new Error("@opentui/core did not expose createCliRenderer")
}

const info = getTuiBootstrapInfo()
if (info.status !== "phase-4b-editor-input-cursor-responsive-chrome") {
  throw new Error(`Expected accepted Phase 4B editor/input/cursor/responsive chrome status, received ${info.status}`)
}

if (info.nextPhase !== "phase-4c-manager-performance-responsive-layout-style") {
  throw new Error(`Expected Phase 4C manager/responsive/style metadata, received ${info.nextPhase}`)
}

console.log(`OpenTUI smoke check passed for ${info.appName} (${info.status}; next: ${info.nextPhase}).`)
