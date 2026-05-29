import { describe, test } from "bun:test"
import assert from "node:assert/strict"

import {
  TUI_COMMANDS,
  buildHighlightedSearchEverythingPreview,
  buildSearchEverythingPreview,
  buildSearchEverythingResults,
  createSearchEverythingSession,
  type SearchEverythingDependencies,
  type SearchEverythingResult,
  type SearchEverythingNoteResult,
} from "../../../src/tui/adapters/search-everything-adapter"

const noteSummaries = [
  {
    key: "daily-plan",
    title: "Daily Plan",
    description: "Today priorities and project focus.",
    relativePath: "notes/inbox/daily-plan.md",
  },
  {
    key: "project-brief",
    title: "Client Launch Brief",
    description: "Marketing rollout plan.",
    relativePath: "notes/projects/client/brief.md",
  },
  {
    key: "archive-review",
    title: "Archive Review",
    description: "Old ideas to revisit.",
    relativePath: "notes/archive/archive-review.md",
  },
  {
    key: "a-big-cat",
    title: "A Big Cat",
    description: "Animal notes without a contiguous letter run.",
    relativePath: "notes/a-big-cat/cat.md",
  },
  {
    key: "incident-123",
    title: "Incident 123",
    description: "Follow-up for ticket 123.",
    relativePath: "notes/incidents/incident-123.md",
  },
]

function createDeps(): SearchEverythingDependencies {
  return {
    noteSummaries,
    searchNotes: (query) => {
      if (query !== "launch blockers") {
        return []
      }

      return [
        {
          key: "project-brief",
          title: "Client Launch Brief",
          relativePath: "notes/projects/client/brief.md",
          match: {
            source: "content",
            label: "content line 7",
            excerpt: "...Launch blockers: legal review and design QA...",
          },
        },
      ]
    },
  }
}

