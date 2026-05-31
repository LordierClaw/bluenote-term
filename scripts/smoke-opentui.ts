import { getTuiBootstrapInfo } from "../src/tui/app"

const moduleRef = await import("@opentui/core")

if (typeof moduleRef.createCliRenderer !== "function") {
  throw new Error("@opentui/core did not expose createCliRenderer")
}

const info = getTuiBootstrapInfo()
if (info.status !== "tui-workspace-ready") {
  throw new Error(`Expected TUI workspace ready status, received ${info.status}`)
}

if (info.followUp !== "hardening-follow-up") {
  throw new Error(`Expected hardening follow-up metadata, received ${info.followUp}`)
}

console.log(`OpenTUI smoke check passed for ${info.appName} (${info.status}; follow-up: ${info.followUp}).`)
