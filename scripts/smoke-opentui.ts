import { getTuiBootstrapInfo } from "../src/tui/app"

const moduleRef = await import("@opentui/core")

if (typeof moduleRef.createCliRenderer !== "function") {
  throw new Error("@opentui/core did not expose createCliRenderer")
}

const info = getTuiBootstrapInfo()
if (info.status !== "phase-4e-autosave-atomicity-safe-note-body-writes") {
  throw new Error(`Expected delivered Phase 4E autosave atomicity / safe note-body write status, received ${info.status}`)
}

if (info.nextPhase !== "phase-4-next-hardening-subplan") {
  throw new Error(`Expected neutral Phase 4 hardening follow-up metadata, received ${info.nextPhase}`)
}

console.log(`OpenTUI smoke check passed for ${info.appName} (${info.status}; next: ${info.nextPhase}).`)
