import { describe, test } from "bun:test"
import assert from "node:assert/strict"

import { buildGnomeTerminalGeometry, screenshotBridgeArgumentsFor } from "../../../scripts/visual-tui-qa"

describe("visual TUI QA harness helpers", () => {
  test("keeps launched terminal windows in stable regions away from persistent desktop terminals", () => {
    assert.equal(buildGnomeTerminalGeometry("100x30", 0), "100x30+40+40")
    assert.equal(buildGnomeTerminalGeometry("120x40", 1), "120x40+40+40")
    assert.equal(buildGnomeTerminalGeometry("80x24", 7), "80x24+40+700")
  })

  test("prefers focused target-window screenshots and does not fall back to obstructable fullscreen when a window id is known", () => {
    assert.deepEqual(screenshotBridgeArgumentsFor(123), [
      { window_id: 123, raise_window: true },
    ])
    assert.deepEqual(screenshotBridgeArgumentsFor(null), [{ full_screen: true }])
  })
})
