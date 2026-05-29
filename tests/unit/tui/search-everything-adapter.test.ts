import { describe, test } from "bun:test"
import assert from "node:assert/strict"

import {
  TUI_COMMANDS,
  buildHighlightedSearchEverythingPreview,
  buildSearchEverythingPreview,
  buildSearchEverythingResults,
  collectCaseInsensitiveContainsRanges,
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
      { label: "Excerpt", lines: ["...Launch blockers: legal review and design QA..."] },
    ])

    assert.deepEqual(buildSearchEverythingPreview(folder)?.sections, [
      { label: "Items", lines: ["archive-review.md"] },
    ])

    assert.deepEqual(buildSearchEverythingPreview(command)?.sections, [
      { label: "Usage", lines: ["/find <query>"] },
      { label: "Shortcut", lines: ["Ctrl+F"] },
      { label: "Availability", lines: ["unavailable"] },
    ])
  })

  test("preview text carries highlight ranges while preserving plain string fallbacks", () => {
    const note = buildSearchEverythingResults("daily", createDeps()).find((result) => result.kind === "note")
    const preview = buildSearchEverythingPreview(note, "daily")

    assert.equal(preview?.title, "Daily Plan · daily-plan.md")
    assert.deepEqual(preview?.titleText, {
      text: "Daily Plan · daily-plan.md",
      highlights: [{ start: 0, end: 5 }, { start: 13, end: 18 }],
    })
    assert.deepEqual(preview?.sections, [
      { label: "Summary", lines: ["Today priorities and project focus."] },
    ])
    assert.deepEqual(preview?.sectionsText, [
      { label: "Summary", lines: [{ text: "Today priorities and project focus." }] },
    ])
  })

  test("folder preview title uses the full path and marks matching query ranges", () => {
    const folder = buildSearchEverythingResults("archive", createDeps()).find((result) => result.kind === "folder")
    const preview = buildSearchEverythingPreview(folder, "archive")

    assert.equal(preview?.title, "notes/archive")
    assert.deepEqual(preview?.titleText, {
      text: "notes/archive",
      highlights: [{ start: 6, end: 13 }],
    })
    assert.deepEqual(preview?.subtitleText, { text: "Folder contents" })
  })

  test("folder preview lists immediate child folders and files without metadata rows", () => {
    const deps: SearchEverythingDependencies = {
      noteSummaries: [
        { key: "brief", title: "Brief", description: "", relativePath: "notes/projects/client/brief.md" },
        { key: "todo", title: "Todo", description: "", relativePath: "notes/projects/client/todo.md" },
        { key: "research-note", title: "Research", description: "", relativePath: "notes/projects/client/research/note.md" },
        { key: "roadmap", title: "Roadmap", description: "", relativePath: "notes/projects/roadmap.md" },
      ],
      searchNotes: () => [],
    }
    const folder = buildSearchEverythingResults("client", deps).find((result) => result.kind === "folder" && result.path === "notes/projects/client")
    const preview = buildSearchEverythingPreview(folder, "client")

    assert.equal(preview?.title, "notes/projects/client")
    assert.deepEqual(preview?.titleText, {
      text: "notes/projects/client",
      highlights: [{ start: 15, end: 21 }],
    })
    assert.deepEqual(preview?.lines, ["research", "brief.md", "todo.md"])
    assert.deepEqual(preview?.sections, [{ label: "Items", lines: ["research", "brief.md", "todo.md"] }])
    assert.equal(preview?.sections.some((section) => ["Folder", "Contents", "Path"].includes(section.label)), false)
    assert.equal(preview?.lines.some((line) => /\bnote(?:s)?\b in notes\/projects\/client|notes\/projects\/client/u.test(line)), false)
  })

  test("does not derive folder results from hidden/internal note paths", () => {
    const deps: SearchEverythingDependencies = {
      noteSummaries: [
        { key: "hidden", title: "Hidden", description: "Internal data.", relativePath: "notes/.data/hidden.md" },
        { key: "visible", title: "Visible", description: "Visible data note.", relativePath: "notes/data-public/visible.md" },
      ],
      searchNotes: () => [],
    }

    const results = buildSearchEverythingResults("data", deps)

    assert.equal(results.some((result) => result.kind === "folder" && result.path === "notes/.data"), false)
    assert.equal(results.some((result) => result.kind === "folder" && result.previewLines?.length === 0), false)
    assert.equal(results.some((result) => result.kind === "folder" && result.path === "notes/data-public"), true)
  })

  test("file preview title combines note title and filename and highlights both", () => {
    const note = buildSearchEverythingResults("plan", createDeps()).find((result) => result.kind === "note")
    const preview = buildSearchEverythingPreview(note, "plan")

    assert.equal(preview?.title, "Daily Plan · daily-plan.md")
    assert.deepEqual(preview?.titleText, {
      text: "Daily Plan · daily-plan.md",
      highlights: [{ start: 6, end: 10 }, { start: 19, end: 23 }],
    })
  })

  test("content preview centers a deep body match and highlights query text in context", () => {
    const deepBody = [
      "# Launch Notes",
      "Introductory material that should stay out of a deep search preview.",
      "Architecture notes and setup details.",
      "Operational checklist and release owners.",
      "The legal review creates launch blockers for the client rollout this week.",
      "Follow-up actions after the launch blocker is cleared.",
    ].join("\n")
    const deps: SearchEverythingDependencies = {
      noteSummaries: noteSummaries.map((summary) => summary.key === "project-brief" ? { ...summary, body: deepBody } : summary),
      searchNotes: () => [
        {
          key: "project-brief",
          title: "Client Launch Brief",
          relativePath: "notes/projects/client/brief.md",
          match: {
            source: "content",
            label: "content line 5",
            excerpt: "...launch blockers...",
            start: deepBody.indexOf("launch blockers"),
            end: deepBody.indexOf("launch blockers") + "launch blockers".length,
          },
        },
      ],
    }

    const content = buildSearchEverythingResults("launch blockers", deps).find((result) => result.kind === "content")
    const preview = buildSearchEverythingPreview(content, "launch blockers")
    const line = preview?.lines[0] ?? ""
    const matchStart = line.toLowerCase().indexOf("launch blockers")

    assert.equal(preview?.title, "Client Launch Brief")
    assert.equal(preview?.lines.length, 1)
    assert.match(line, /legal review creates launch blockers for the client rollout/u)
    assert.doesNotMatch(line, /Introductory material|Architecture notes/u)
    assert.deepEqual(preview?.sections, [{ label: "Excerpt", lines: [line] }])
    assert.deepEqual(preview?.sectionsText, [
      {
        label: "Excerpt",
        lines: [
          {
            text: line,
            highlights: [{ start: matchStart, end: matchStart + "launch blockers".length }],
          },
        ],
      },
    ])
  })

  test("content preview centers supplied offsets instead of the first body query occurrence", () => {
    const earlyLine = "Early launch blockers mention that must not anchor the selected preview."
    const laterLine = "Selected occurrence has launch blockers next to the customer approval checklist."
    const body = [
      earlyLine,
      "Filler context before the selected match.",
      laterLine,
      "Follow-up after the selected match.",
    ].join("\n")
    const start = body.indexOf("launch blockers", earlyLine.length)
    const deps: SearchEverythingDependencies = {
      noteSummaries: noteSummaries.map((summary) => summary.key === "project-brief" ? { ...summary, body } : summary),
      searchNotes: () => [
        {
          key: "project-brief",
          title: "Client Launch Brief",
          relativePath: "notes/projects/client/brief.md",
          match: {
            source: "content",
            label: "content line 3",
            excerpt: "...Selected occurrence has launch blockers...",
            start,
            end: start + "launch blockers".length,
          },
        },
      ],
    }

    const content = buildSearchEverythingResults("launch blockers", deps).find((result) => result.kind === "content")
    const preview = buildSearchEverythingPreview(content, "launch blockers")

    assert.equal(preview?.lines[0], laterLine)
    assert.doesNotMatch(preview?.lines[0] ?? "", /Early launch blockers/u)
  })

  test("content preview accepts matchStart and matchEnd aliases for centering selected occurrence", () => {
    const body = [
      "Earlier blocker text has launch blockers near the top.",
      "Unrelated filler.",
      "Alias offsets select launch blockers in the later paragraph.",
    ].join("\n")
    const matchStart = body.lastIndexOf("launch blockers")
    const deps: SearchEverythingDependencies = {
      noteSummaries: noteSummaries.map((summary) => summary.key === "project-brief" ? { ...summary, body } : summary),
      searchNotes: () => [
        {
          key: "project-brief",
          title: "Client Launch Brief",
          relativePath: "notes/projects/client/brief.md",
          match: {
            source: "content",
            label: "content line 3",
            excerpt: "...Alias offsets select launch blockers...",
            matchStart,
            matchEnd: matchStart + "launch blockers".length,
          },
        },
      ],
    }

    const content = buildSearchEverythingResults("launch blockers", deps).find((result) => result.kind === "content")
    const preview = buildSearchEverythingPreview(content, "launch blockers")

    assert.equal(preview?.lines[0], "Alias offsets select launch blockers in the later paragraph.")
    assert.doesNotMatch(preview?.lines[0] ?? "", /Earlier blocker/u)
  })

  test("content preview prefers supplied excerpt over scanning body when offsets are unavailable", () => {
    const body = [
      "Body has an early launch blockers occurrence that should not be scanned for preview.",
      "More body text that is not part of the supplied result excerpt.",
    ].join("\n")
    const deps: SearchEverythingDependencies = {
      noteSummaries: noteSummaries.map((summary) => summary.key === "project-brief" ? { ...summary, body } : summary),
      searchNotes: () => [
        {
          key: "project-brief",
          title: "Client Launch Brief",
          relativePath: "notes/projects/client/brief.md",
          match: {
            source: "content",
            label: "content line 20",
            excerpt: "...supplied excerpt with launch blockers near selected occurrence...",
          },
        },
      ],
    }

    const content = buildSearchEverythingResults("launch blockers", deps).find((result) => result.kind === "content")
    const preview = buildSearchEverythingPreview(content, "launch blockers")

    assert.deepEqual(preview?.lines, ["...supplied excerpt with launch blockers near selected occurrence..."])
  })

  test("content preview context boundaries do not split grapheme clusters", () => {
    const prefix = "a".repeat(132)
    const body = `${prefix}é launch blockers 😀 trailing context that makes the line longer than the preview limit.`
    const start = body.indexOf("launch blockers")
    const deps: SearchEverythingDependencies = {
      noteSummaries: noteSummaries.map((summary) => summary.key === "project-brief" ? { ...summary, body } : summary),
      searchNotes: () => [
        {
          key: "project-brief",
          title: "Client Launch Brief",
          relativePath: "notes/projects/client/brief.md",
          match: {
            source: "content",
            label: "content line 1",
            excerpt: "...launch blockers...",
            start,
            end: start + "launch blockers".length,
          },
        },
      ],
    }

    const content = buildSearchEverythingResults("launch blockers", deps).find((result) => result.kind === "content")
    const line = buildSearchEverythingPreview(content, "launch blockers")?.lines[0] ?? ""

    assert.doesNotMatch(line, /�/u)
    assert.doesNotMatch(line, /^\.\.\.[\u0300-\u036f]/u)
    assert.doesNotMatch(line, /[\uD800-\uDBFF]$|^[\uDC00-\uDFFF]/u)
  })

  test("content preview uses supplied excerpt when no full body is available and omits match metadata rows", () => {
    const content = buildSearchEverythingResults("launch blockers", createDeps()).find((result) => result.kind === "content")
    const preview = buildSearchEverythingPreview(content, "launch blockers")

    assert.deepEqual(preview?.lines, ["...Launch blockers: legal review and design QA..."])
    assert.deepEqual(preview?.sections, [
      { label: "Excerpt", lines: ["...Launch blockers: legal review and design QA..."] },
    ])
    assert.equal(preview?.sections.some((section) => ["Match", "Path", "Description"].includes(section.label)), false)
  })

  test("empty file preview keeps a calm content fallback without metadata rows", () => {
    const preview = buildSearchEverythingPreview({
      kind: "note",
      typeLabel: "note",
      typeIcon: "note",
      id: "note:empty",
      key: "empty",
      filename: "empty.md",
      title: "Empty Note",
      description: "",
      relativePath: "notes/empty.md",
      matchedFields: ["filename"],
      label: "Empty Note",
      detail: "empty.md — notes/empty.md",
      score: 100,
    }, "empty")

    assert.equal(preview?.title, "Empty Note · empty.md")
    assert.deepEqual(preview?.lines, [])
    assert.deepEqual(preview?.sections, [])
    assert.equal(JSON.stringify(preview?.sections), "[]")
  })

  test("highlight ranges stay aligned with original Unicode text when case folding changes length", () => {
    const text = "İstanbul"
    const ranges = collectCaseInsensitiveContainsRanges(text, "st")

    assert.deepEqual(ranges, [{ start: 1, end: 3 }])
    assert.deepEqual(ranges.map((range) => text.slice(range.start, range.end)), ["st"])
  })

  test("highlight ranges cover variable-length Unicode collation matches", () => {
    const dottedCapitalI = "İstanbul"
    assert.deepEqual(collectCaseInsensitiveContainsRanges(dottedCapitalI, "i̇"), [{ start: 0, end: 1 }])
    assert.deepEqual(
      collectCaseInsensitiveContainsRanges("éclair", "é"),
      [{ start: 0, end: 2 }],
    )
  })

  test("highlight ranges do not split combining sequences", () => {
    const text = "Café noir"
    const ranges = collectCaseInsensitiveContainsRanges(text, "e")

    assert.deepEqual(ranges, [{ start: 3, end: 5 }])
    assert.deepEqual(ranges.map((range) => text.slice(range.start, range.end)), ["é"])
  })

  test("highlight ranges drop later overlaps while preserving earlier larger matches", () => {
    const ranges = collectCaseInsensitiveContainsRanges("abcdefghijk", "abcdefghij cde ijk")

    assert.deepEqual(ranges, [{ start: 0, end: 10 }])
    assert.equal(ranges.every((range, index) => index === 0 || range.start >= ranges[index - 1]!.end), true)
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
      id: "content:project-brief:content%20line%207:0",
      key: "project-brief",
      title: "Client Launch Brief",
      relativePath: "notes/projects/client/brief.md",
      label: "Client Launch Brief",
      detail: "content line 7 — notes/projects/client/brief.md",
      score: contentResult?.score,
      matchIndex: 0,
      matchLabel: "content line 7",
      excerpt: "...Launch blockers: legal review and design QA...",
    })
  })

  test("returns one content result per searchNotes content occurrence with stable unique ids", () => {
    const deps: SearchEverythingDependencies = {
      noteSummaries,
      searchNotes: () => [
        {
          key: "project-brief",
          title: "Client Launch Brief",
          relativePath: "notes/projects/client/brief.md",
          match: {
            source: "content",
            label: "content line 12",
            excerpt: "...first launch blocker...",
          },
        },
        {
          key: "project-brief",
          title: "Client Launch Brief",
          relativePath: "notes/projects/client/brief.md",
          match: {
            source: "content",
            label: "content line 18",
            excerpt: "...second launch blocker...",
          },
        },
      ],
    }

    const firstRun = buildSearchEverythingResults("launch", deps).filter((result) => result.kind === "content")
    const secondRun = buildSearchEverythingResults("launch", deps).filter((result) => result.kind === "content")

    assert.equal(firstRun.length, 2)
    assert.deepEqual(firstRun.map((result) => result.id), [
      "content:project-brief:content%20line%2012:0",
      "content:project-brief:content%20line%2018:1",
    ])
    assert.deepEqual(new Set(firstRun.map((result) => result.id)).size, firstRun.length)
    assert.deepEqual(secondRun.map((result) => result.id), firstRun.map((result) => result.id))
    assert.deepEqual(firstRun.map((result) => ({ key: result.key, matchIndex: result.matchIndex, matchLabel: result.matchLabel, excerpt: result.excerpt })), [
      { key: "project-brief", matchIndex: 0, matchLabel: "content line 12", excerpt: "...first launch blocker..." },
      { key: "project-brief", matchIndex: 1, matchLabel: "content line 18", excerpt: "...second launch blocker..." },
    ])
  })

  test("same-note content occurrences with the same label still receive collision-safe ids", () => {
    const deps: SearchEverythingDependencies = {
      noteSummaries,
      searchNotes: () => [
        {
          key: "project-brief",
          title: "Client Launch Brief",
          relativePath: "notes/projects/client/brief.md",
          match: {
            source: "content",
            label: "content line 7",
            excerpt: "...launch blocker one...",
          },
        },
        {
          key: "project-brief",
          title: "Client Launch Brief",
          relativePath: "notes/projects/client/brief.md",
          match: {
            source: "content",
            label: "content line 7",
            excerpt: "...launch blocker two...",
          },
        },
      ],
    }

    const contentResults = buildSearchEverythingResults("launch", deps).filter((result) => result.kind === "content")

    assert.deepEqual(contentResults.map((result) => result.id), [
      "content:project-brief:content%20line%207:0",
      "content:project-brief:content%20line%207:1",
    ])
    assert.deepEqual(contentResults.map((result) => result.matchLabel), ["content line 7", "content line 7"])
    assert.deepEqual(contentResults.map((result) => result.excerpt), ["...launch blocker one...", "...launch blocker two..."])
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
      previewLines: ["archive-review.md"],
    })
  })

  test("returns slash-prefixed command results", () => {
    assert.deepEqual(
      TUI_COMMANDS.map((command) => command.name),
      ["/new", "/archive", "/delete", "/rebuild", "/migrate", "/find", "/replace", "/save"],
    )
    assert.deepEqual(
      Object.fromEntries(TUI_COMMANDS.map((command) => [command.name, command.shortcut ?? null])),
      {
        "/new": "n",
        "/archive": null,
        "/delete": "d",
        "/rebuild": null,
        "/migrate": null,
        "/find": "Ctrl+F",
        "/replace": "Ctrl+H",
        "/save": "Ctrl+S",
      },
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
      title: "Daily Plan · daily-plan.md",
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
