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
    body: "# Daily Plan\nToday body priorities and project focus.\n",
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

  test("builds raw content-first previews without redundant section labels or metadata rows", () => {
    const note = buildSearchEverythingResults("daily", createDeps()).find((result) => result.kind === "note")
    const content = buildSearchEverythingResults("launch blockers", createDeps()).find((result) => result.kind === "content")
    const folder = buildSearchEverythingResults("archive", createDeps()).find((result) => result.kind === "folder")
    const command = buildSearchEverythingResults("/find", createDeps()).find((result) => result.kind === "command")

    assert.equal(buildSearchEverythingPreview(note)?.title, "notes/inbox/daily-plan.md")
    assert.deepEqual(buildSearchEverythingPreview(note)?.lines, ["# Daily Plan", "Today body priorities and project focus."])
    assert.deepEqual(buildSearchEverythingPreview(note)?.sections, [])

    assert.equal(buildSearchEverythingPreview(content)?.title, "notes/projects/client/brief.md")
    assert.deepEqual(buildSearchEverythingPreview(content)?.lines, ["...Launch blockers: legal review and design QA..."])
    assert.deepEqual(buildSearchEverythingPreview(content)?.sections, [])

    assert.equal(buildSearchEverythingPreview(folder)?.title, "notes/archive")
    assert.deepEqual(buildSearchEverythingPreview(folder)?.lines, ["archive-review.md"])
    assert.deepEqual(buildSearchEverythingPreview(folder)?.sections, [])

    assert.equal(buildSearchEverythingPreview(command)?.title, "/find")
    assert.deepEqual(buildSearchEverythingPreview(command)?.lines, [
      "Find text in the active editor buffer",
      "/find <query>",
      "Ctrl+F",
    ])
    assert.deepEqual(buildSearchEverythingPreview(command)?.sections, [])

    const allPreviewText = JSON.stringify([
      buildSearchEverythingPreview(note),
      buildSearchEverythingPreview(content),
      buildSearchEverythingPreview(folder),
      buildSearchEverythingPreview(command),
    ])
    assert.doesNotMatch(allPreviewText, /Preview ·|Summary|Excerpt|Items|Availability|Usage:|Shortcut:|Risk:/u)
  })

  test("preview text carries highlight ranges while preserving plain string fallbacks", () => {
    const note = buildSearchEverythingResults("daily", createDeps()).find((result) => result.kind === "note")
    const preview = buildSearchEverythingPreview(note, "daily")

    assert.equal(preview?.title, "notes/inbox/daily-plan.md")
    assert.deepEqual(preview?.titleText, {
      text: "notes/inbox/daily-plan.md",
      highlights: [{ start: 12, end: 17 }],
    })
    assert.deepEqual(preview?.sections, [])
    assert.deepEqual(preview?.sectionsText, [])
  })

  test("folder preview title uses the full path and marks matching query ranges", () => {
    const folder = buildSearchEverythingResults("archive", createDeps()).find((result) => result.kind === "folder")
    const preview = buildSearchEverythingPreview(folder, "archive")

    assert.equal(preview?.title, "notes/archive")
    assert.deepEqual(preview?.titleText, {
      text: "notes/archive",
      highlights: [{ start: 6, end: 13 }],
    })
    assert.deepEqual(preview?.subtitleText, { text: "" })
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
    assert.deepEqual(preview?.sections, [])
    assert.doesNotMatch(JSON.stringify(preview), /Items|Folder|Contents|Path/u)
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

  test("file preview title uses the raw note file path", () => {
    const note = buildSearchEverythingResults("plan", createDeps()).find((result) => result.kind === "note")
    const preview = buildSearchEverythingPreview(note, "plan")

    assert.equal(preview?.title, "notes/inbox/daily-plan.md")
    assert.deepEqual(preview?.titleText, {
      text: "notes/inbox/daily-plan.md",
      highlights: [{ start: 18, end: 22 }],
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

    assert.equal(preview?.title, "notes/projects/client/brief.md")
    assert.equal(preview?.lines.length, 1)
    assert.match(line, /legal review creates launch blockers for the client rollout/u)
    assert.doesNotMatch(line, /Introductory material|Architecture notes/u)
    assert.deepEqual(preview?.sections, [])
    assert.deepEqual(preview?.sectionsText, [])
    assert.deepEqual(preview?.linesText, [
      { text: line, highlights: [{ start: matchStart, end: matchStart + "launch blockers".length }] },
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
    assert.deepEqual(preview?.sections, [])
    assert.doesNotMatch(JSON.stringify(preview), /Match|Path|Description/u)
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

    assert.equal(preview?.title, "notes/empty.md")
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

  test("returns filesystem-discovered empty user folders in Search Everything folder results", () => {
    const results = buildSearchEverythingResults("empty-client", {
      ...createDeps(),
      userFolderPaths: ["notes/projects/empty-client", "notes/projects/.hidden-child", "notes/.data"],
    })
    const folders = results.filter((result) => result.kind === "folder")

    assert.deepEqual(folders.map((folder) => folder.path), ["notes/projects/empty-client"])
    assert.deepEqual(folders[0], {
      kind: "folder",
      typeLabel: "folder",
      typeIcon: "folder",
      id: "folder:notes/projects/empty-client",
      path: "notes/projects/empty-client",
      name: "empty-client",
      label: "empty-client/",
      detail: "0 notes in notes/projects/empty-client",
      score: folders[0]?.score,
      noteCount: 0,
      previewLines: [],
    })
  })

  test("filters slash-prefixed command results to working editor commands from editor search", () => {
    assert.deepEqual(
      TUI_COMMANDS.map((command) => command.name),
      ["/new", "/delete", "/ai-describe", "/ai-process-queue", "/ai-status", "/find", "/replace", "/save", "/copy-all", "/replace-all", "/paste"],
    )

    const results = buildSearchEverythingResults("/", createDeps(), { commandContext: { screen: "editor" } })
    assert.deepEqual(
      results.filter((result) => result.kind === "command").map((result) => result.name),
      ["/ai-describe", "/ai-process-queue", "/ai-status", "/find", "/replace", "/save", "/copy-all", "/replace-all", "/paste"],
    )

    const maintenanceResults = buildSearchEverythingResults("/re", createDeps(), { commandContext: { screen: "editor" } })
    assert.deepEqual(maintenanceResults.filter((result) => result.kind === "command").map((result) => result.name), ["/replace", "/replace-all"])

    const subsequenceOnlyResults = buildSearchEverythingResults("/ae", createDeps())
    assert.equal(
      subsequenceOnlyResults.some((result) => result.kind === "command" && result.name === "/archive"),
      false,
    )
  })

  test("filters slash-prefixed command results to applicable manager commands from manager search", () => {
    const withoutSelection = buildSearchEverythingResults("/", createDeps(), { commandContext: { screen: "manager", managerSelection: "folder" } })
    assert.deepEqual(withoutSelection.filter((result) => result.kind === "command").map((result) => result.name), ["/new", "/ai-process-queue", "/ai-status"])

    const withNoteSelection = buildSearchEverythingResults("/", createDeps(), { commandContext: { screen: "manager", managerSelection: "note" } })
    assert.deepEqual(withNoteSelection.filter((result) => result.kind === "command").map((result) => result.name), ["/new", "/delete", "/ai-describe", "/ai-process-queue", "/ai-status"])
    assert.equal(withNoteSelection.some((result) => result.kind === "command" && ["/archive", "/rebuild", "/migrate"].includes(result.name)), false)
  })

  test("clipboard command metadata advertises Mode A terminal-native and whole-note commands", () => {
    const clipboardCommands = TUI_COMMANDS.filter((command) => ["/copy-all", "/replace-all", "/paste"].includes(command.name))

    assert.deepEqual(clipboardCommands.map((command) => command.name), ["/copy-all", "/replace-all", "/paste"])
    assert.deepEqual(clipboardCommands.map((command) => command.shortcut), [undefined, undefined, "Ctrl+Shift+V"])
    for (const command of clipboardCommands) {
      assert.doesNotMatch(`${command.description} ${command.usage} ${command.shortcut ?? ""}`, /Alt\+[CX]|\bF[6789]\b/u)
      assert.doesNotMatch(`${command.description} ${command.usage} ${command.shortcut ?? ""}`, /Ctrl\+Shift\+C[^\n]*(?:semantic|BlueNote|buffer)/iu)
    }
    assert.match(clipboardCommands.find((command) => command.name === "/copy-all")?.description ?? "", /full current note body.*desktop clipboard|desktop clipboard.*full current note body/i)
    assert.match(clipboardCommands.find((command) => command.name === "/replace-all")?.description ?? "", /replace.*full current note body.*desktop clipboard|desktop clipboard.*replace.*full current note body/i)
    assert.match(clipboardCommands.find((command) => command.name === "/paste")?.description ?? "", /Ctrl\+Shift\+V|terminal paste/i)
  })

  test("shows raw command help on highlighted command results", () => {
    const results = buildSearchEverythingResults("/find", createDeps())
    const preview = buildHighlightedSearchEverythingPreview(results, 0)

    assert.equal(results[0]?.kind, "command")
    assert.deepEqual(preview, {
      title: "/find",
      subtitle: "",
      lines: ["Find text in the active editor buffer", "/find <query>", "Ctrl+F"],
      sections: [],
    })
  })

  test("builds previews for highlighted note and content results", () => {
    const notePreview = buildHighlightedSearchEverythingPreview(buildSearchEverythingResults("daily", createDeps()), 0)
    assert.deepEqual(notePreview, {
      title: "notes/inbox/daily-plan.md",
      subtitle: "",
      lines: ["# Daily Plan", "Today body priorities and project focus."],
      sections: [],
    })

    const contentPreview = buildHighlightedSearchEverythingPreview(buildSearchEverythingResults("launch blockers", createDeps()), 0)
    assert.deepEqual(contentPreview, {
      title: "notes/projects/client/brief.md",
      subtitle: "",
      lines: ["...Launch blockers: legal review and design QA..."],
      sections: [],
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
