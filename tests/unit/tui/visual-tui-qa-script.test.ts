import { describe, test } from "bun:test"
import assert from "node:assert/strict"

import {
  buildEvidenceRows,
  buildGnomeTerminalGeometry,
  phase4JVisualCases,
  qaSeedExpectations,
  screenshotBridgeArgumentsFor,
} from "../../../scripts/visual-tui-qa"

describe("visual TUI QA harness helpers", () => {
  test("keeps launched terminal windows in stable regions away from persistent desktop terminals", () => {
    assert.equal(buildGnomeTerminalGeometry("100x30", 0), "100x30+40+40")
    assert.equal(buildGnomeTerminalGeometry("120x40", 1), "120x40+40+40")
    assert.equal(buildGnomeTerminalGeometry("80x24", 7), "80x24+40+700")
  })

  test("prefers focused target-window screenshots and keeps raw/cropped fallback artifacts", () => {
    assert.deepEqual(screenshotBridgeArgumentsFor(123), [
      { window_id: 123, raise_window: true },
      { full_screen: true, raise_window: false },
    ])
    assert.deepEqual(screenshotBridgeArgumentsFor(null), [{ full_screen: true }])
  })

  test("phase 4J case list maps directly to required visual/manual scenarios", () => {
    const requiredIds = [
      "manager-long-row-truncation-100x30",
      "manager-folder-preview-100x30",
      "manager-note-preview-100x30",
      "manager-filter-name-only-100x30",
      "search-folder-preview-100x30",
      "search-file-title-preview-100x30",
      "search-multi-content-results-100x30",
      "editor-separator-100x30",
      "editor-find-replace-highlight-100x30",
      "editor-clipboard-attempt-100x30",
      "editor-undo-redo-flow-100x30",
    ]

    const caseIds = phase4JVisualCases.map((testCase) => testCase.id)
    for (const id of requiredIds) {
      assert.ok(caseIds.includes(id), `missing visual QA case ${id}`)
    }
    assert.equal(new Set(caseIds).size, caseIds.length, "case ids should be unique artifact names")
  })

  test("phase 4J QA seed expectations cover public-path scenario data", () => {
    assert.ok(qaSeedExpectations.titles.some((title) => title.length > 80), "has long title")
    assert.ok(qaSeedExpectations.relativePaths.some((relativePath) => relativePath.includes("projects/client")), "has nested folders")
    assert.ok(qaSeedExpectations.bodyMarkers.includes("needle-repeat"), "has repeated content matches")
    assert.ok(qaSeedExpectations.bodyMarkers.includes("replace-target"), "has find/replace body text")
    assert.ok(qaSeedExpectations.bodyMarkers.includes("clipboard-source"), "has clipboard body text")
    assert.ok(qaSeedExpectations.bodyMarkers.includes("undo-redo-start"), "has undo/redo body text")
  })

  test("report evidence rows include requirement mapping and screenshot paths", () => {
    const rows = buildEvidenceRows({
      caseId: "editor-find-replace-highlight-100x30",
      title: "Editor find/replace highlight",
      requirementIds: [12],
      geometry: "100x30",
      zoom: "1.0",
      actions: ["Enter", "C-h", "text:replace-target"],
      expected: ["Replace", "replace-target"],
      panePath: "/tmp/qa/editor-find-replace-highlight-100x30/pane.txt",
      screenshotPath: "/tmp/qa/editor-find-replace-highlight-100x30/screen.png",
      screenshotLogPath: "/tmp/qa/editor-find-replace-highlight-100x30/screenshot.log",
      status: "Pass",
      notes: "",
    })

    const markdown = rows.join("\n")
    assert.match(markdown, /\| 12 \|/)
    assert.match(markdown, /editor-find-replace-highlight-100x30/)
    assert.match(markdown, /screen\.png/)
    assert.match(markdown, /pane\.txt/)
  })
})
