import { describe, test } from "bun:test"
import assert from "node:assert/strict"

import {
  buildEvidenceRows,
  buildGnomeTerminalGeometry,
  refinedVisualCases,
  feedbackVisualCases,
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

  test("refined case list maps directly to required visual/manual scenarios", () => {
    const requiredIds = [
      "manager-long-row-truncation-100x30",
      "manager-folder-preview-100x30",
      "manager-note-preview-100x30",
      "manager-filter-name-only-100x30",
      "search-folder-preview-100x30",
      "search-file-title-preview-100x30",
      "search-multi-content-results-100x30",
      "search-stable-chrome-100x30",
      "editor-separator-100x30",
      "editor-find-replace-highlight-100x30",
      "editor-find-bottom-bar",
      "editor-replace-bottom-bar",
      "editor-clipboard-attempt-100x30",
      "editor-undo-flow-100x30",
      "editor-redo-flow-100x30",
    ]

    const caseIds = refinedVisualCases.map((testCase) => testCase.id)
    for (const id of requiredIds) {
      assert.ok(caseIds.includes(id), `missing visual QA case ${id}`)
    }
    assert.equal(new Set(caseIds).size, caseIds.length, "case ids should be unique artifact names")
  })

  test("feedback case list covers every acceptance scenario", () => {
    const requiredIds = [
      "editor-clipboard-feedback-disk-readback-100x30",
      "editor-ctrl-h-backspace-delivery-100x30",
      "editor-find-bottom-bar-80x24",
      "editor-replace-bottom-bar-120x40",
      "manager-no-preview-label-100x30",
      "manager-empty-folder-filter-100x30",
      "search-note-raw-preview-100x30",
      "search-folder-raw-preview-100x30",
      "search-command-raw-preview-100x30",
      "search-stable-chrome-80x24",
      "search-long-results-scroll-100x30",
      "search-editor-context-commands-100x30",
      "search-manager-context-commands-120x40",
    ]

    const caseIds = feedbackVisualCases.map((testCase) => testCase.id)
    for (const id of requiredIds) {
      assert.ok(caseIds.includes(id), `missing visual/manual QA case ${id}`)
    }
    assert.equal(new Set(caseIds).size, caseIds.length, "case ids should be unique artifact names")
  })

  test("feedback cases exercise the required terminal size matrix", () => {
    const geometries = new Set(feedbackVisualCases.map((testCase) => testCase.geometry))
    assert.ok(geometries.has("80x24"), "covers narrow 80x24 visual state")
    assert.ok(geometries.has("100x30"), "covers default 100x30 visual state")
    assert.ok(geometries.has("120x40"), "covers large 120x40 visual state")
  })

  test("feedback cases require pane, screenshot, cleanup, and state readback evidence", () => {
    assert.ok(feedbackVisualCases.some((testCase) => testCase.evidence.includes("disk readback")), "clipboard case records disk readback evidence")
    assert.ok(feedbackVisualCases.some((testCase) => testCase.evidence.includes("shortcut delivery")), "Ctrl+H case records delivery evidence")
    assert.ok(feedbackVisualCases.every((testCase) => testCase.evidence.includes("pane capture")), "all cases keep pane fallback evidence")
    assert.ok(feedbackVisualCases.every((testCase) => testCase.evidence.includes("screenshot or blocked diagnostic")), "all cases keep screenshot/blocked diagnostics")
    assert.ok(feedbackVisualCases.every((testCase) => testCase.evidence.includes("cleanup assertion")), "all cases require cleanup assertion")
  })

  test("visual QA seed expectations cover public-path scenario data", () => {
    assert.ok(qaSeedExpectations.titles.some((title) => title.length > 80), "has long title")
    assert.ok(qaSeedExpectations.relativePaths.some((relativePath) => relativePath.includes("projects/client")), "has nested folders")
    assert.ok(qaSeedExpectations.bodyMarkers.includes("needle-repeat"), "has repeated content matches")
    assert.ok(qaSeedExpectations.bodyMarkers.includes("replace-target"), "has find/replace body text")
    assert.ok(qaSeedExpectations.bodyMarkers.includes("clipboard-source"), "has clipboard body text")
    assert.ok(qaSeedExpectations.bodyMarkers.includes("undo-redo-start"), "has undo/redo body text")
    assert.ok(qaSeedExpectations.bodyMarkers.includes("clipboard-feedback-start"), "has clipboard feedback/readback text")
    assert.ok(qaSeedExpectations.bodyMarkers.includes("longscrolltoken"), "has long search result scroll text")
    assert.ok(qaSeedExpectations.relativePaths.includes("notes/projects/empty-client/"), "has empty user folder")
    assert.ok(qaSeedExpectations.relativePaths.includes("notes/.data/"), "has hidden/internal folder fixture")
  })

  test("report evidence rows include requirement mapping and screenshot paths", () => {
    const rows = buildEvidenceRows({
      caseId: "editor-find-replace-highlight-100x30",
      title: "Editor find/replace highlight",
      requirementIds: [12],
      geometry: "100x30",
      zoom: "1.0",
      actions: ["Enter", "C-r", "text:replace-target"],
      expected: ["Replace", "replace-target"],
      forbidden: ["stale-body"],
      panePath: "/tmp/qa/editor-find-replace-highlight-100x30/pane.txt",
      screenshotPath: "/tmp/qa/editor-find-replace-highlight-100x30/screen.png",
      screenshotLogPath: "/tmp/qa/editor-find-replace-highlight-100x30/screenshot.log",
      stateReadbackPaths: ["/tmp/qa/editor-find-replace-highlight-100x30/disk.txt", "/tmp/qa/process-after.txt"],
      status: "Pass",
      notes: "",
    })

    const markdown = rows.join("\n")
    assert.match(markdown, /\| 12 \|/)
    assert.match(markdown, /editor-find-replace-highlight-100x30/)
    assert.match(markdown, /screen\.png/)
    assert.match(markdown, /pane\.txt/)
    assert.match(markdown, /disk\.txt/)
    assert.match(markdown, /process-after\.txt/)
    assert.match(markdown, /absent: stale-body/)
  })
})
