import { describe, test } from "bun:test"
import assert from "node:assert/strict"

import { displayCellWidth } from "../../../src/tui/display-width"
import { buildAiStatusViewModel, buildManagerViewModel } from "../../../src/tui/render-manager"
import { createInitialTuiState, type AiStatusState } from "../../../src/tui/state"

function stateWithAi(ai: AiStatusState) {
  return createInitialTuiState({ ai })
}

describe("TUI AI status view model", () => {
  test("configured model produces connected status", () => {
    const vm = buildManagerViewModel(stateWithAi({ kind: "connected", model: "gpt-4o-mini" }))

    assert.equal(vm.aiStatus.text, "AI: connected · gpt-4o-mini")
    assert.equal(buildAiStatusViewModel({ kind: "connected", model: "gpt-4o-mini" }).text, "AI: connected · gpt-4o-mini")
  })

  test("missing config produces not configured status", () => {
    const vm = buildManagerViewModel(createInitialTuiState())

    assert.equal(vm.aiStatus.text, "AI: not configured")
  })

  test("running state produces note key or queued count status", () => {
    assert.equal(buildManagerViewModel(stateWithAi({ kind: "running", key: "project-notes" })).aiStatus.text, "AI: running · project-notes")
    assert.equal(buildManagerViewModel(stateWithAi({ kind: "running", count: 3 })).aiStatus.text, "AI: running")
    assert.equal(buildManagerViewModel(stateWithAi({ kind: "running", progress: { processed: 1, total: 3 }, queue: { queued: 2 } })).aiStatus.text, "AI: running · processing 1/3")
  })

  test("default manager status omits normal queued and empty wording", () => {
    for (const ai of [
      { kind: "connected", model: "gpt-4o-mini", queue: { queued: 1, failed: 0 } },
      { kind: "connected", model: "gpt-4o-mini", queue: { queued: 0, failed: 0 } },
      { kind: "updated", count: 0, queue: { queued: 2, failed: 1 } },
    ] satisfies AiStatusState[]) {
      const text = buildAiStatusViewModel(ai).text
      assert.doesNotMatch(text, /\b\d+ queued\b|\bempty\b/u)
    }
    assert.match(buildAiStatusViewModel({ kind: "connected", model: "gpt", queue: { queued: 0, failed: 1 } }).text, /failed/u)
  })

  test("status exposes color intent per state", () => {
    assert.equal(buildAiStatusViewModel({ kind: "running", progress: { processed: 0, total: 2 } }).styleIntent, "warning")
    assert.equal(buildAiStatusViewModel({ kind: "connected", model: "gpt" }).styleIntent, "success")
    assert.equal(buildAiStatusViewModel({ kind: "updated", count: 1 }).styleIntent, "success")
    assert.equal(buildAiStatusViewModel({ kind: "error", reason: "failed" }).styleIntent, "danger")
    assert.equal(buildAiStatusViewModel({ kind: "connected", model: "gpt", queue: { queued: 0, failed: 1 } }).styleIntent, "danger")
    assert.equal(buildAiStatusViewModel({ kind: "auth-required", reason: "auth required" }).styleIntent, "warning")
    assert.equal(buildAiStatusViewModel({ kind: "not-configured" }).styleIntent, "mutedText")
  })

  test("completion state produces note key or count summary", () => {
    assert.equal(buildManagerViewModel(stateWithAi({ kind: "updated", key: "project-notes" })).aiStatus.text, "AI: updated · project-notes")
    assert.equal(buildManagerViewModel(stateWithAi({ kind: "updated", count: 4 })).aiStatus.text, "AI: updated 4 description(s)")
  })

  test("error state produces short reason", () => {
    const vm = buildManagerViewModel(stateWithAi({
      kind: "error",
      reason: "rate limited after provider returned many details that should not dominate the footer",
    }))

    assert.equal(vm.aiStatus.text, "AI: error · rate limited after provider returned many details that should…")
    assert.ok(displayCellWidth(vm.aiStatus.text) <= 74)
  })

  test("status is safely truncated for narrow widths", () => {
    const wide = buildAiStatusViewModel({ kind: "connected", model: "gpt-4o-mini" }, 40)
    assert.equal(wide.renderedText, "AI: connected · gpt-4o-mini")

    const narrow = buildAiStatusViewModel({ kind: "connected", model: "gpt-4o-mini" }, 12)
    assert.equal(narrow.renderedText, "AI: connect…")
    assert.equal(displayCellWidth(narrow.renderedText), 12)
    assert.doesNotMatch(narrow.renderedText, /�/u)
  })
})