describe("TUI Search Everything adapter", () => {
  test("exposes display metadata for each result type without relying only on raw kind strings", () => {
    const results = [
      buildSearchEverythingResults("daily", createDeps()).find((result) => result.kind === "note"),
      buildSearchEverythingResults("launch blockers", createDeps()).find((result) => result.kind === "content"),
      buildSearchEverythingResults("archive", createDeps()).find((result) => result.kind === "folder"),
      buildSearchEverythingResults("/find", createDeps()).find((result) => result.kind === "command"),
    ].filter((result): result is SearchEverythingResult => Boolean(result))

    assert.deepEqual(
      results.map((result) => ({ kind: result.kind, typeLabel: result.typeLabel })),
      [
        { kind: "note", typeLabel: "note" },
        { kind: "content", typeLabel: "content" },
        { kind: "folder", typeLabel: "folder" },
        { kind: "command", typeLabel: "command" },
      ],
    )
    assert.deepEqual(
      results.map((result) => ({ kind: result.kind, typeIcon: result.typeIcon })),
      [
        { kind: "note", typeIcon: "note" },
        { kind: "content", typeIcon: "content" },
        { kind: "folder", typeIcon: "folder" },
        { kind: "command", typeIcon: "command" },
      ],
    )
  })

  test("builds typed preview sections while preserving compatibility lines", () => {
    const note = buildSearchEverythingResults("daily", createDeps()).find((result) => result.kind === "note")
    const content = buildSearchEverythingResults("launch blockers", createDeps()).find((result) => result.kind === "content")
    const folder = buildSearchEverythingResults("archive", createDeps()).find((result) => result.kind === "folder")
    const command = buildSearchEverythingResults("/find", createDeps()).find((result) => result.kind === "command")

    assert.deepEqual(buildSearchEverythingPreview(note)?.sections, [
      { label: "Summary", lines: ["Today priorities and project focus."] },
    ])
    assert.deepEqual(buildSearchEverythingPreview(note)?.lines, ["Today priorities and project focus."])

    assert.deepEqual(buildSearchEverythingPreview(content)?.sections, [
      { label: "Match", lines: ["content line 7"] },
      { label: "Excerpt", lines: ["...Launch blockers: legal review and design QA..."] },
    ])

    assert.deepEqual(buildSearchEverythingPreview(folder)?.sections, [
      { label: "Folder", lines: ["notes/archive"] },
      { label: "Contents", lines: ["1 note in notes/archive"] },
    ])

    assert.deepEqual(buildSearchEverythingPreview(command)?.sections, [
      { label: "Usage", lines: ["/find <query>"] },
      { label: "Shortcut", lines: ["Ctrl+F"] },
      { label: "Availability", lines: ["unavailable"] },
    ])
  })

  test("returns note results with contains matches by filename/key, title, description, and path/folder", () => {
    const filenameMatch = buildSearchEverythingResults("daily-plan.md", createDeps())
    assert.equal(filenameMatch[0]?.kind, "note")
    assert.equal(filenameMatch[0]?.key, "daily-plan")
    assert.deepEqual(filenameMatch[0]?.matchedFields, ["filename", "key", "path"])

    const titleMatch = buildSearchEverythingResults("client launch", createDeps())
    assert.equal(titleMatch[0]?.kind, "note")
    assert.equal(titleMatch[0]?.key, "project-brief")
    assert.deepEqual(titleMatch[0]?.matchedFields, ["title"])

    const descriptionMatch = buildSearchEverythingResults("old ideas", createDeps())
    assert.equal(descriptionMatch[0]?.kind, "note")
    assert.equal(descriptionMatch[0]?.key, "archive-review")
    assert.deepEqual(descriptionMatch[0]?.matchedFields, ["description"])

    const pathMatch = buildSearchEverythingResults("projects client", createDeps())
    assert.equal(pathMatch[0]?.kind, "folder")
    assert.equal(pathMatch.some((result) => result.kind === "note" && result.key === "project-brief"), true)
    const noteResult = pathMatch.find(
      (result): result is SearchEverythingNoteResult => result.kind === "note" && result.key === "project-brief",
    )
    assert.deepEqual(noteResult?.matchedFields, ["path"])
  })

  test("does not include note or folder results for subsequence-only matches", () => {
    const results = buildSearchEverythingResults("abc", createDeps())

    assert.equal(results.some((result) => result.kind === "note" && result.key === "a-big-cat"), false)
    assert.equal(results.some((result) => result.kind === "folder" && result.path.includes("a-big-cat")), false)
  })

  test("returns note and path results containing numeric queries", () => {
    const results = buildSearchEverythingResults("123", createDeps())
    const noteResult = results.find(
      (result): result is SearchEverythingNoteResult => result.kind === "note" && result.key === "incident-123",
    )

    assert.ok(noteResult)
    assert.deepEqual(noteResult.matchedFields, ["filename", "key", "title", "description", "path"])
  })

  test("returns content results with note excerpts when searchNotes supplies content matches", () => {
    const results = buildSearchEverythingResults("launch blockers", createDeps())
    const contentResult = results.find((result) => result.kind === "content")

    assert.deepEqual(contentResult, {
      kind: "content",
      typeLabel: "content",
      typeIcon: "content",
      id: "content:project-brief:content line 7",
      key: "project-brief",
      title: "Client Launch Brief",
      relativePath: "notes/projects/client/brief.md",
      label: "Client Launch Brief",
      detail: "content line 7 — notes/projects/client/brief.md",
      score: contentResult?.score,
      matchLabel: "content line 7",
      excerpt: "...Launch blockers: legal review and design QA...",
    })
  })

  test("returns folder/path results for folder queries", () => {
    const results = buildSearchEverythingResults("archive", createDeps())
    const folder = results.find((result) => result.kind === "folder")

    assert.deepEqual(folder, {
      kind: "folder",
      typeLabel: "folder",
      typeIcon: "folder",
      id: "folder:notes/archive",
      path: "notes/archive",
      name: "archive",
      label: "archive/",
      detail: "1 note in notes/archive",
      score: folder?.score,
      noteCount: 1,
    })
  })

  test("returns slash-prefixed command results", () => {
    assert.deepEqual(
      TUI_COMMANDS.map((command) => command.name),
      ["/new", "/archive", "/delete", "/rebuild", "/migrate", "/find", "/replace", "/save"],
    )

    const results = buildSearchEverythingResults("/re", createDeps())
    assert.deepEqual(
      results.filter((result) => result.kind === "command").map((result) => result.name),
      ["/rebuild", "/replace"],
    )

    const subsequenceOnlyResults = buildSearchEverythingResults("/ae", createDeps())
    assert.equal(
      subsequenceOnlyResults.some((result) => result.kind === "command" && result.name === "/archive"),
      false,
    )
  })

  test("shows command description, usage, and shortcut on highlighted command results", () => {
    const results = buildSearchEverythingResults("/find", createDeps())
    const preview = buildHighlightedSearchEverythingPreview(results, 0)

    assert.equal(results[0]?.kind, "command")
    assert.deepEqual(preview, {
      title: "/find",
      subtitle: "Find text in the active editor buffer",
      lines: ["Usage: /find <query>", "Shortcut: Ctrl+F", "Availability: unavailable"],
      sections: [
        { label: "Usage", lines: ["/find <query>"] },
        { label: "Shortcut", lines: ["Ctrl+F"] },
        { label: "Availability", lines: ["unavailable"] },
      ],
    })
  })

  test("builds previews for highlighted note and content results", () => {
    const notePreview = buildHighlightedSearchEverythingPreview(buildSearchEverythingResults("daily", createDeps()), 0)
    assert.deepEqual(notePreview, {
      title: "Daily Plan",
      subtitle: "notes/inbox/daily-plan.md",
      lines: ["Today priorities and project focus."],
      sections: [
        { label: "Summary", lines: ["Today priorities and project focus."] },
      ],
    })

    const contentPreview = buildHighlightedSearchEverythingPreview(buildSearchEverythingResults("launch blockers", createDeps()), 0)
    assert.deepEqual(contentPreview, {
      title: "Client Launch Brief",
      subtitle: "content line 7 — notes/projects/client/brief.md",
      lines: ["...Launch blockers: legal review and design QA..."],
      sections: [
        { label: "Match", lines: ["content line 7"] },
        { label: "Excerpt", lines: ["...Launch blockers: legal review and design QA..."] },
      ],
    })
  })

  test("preserves the invoking screen for cancellation", () => {
    assert.deepEqual(createSearchEverythingSession("editor", "daily"), {
      query: "daily",
      selectedIndex: 0,
      previousScreen: "editor",
    })
  })
})
