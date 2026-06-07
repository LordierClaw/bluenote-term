import { describe, test } from "bun:test"
import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import { writeFileSync } from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"

import { createAiConfigRepository, type AiConfig } from "../../../src/ai/config"
import { enqueueDescribeNoteJob } from "../../../src/ai/queue-service"
import { createAiQueueRepository } from "../../../src/ai/queue-repository"
import { ensureManagedRoot, getAiConfigPath } from "../../../src/storage/root-layout"
import { createNoteRepository } from "../../../src/storage/note-repository"
import { rebuildIndexes } from "../../../src/core/rebuild-indexes"
import { createSidecarRepository } from "../../../src/storage/sidecar-repository"
import { createDefaultWorkspaceController } from "../../../src/tui/app"
import {
  createWorkspaceController,
  editorRequiresDestructiveConfirmation,
  type WorkspaceControllerDependencies,
} from "../../../src/tui/workspace-controller"
import { buildManagerViewModel, routeManagerKey } from "../../../src/tui/render-manager"
import type { NoteManagerSummary } from "../../../src/tui/adapters/note-manager-adapter"
import { buildSearchEverythingPreview, type SearchEverythingResult } from "../../../src/tui/adapters/search-everything-adapter"
import { createInitialTuiState, type TuiNote } from "../../../src/tui/state"

function validAiConfig(overrides: Partial<AiConfig> = {}): AiConfig {
  return {
    version: 1,
    enabled: true,
    provider: "openai-compatible",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "***",
    model: "gpt-4o-mini",
    logging: {
      usage: true,
      conversations: false,
      results: true,
    },
    ...overrides,
  }
}

function validCodexAiConfig(overrides: Partial<AiConfig> = {}): AiConfig {
  return {
    version: 1,
    enabled: true,
    provider: "codex",
    model: "codex-test-model",
    logging: {
      usage: true,
      conversations: false,
      results: true,
    },
    ...overrides,
  } as AiConfig
}

async function withManagedRoot(name: string, callback: (rootPath: string) => Promise<void> | void): Promise<void> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), name))

  try {
    await callback(ensureManagedRoot(tempRoot))
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
}

function createFakeScheduler() {
  type ScheduledTask = { id: number; callback: () => void; delay: number; cleared: boolean }
  const tasks: ScheduledTask[] = []
  let nextId = 1

  return {
    tasks,
    setTimeout(callback: () => void, delay: number) {
      const task = { id: nextId++, callback, delay, cleared: false }
      tasks.push(task)
      return task.id
    },
    clearTimeout(handle: unknown) {
      const task = tasks.find((candidate) => candidate.id === handle)
      if (task) {
        task.cleared = true
      }
    },
    runNext() {
      const task = tasks.find((candidate) => !candidate.cleared)
      if (!task) {
        throw new Error("No scheduled task to run")
      }
      task.cleared = true
      task.callback()
    },
    activeTasks() {
      return tasks.filter((task) => !task.cleared)
    },
  }
}

const noteSummaries: NoteManagerSummary[] = [
  {
    key: "daily-plan",
    title: "Daily Plan",
    description: "Today priorities.",
    relativePath: "notes/inbox/daily-plan.md",
    body: "Original daily body",
  },
  {
    key: "archive-review",
    title: "Archive Review",
    description: "Old ideas.",
    relativePath: "notes/archive/archive-review.md",
    body: "Archive body",
  },
]

const notesByKey: Record<string, TuiNote> = {
  "daily-plan": {
    key: "daily-plan",
    title: "Daily Plan",
    description: "Today priorities.",
    relativePath: "notes/inbox/daily-plan.md",
    body: "Original daily body",
  },
  "archive-review": {
    key: "archive-review",
    title: "Archive Review",
    description: "Old ideas.",
    relativePath: "notes/archive/archive-review.md",
    body: "Archive body",
  },
}

const phaseSevenSummaries: NoteManagerSummary[] = [
  {
    key: "zebra-note",
    title: "Zebra Note",
    description: "Last normal note.",
    relativePath: "note/work/zebra.md",
  },
  {
    key: "alpha-note",
    title: "Alpha Note",
    description: "First normal note.",
    relativePath: "note/work/alpha.md",
  },
  {
    key: "nested-note",
    title: "Nested Note",
    description: "Nested normal note.",
    relativePath: "note/work/projects/nested.md",
  },
  {
    key: "older-draft",
    title: "Older Draft",
    description: "Older draft.",
    relativePath: "draft/older.md",
    createdAt: "2026-06-01T00:00:00.000Z",
  },
  {
    key: "newer-draft",
    title: "Newer Draft",
    description: "Newer draft.",
    relativePath: "draft/newer.md",
    createdAt: "2026-06-03T00:00:00.000Z",
  },
]

const phaseSevenNotesByKey: Record<string, TuiNote> = Object.fromEntries(
  phaseSevenSummaries.map((summary) => [
    summary.key,
    {
      key: summary.key,
      title: summary.title,
      description: summary.description,
      relativePath: summary.relativePath,
      body: `${summary.title} body`,
      createdAt: summary.createdAt,
    },
  ]),
)

function createDeps(overrides: Partial<WorkspaceControllerDependencies> = {}) {
  const calls: string[] = []
  const deps: WorkspaceControllerDependencies = {
    listNotes: () => {
      calls.push("list")
      return noteSummaries
    },
    showNote: (selector) => {
      calls.push(`show:${selector}`)
      return notesByKey[selector]
    },
    searchNotes: (query) => {
      calls.push(`search:${query}`)
      return []
    },
    commandHandlers: {
      "/new": () => {
        calls.push("command:/new")
      },
      "/archive": () => {
        calls.push("command:/archive")
      },
      "/delete": () => {
        calls.push("command:/delete")
      },
      "/rebuild": () => {
        calls.push("command:/rebuild")
      },
    },
    ...overrides,
  }

  return { deps, calls }
}

function commandResult(name: "/new" | "/archive" | "/delete" | "/rebuild" | "/quit" | "/find" | "/replace" | "/save"): SearchEverythingResult {
  return {
    kind: "command",
    id: `command:${name}`,
    label: name,
    detail: `Run ${name}`,
    score: 120,
    name,
    description: `Run ${name}`,
    usage: name,
  }
}

function openManagerFolderPath(controller: ReturnType<typeof createWorkspaceController>, folderPath: string): void {
  controller.showManager()
  let safety = 0
  while (controller.getState().manager.currentFolderPath !== "" && safety < 20) {
    controller.goBack()
    safety += 1
  }

  if (folderPath === "") {
    return
  }

  const directFolderIndex = controller.getState().manager.items.findIndex((item) => item.type === "folder" && item.relativePath === folderPath)
  if (directFolderIndex !== -1) {
    controller.focusManagerItem(directFolderIndex)
    assert.equal(controller.openFocusedManagerItem().blocked, false)
    return
  }

  let prefix = ""
  for (const part of folderPath.split("/")) {
    prefix = prefix ? `${prefix}/${part}` : part
    const folderIndex = controller.getState().manager.items.findIndex((item) => item.type === "folder" && item.relativePath === prefix)
    assert.notEqual(folderIndex, -1, `missing manager folder ${prefix}`)
    controller.focusManagerItem(folderIndex)
    assert.equal(controller.openFocusedManagerItem().blocked, false)
  }
}

function openInboxDaily(controller: ReturnType<typeof createWorkspaceController>): void {
  openManagerFolderPath(controller, "notes/inbox")
  const noteIndex = controller.getState().manager.items.findIndex((item) => item.type === "note" && item.key === "daily-plan")
  assert.notEqual(noteIndex, -1, "missing daily-plan manager row")
  controller.focusManagerItem(noteIndex)
  assert.equal(controller.openFocusedManagerItem().blocked, false)
}

async function flushBackgroundAi(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

function openArchiveReview(controller: ReturnType<typeof createWorkspaceController>, options?: { confirmed?: boolean }) {
  controller.showManager()
  if (controller.getState().manager.currentFolderPath !== "") {
    controller.goBack()
  }
  controller.focusManagerItem(0)
  controller.openFocusedManagerItem()
  controller.focusManagerItem(0)
  return controller.openFocusedManagerItem(options)
}

describe("TUI workspace controller", () => {
  test("manager opens at the current editor note directory for normal notes and drafts", () => {
    const normal = createWorkspaceController(createDeps({
      listNotes: () => phaseSevenSummaries,
      listNoteFolders: () => ["note/work", "note/work/projects"],
      showNote: (selector) => phaseSevenNotesByKey[selector],
      initialNote: phaseSevenNotesByKey["nested-note"],
    }).deps)

    normal.showManager()
    assert.equal(normal.getState().manager.currentFolderPath, "note/work/projects")

    const draft = createWorkspaceController(createDeps({
      listNotes: () => phaseSevenSummaries,
      listNoteFolders: () => ["note/work", "note/work/projects"],
      showNote: (selector) => phaseSevenNotesByKey[selector],
      initialNote: phaseSevenNotesByKey["newer-draft"],
    }).deps)

    draft.showManager()
    assert.equal(draft.getState().manager.currentFolderPath, "draft")
  })

  test("manager orders normal folders first alphabetically, then notes alphabetically", () => {
    const controller = createWorkspaceController(createDeps({
      listNotes: () => phaseSevenSummaries,
      listNoteFolders: () => ["note/work", "note/work/projects", "note/work/archive"],
      showNote: (selector) => phaseSevenNotesByKey[selector],
    }).deps)

    openManagerFolderPath(controller, "note/work")

    assert.deepEqual(
      controller.getState().manager.items.map((item) => `${item.type}:${item.relativePath}`),
      [
        "folder:note/work/archive",
        "folder:note/work/projects",
        "note:note/work/alpha.md",
        "note:note/work/zebra.md",
      ],
    )
  })

  test("manager orders draft notes by createdAt descending", () => {
    const controller = createWorkspaceController(createDeps({
      listNotes: () => phaseSevenSummaries,
      listNoteFolders: () => ["note/work", "note/work/projects"],
      showNote: (selector) => phaseSevenNotesByKey[selector],
    }).deps)

    openManagerFolderPath(controller, "draft")

    assert.deepEqual(
      controller.getState().manager.items.map((item) => item.key),
      ["newer-draft", "older-draft"],
    )
  })

  test("manager create-folder action is available only under note folders and creates only a folder", async () => {
    let folders = ["note/work"]
    const createFolderCalls: string[] = []
    const controller = createWorkspaceController(createDeps({
      listNotes: () => phaseSevenSummaries,
      listNoteFolders: () => folders,
      showNote: (selector) => phaseSevenNotesByKey[selector],
      createFolder: (folderRelativePath) => {
        createFolderCalls.push(folderRelativePath)
        folders = [...folders, folderRelativePath]
      },
    }).deps)

    openManagerFolderPath(controller, "note/work")
    controller.openManagerCreate()
    assert.equal(controller.getState().mode, "manager.create")
    controller.updateManagerCreateTitle("client-a")
    assert.equal((await controller.submitManagerCreate()).blocked, false)

    assert.deepEqual(createFolderCalls, ["note/work/client-a"])
    assert.equal(controller.getState().manager.currentFolderPath, "note/work")
    assert.equal(controller.getState().manager.items.some((item) => item.type === "folder" && item.relativePath === "note/work/client-a"), true)

    controller.goBack()
    controller.goBack()
    controller.openManagerCreate()
    assert.equal(controller.getState().mode, "manager.browse")
    assert.match(controller.getState().manager.status ?? "", /unavailable/)

    openManagerFolderPath(controller, "draft")
    controller.openManagerCreate()
    assert.equal(controller.getState().mode, "manager.browse")
    assert.equal(controller.getState().manager.status, "Folder creation is unavailable in draft")

    const legacySummaries = [...phaseSevenSummaries, { key: "legacy-daily", title: "Legacy Daily", description: "Legacy", relativePath: "notes/inbox/daily.md" }]
    const legacyController = createWorkspaceController(createDeps({
      listNotes: () => legacySummaries,
      listNoteFolders: () => ["notes/inbox"],
      showNote: (selector) => phaseSevenNotesByKey[selector],
    }).deps)
    openManagerFolderPath(legacyController, "notes/inbox")
    legacyController.openManagerCreate()
    assert.equal(legacyController.getState().mode, "manager.browse")
    assert.match(legacyController.getState().manager.status ?? "", /unavailable/)
  })

  test("initial TUI manager preview visibility defaults to visible", () => {
    assert.equal(createInitialTuiState().manager.previewVisible, true)
  })

  test("starts on manager and loads manager items from the adapter", () => {
    const { deps, calls } = createDeps()
    const controller = createWorkspaceController(deps)

    assert.equal(controller.getState().screen, "manager")
    assert.deepEqual(
      controller.getState().manager.items.map((item) => `${item.type}:${item.key}`),
      ["folder:notes/archive", "folder:notes/inbox"],
    )
    assert.deepEqual(calls, ["list"])
  })

  test("keeps legacy notes folders reachable when draft notes exist", () => {
    const mixedSummaries: NoteManagerSummary[] = [
      ...noteSummaries,
      {
        key: "draft-a",
        title: "draft-a",
        description: "",
        relativePath: "draft/draft-a.md",
        body: "Draft body",
      },
    ]
    const { deps } = createDeps({
      listNotes: () => mixedSummaries,
      showNote: (selector) => selector === "draft-a"
        ? {
            key: "draft-a",
            title: "draft-a",
            description: "",
            relativePath: "draft/draft-a.md",
            body: "Draft body",
          }
        : notesByKey[selector],
    })
    const controller = createWorkspaceController(deps)

    assert.deepEqual(
      controller.getState().manager.items.map((item) => `${item.type}:${item.relativePath}`),
      ["folder:draft", "folder:note", "folder:notes"],
    )

    openManagerFolderPath(controller, "notes/inbox")

    assert.deepEqual(
      controller.getState().manager.items.map((item) => `${item.type}:${item.relativePath}`),
      ["note:notes/inbox/daily-plan.md"],
    )
  })

  test("accepts an initial AI status dependency for startup rendering", () => {
    const { deps } = createDeps({ initialAiStatus: { kind: "connected", model: "gpt-4o-mini" } })
    const controller = createWorkspaceController(deps)

    assert.equal(buildManagerViewModel(controller.getState()).aiStatus.text, "AI: connected · gpt-4o-mini")
  })

  test("updates latest-opened whenever editor opens a note", () => {
    const openedRelativePaths: string[] = []
    const { deps } = createDeps({
      recordLatestOpenedNote: (note) => {
        openedRelativePaths.push(note.relativePath)
      },
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)

    assert.equal(controller.getState().screen, "editor")
    assert.deepEqual(openedRelativePaths, ["notes/inbox/daily-plan.md"])
  })

  test("opens editor even when latest-opened recording fails", () => {
    const { deps } = createDeps({
      recordLatestOpenedNote: () => {
        throw new Error("latest-opened write failed")
      },
    })
    const controller = createWorkspaceController(deps)

    assert.doesNotThrow(() => openInboxDaily(controller))
    assert.equal(controller.getState().screen, "editor")
    assert.equal(controller.getState().editor?.note.relativePath, "notes/inbox/daily-plan.md")
  })

  test("default TUI controller reads configured AI model at startup without running jobs", async () => {
    await withManagedRoot("bluenote-tui-ai-status-", (rootPath) => {
      createAiConfigRepository(rootPath).write(validAiConfig({ model: "claude-3-5-haiku" }))

      const controller = createDefaultWorkspaceController({
        rootPath,
        cleanupStaleAtomicTemps: () => {},
        clipboard: {
          name: "test clipboard",
          canRead: true,
          canWrite: true,
          readText: () => "",
          writeText: () => {},
        },
      })

      assert.equal(buildManagerViewModel(controller.getState()).aiStatus.text, "AI: connected · claude-3-5-haiku")
    })
  })

  test("default TUI controller reports an AI error instead of throwing on malformed startup config", async () => {
    await withManagedRoot("bluenote-tui-ai-config-error-", (rootPath) => {
      writeFileSync(getAiConfigPath(rootPath), "{ malformed-json", { encoding: "utf8", mode: 0o600 })

      const controller = createDefaultWorkspaceController({
        rootPath,
        cleanupStaleAtomicTemps: () => {},
        clipboard: {
          name: "test clipboard",
          canRead: true,
          canWrite: true,
          readText: () => "",
          writeText: () => {},
        },
      })

      assert.deepEqual(controller.getState().ai, { kind: "error", reason: "config invalid" })
      assert.equal(buildManagerViewModel(controller.getState()).aiStatus.text, "AI: error · config invalid")
    })
  })

  test("default TUI controller reports setup-required Codex config without marking AI connected", async () => {
    await withManagedRoot("bluenote-tui-ai-codex-setup-required-", (rootPath) => {
      createAiConfigRepository(rootPath).write(validCodexAiConfig())

      const controller = createDefaultWorkspaceController({
        rootPath,
        fetch: (() => {
          throw new Error("TUI startup must not call Codex auth or provider endpoints")
        }) as unknown as typeof fetch,
        cleanupStaleAtomicTemps: () => {},
        clipboard: {
          name: "test clipboard",
          canRead: true,
          canWrite: true,
          readText: () => "",
          writeText: () => {},
        },
      })

      const ai = controller.getState().ai
      if (!ai) {
        throw new Error("Expected startup AI status")
      }
      assert.deepEqual(ai, { kind: "auth-required", reason: "auth required · run bn ai codex auth login", queue: { queued: 0, failed: 0 } })
      assert.equal(buildManagerViewModel(controller.getState()).aiStatus.text, "AI: auth required · run bn ai codex auth login")
      assert.doesNotMatch(buildManagerViewModel(controller.getState()).aiStatus.text, /connected/)
    })
  })

  test("Codex auth-required startup scan leaves queued work pending instead of marking it failed", async () => {
    await withManagedRoot("bluenote-tui-ai-codex-startup-queue-auth-required-", async (rootPath) => {
      createAiConfigRepository(rootPath).write(validCodexAiConfig())
      const repository = createNoteRepository(rootPath)
      repository.create({
        frontmatter: {
          id: "daily-plan",
          schemaVersion: 1,
          title: "Daily Plan",
          mode: "plain",
          tags: [],
          createdAt: "2026-06-01T10:00:00.000Z",
          updatedAt: "2026-06-01T10:00:00.000Z",
        },
        body: "Original daily body\n",
        destination: { type: "normal", folderRelativePath: "note" },
      })
      enqueueDescribeNoteJob(rootPath, {
        key: "daily-plan",
        relativePath: "notes/inbox/daily-plan.md",
        title: "Daily Plan",
        body: "Original daily body\n",
        currentDescription: "",
        promptHash: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
      })
      let providerCalls = 0
      const aiStartupScheduler = createFakeScheduler()
      const controller = createDefaultWorkspaceController({
        rootPath,
        aiStartupScheduler,
        fetch: (() => {
          providerCalls += 1
          throw new Error("startup must not call auth/provider while auth is required")
        }) as unknown as typeof fetch,
        cleanupStaleAtomicTemps: () => {},
        clipboard: {
          name: "test clipboard",
          canRead: true,
          canWrite: true,
          readText: () => "",
          writeText: () => {},
        },
      })

      assert.deepEqual(controller.getState().ai, { kind: "auth-required", reason: "auth required · run bn ai codex auth login", queue: { queued: 1, failed: 0 } })
      aiStartupScheduler.runNext()
      await flushBackgroundAi()

      assert.equal(providerCalls, 0)
      assert.deepEqual(controller.getState().ai, { kind: "auth-required", reason: "auth required · run bn ai codex auth login", queue: { queued: 1, failed: 0 } })
      const queue = createAiQueueRepository(rootPath).read()
      assert.deepEqual(queue.jobs.map((job) => job.status), ["pending"])
    })
  })

  test("Codex auth-required startup keeps input navigation save autosave and quit off provider work", async () => {
    await withManagedRoot("bluenote-tui-ai-codex-nonblocking-", async (rootPath) => {
      createAiConfigRepository(rootPath).write(validCodexAiConfig())
      const repository = createNoteRepository(rootPath)
      repository.create({
        frontmatter: {
          id: "daily-plan",
          schemaVersion: 1,
          title: "Daily Plan",
          mode: "plain",
          tags: [],
          createdAt: "2026-06-01T10:00:00.000Z",
          updatedAt: "2026-06-01T10:00:00.000Z",
        },
        body: "Original daily body\n",
        destination: { type: "normal", folderRelativePath: "note" },
      })
      rebuildIndexes({ override: rootPath })
      let providerCalls = 0
      const autosaveScheduler = createFakeScheduler()
      const aiIdleScheduler = createFakeScheduler()
      const controller = createDefaultWorkspaceController({
        rootPath,
        autosaveScheduler,
        aiIdleScheduler,
        fetch: (() => {
          providerCalls += 1
          return new Promise<Response>(() => {})
        }) as unknown as typeof fetch,
        cleanupStaleAtomicTemps: () => {},
        clipboard: {
          name: "test clipboard",
          canRead: true,
          canWrite: true,
          readText: () => "",
          writeText: () => {},
        },
      })

      assert.equal(providerCalls, 0)
      controller.focusManagerItem(1)
      assert.deepEqual(controller.openFocusedManagerItem(), { blocked: false })
      controller.focusManagerItem(0)
      assert.deepEqual(controller.openFocusedManagerItem(), { blocked: false })
      controller.insertEditorText(" changed")
      assert.equal(providerCalls, 0)
      assert.deepEqual(controller.runCommand("/save"), { blocked: false })
      assert.equal(providerCalls, 0)
      await flushBackgroundAi()
      assert.equal(providerCalls, 0)

      controller.insertEditorText(" autosaved")
      autosaveScheduler.runNext()
      await flushBackgroundAi()
      assert.equal(providerCalls, 0)
      assert.deepEqual(controller.showManager(), { blocked: false })
      assert.deepEqual(controller.requestQuit({ confirmed: true }), { blocked: false })
      assert.equal(providerCalls, 0)
    })
  })

  test("Codex /ai-describe missing auth failure is fast sanitized and does not block save", async () => {
    await withManagedRoot("bluenote-tui-ai-codex-describe-missing-auth-", async (rootPath) => {
      createAiConfigRepository(rootPath).write(validCodexAiConfig())
      const repository = createNoteRepository(rootPath)
      repository.create({
        frontmatter: {
          id: "daily-plan",
          schemaVersion: 1,
          title: "Daily Plan",
          mode: "plain",
          tags: [],
          createdAt: "2026-06-01T10:00:00.000Z",
          updatedAt: "2026-06-01T10:00:00.000Z",
        },
        body: "Original daily body\n",
        destination: { type: "normal", folderRelativePath: "note" },
      })
      rebuildIndexes({ override: rootPath })
      let providerCalls = 0
      const controller = createDefaultWorkspaceController({
        rootPath,
        fetch: (() => {
          providerCalls += 1
          throw new Error("unexpected provider call with secret-token")
        }) as unknown as typeof fetch,
        cleanupStaleAtomicTemps: () => {},
        clipboard: {
          name: "test clipboard",
          canRead: true,
          canWrite: true,
          readText: () => "",
          writeText: () => {},
        },
      })
      assert.deepEqual(controller.showManager(), { blocked: false })
      openManagerFolderPath(controller, "note")
      const dailyIndex = controller.getState().manager.items.findIndex((item) => item.type === "note" && item.key === "daily-plan")
      assert.notEqual(dailyIndex, -1)
      controller.focusManagerItem(dailyIndex)
      controller.openFocusedManagerItem()

      assert.deepEqual(controller.runCommand("/ai-describe"), { blocked: false })
      assert.deepEqual(controller.getState().ai, { kind: "running", key: "daily-plan", queue: { queued: 0, failed: 0 } })
      controller.insertEditorText(" saved while codex auth fails")
      assert.deepEqual(controller.runCommand("/save"), { blocked: false })
      await flushBackgroundAi()

      assert.equal(providerCalls, 0)
      const ai = controller.getState().ai
      assert.equal(ai?.kind, "error")
      const reason = ai && ai.kind === "error" ? ai.reason : ""
      assert.match(reason, /Codex auth setup is required|Codex auth required/u)
      assert.doesNotMatch(reason, /secret-token|accessToken|refreshToken/u)
      assert.equal(controller.getState().editor?.dirty, false)
    })
  })

  test("default TUI queue failure persists sanitized lastError without provider secrets", async () => {
    await withManagedRoot("bluenote-tui-ai-queue-sanitized-error-", async (rootPath) => {
      createAiConfigRepository(rootPath).write(validAiConfig({ apiKey: "test-token" }))
      const repository = createNoteRepository(rootPath)
      const created = repository.create({
        frontmatter: {
          id: "daily-plan",
          schemaVersion: 1,
          title: "Daily Plan",
          mode: "plain",
          tags: [],
          createdAt: "2026-06-01T10:00:00.000Z",
          updatedAt: "2026-06-01T10:00:00.000Z",
        },
        body: "Daily priorities and follow-ups.\n",
      })
      const sidecar = createSidecarRepository(rootPath).read("daily-plan")
      enqueueDescribeNoteJob(rootPath, {
        key: "daily-plan",
        relativePath: created.relativePath,
        title: sidecar.title,
        body: "Daily priorities and follow-ups.\n",
        currentDescription: sidecar.description,
        promptHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      })

      const controller = createDefaultWorkspaceController({
        rootPath,
        cleanupStaleAtomicTemps: () => {},
        aiClient: {
          async createChatCompletion() {
            throw new Error("401 test-token rejected Bearer abc.def.ghi and ***")
          },
        },
        clipboard: {
          name: "test clipboard",
          canRead: true,
          canWrite: true,
          readText: () => "",
          writeText: () => {},
        },
      })

      assert.deepEqual(controller.runCommand("/ai-process-queue"), { blocked: false })
      await flushBackgroundAi()

      const [job] = createAiQueueRepository(rootPath).read().jobs
      assert.equal(job.status, "failed")
      assert.equal(job.lastError, "401 [redacted] rejected Bearer [redacted] and [redacted]")
      assert.doesNotMatch(job.lastError ?? "", /test-token|abc\.def\.ghi|\*\*\*/u)
    })
  })

  test("/ai-describe starts background work, closes search, and updates status on success", async () => {
    let resolveDescribe!: (value: { key: string; status: "applied"; description: string }) => void
    const describePromise = new Promise<{ key: string; status: "applied"; description: string }>((resolve) => {
      resolveDescribe = resolve
    })
    let latestSummaries = noteSummaries
    const calls: string[] = []
    const { deps } = createDeps({
      listNotes: () => {
        calls.push("list")
        return latestSummaries
      },
      aiActions: {
        describeNote: (selector) => {
          calls.push(`ai-describe:${selector}`)
          return describePromise
        },
      },
    })
    const controller = createWorkspaceController(deps)
    openInboxDaily(controller)
    controller.showManager()
    controller.openSearch("/ai-describe")

    const result = controller.runCommand("/ai-describe")

    assert.deepEqual(result, { blocked: false })
    assert.equal(controller.getState().screen, "manager")
    assert.equal(controller.getState().mode, "manager.browse")
    assert.deepEqual(controller.getState().ai, { kind: "running", key: "daily-plan" })
    assert.deepEqual(calls.filter((call) => call.startsWith("ai-describe")), ["ai-describe:daily-plan"])
    controller.openManagerFilter()
    assert.equal(controller.getState().mode, "manager.filter")

    latestSummaries = noteSummaries.map((summary) => summary.key === "daily-plan" ? { ...summary, description: "AI summary" } : summary)
    resolveDescribe({ key: "daily-plan", status: "applied", description: "AI summary" })
    await describePromise
    await flushBackgroundAi()

    assert.deepEqual(controller.getState().ai, { kind: "updated", key: "daily-plan", queue: { queued: 0, failed: 0 } })
    assert.equal(controller.getState().manager.items.some((item) => item.type === "note" && item.description === "AI summary"), true)
  })

  test("/ai-describe from editor keeps editing usable and reports sanitized errors", async () => {
    let rejectDescribe!: (error: Error) => void
    const describePromise = new Promise<never>((_, reject) => {
      rejectDescribe = reject
    })
    const { deps } = createDeps({
      aiActions: {
        describeNote: () => describePromise,
      },
    })
    const controller = createWorkspaceController(deps)
    openInboxDaily(controller)
    controller.openSearch("/ai-describe")

    assert.deepEqual(controller.runCommand("/ai-describe"), { blocked: false })
    assert.equal(controller.getState().screen, "editor")
    assert.equal(controller.getState().mode, "editor.body")
    assert.deepEqual(controller.getState().ai, { kind: "running", key: "daily-plan" })

    controller.insertEditorText(" while ai runs")
    assert.match(controller.getState().editor?.body ?? "", /while ai runs$/u)

    rejectDescribe(new Error("401 token *** rejected"))
    await describePromise.catch(() => undefined)
    await flushBackgroundAi()

    assert.deepEqual(controller.getState().ai, { kind: "error", reason: "401 token [redacted] rejected", queue: { queued: 0, failed: 0 } })
    assert.equal(controller.getState().screen, "editor")
    assert.equal(controller.getState().mode, "editor.body")
  })

  test("/ai-process-queue runs in the background and reports updated count", async () => {
    let resolveQueue!: (value: { applied: number; failed: number; remaining: number }) => void
    const queuePromise = new Promise<{ applied: number; failed: number; remaining: number }>((resolve) => {
      resolveQueue = resolve
    })
    const { deps } = createDeps({
      aiActions: {
        processQueue: () => queuePromise,
      },
    })
    const controller = createWorkspaceController(deps)

    assert.deepEqual(controller.runCommand("/ai-process-queue"), { blocked: false })
    assert.deepEqual(controller.getState().ai, { kind: "running" })
    controller.openManagerFilter()
    assert.equal(controller.getState().mode, "manager.filter")

    resolveQueue({ applied: 2, failed: 0, remaining: 0 })
    await queuePromise
    await flushBackgroundAi()

    assert.deepEqual(controller.getState().ai, { kind: "updated", count: 2, queue: { queued: 0, failed: 0 } })
  })

  test("/ai-process-queue reports retry failures even when cumulative failed count stays unchanged", async () => {
    const { deps } = createDeps({
      initialAiStatus: { kind: "connected", model: "gpt-4o-mini", queue: { queued: 1, failed: 1 } },
      aiActions: {
        processQueue: async () => ({ applied: 0, failed: 1, remaining: 1 }),
      },
    })
    const controller = createWorkspaceController(deps)

    assert.deepEqual(controller.runCommand("/ai-process-queue"), { blocked: false })
    await flushBackgroundAi()

    assert.deepEqual(controller.getState().ai, { kind: "error", reason: "1 failed", queue: { queued: 1, failed: 1 } })
  })

  test("/ai-process-queue does not start duplicate queue processing while one run is in flight", async () => {
    let resolveQueue!: (value: { applied: number; failed: number; remaining: number }) => void
    const queuePromise = new Promise<{ applied: number; failed: number; remaining: number }>((resolve) => {
      resolveQueue = resolve
    })
    let processQueueCalls = 0
    const { deps } = createDeps({
      aiActions: {
        processQueue: () => {
          processQueueCalls += 1
          return queuePromise
        },
      },
    })
    const controller = createWorkspaceController(deps)

    assert.deepEqual(controller.runCommand("/ai-process-queue"), { blocked: false })
    assert.deepEqual(controller.runCommand("/ai-process-queue"), { blocked: false })
    assert.equal(processQueueCalls, 1)
    assert.deepEqual(controller.getState().ai, { kind: "running", queue: { queued: 0, failed: 0 } })

    resolveQueue({ applied: 2, failed: 0, remaining: 0 })
    await queuePromise
    await flushBackgroundAi()

    assert.equal(processQueueCalls, 1)
    assert.deepEqual(controller.getState().ai, { kind: "updated", count: 2, queue: { queued: 0, failed: 0 } })
  })

  test("AI idle queued during in-flight queue processing runs after the current processor finishes", async () => {
    const aiIdleScheduler = createFakeScheduler()
    let resolveFirstQueue!: (value: { applied: number; failed: number; queued: number; remaining: number }) => void
    const firstQueuePromise = new Promise<{ applied: number; failed: number; queued: number; remaining: number }>((resolve) => {
      resolveFirstQueue = resolve
    })
    let resolveSecondQueue!: (value: { applied: number; failed: number; queued: number; remaining: number }) => void
    const secondQueuePromise = new Promise<{ applied: number; failed: number; queued: number; remaining: number }>((resolve) => {
      resolveSecondQueue = resolve
    })
    const calls: string[] = []
    const { deps } = createDeps({
      initialAiStatus: { kind: "connected", model: "gpt-4o-mini", queue: { queued: 1, failed: 0 } },
      aiIdleScheduler,
      aiActions: {
        enqueueNote: (selector) => {
          calls.push(`enqueue:${selector}`)
          return { queued: 1, failed: 0 }
        },
        processQueue: () => {
          calls.push("process")
          return calls.filter((call) => call === "process").length === 1 ? firstQueuePromise : secondQueuePromise
        },
      },
      persistEditorBody: (note, body) => ({ ...note, body }),
    })
    const controller = createWorkspaceController(deps)

    assert.deepEqual(controller.runCommand("/ai-process-queue"), { blocked: false })
    assert.deepEqual(calls, ["process"])

    openInboxDaily(controller)
    controller.updateEditorBody("queued while first process still runs")
    assert.deepEqual(await controller.saveEditor(), { blocked: false })
    aiIdleScheduler.runNext()
    assert.deepEqual(calls, ["process", "enqueue:daily-plan"])

    resolveFirstQueue({ applied: 1, failed: 0, queued: 1, remaining: 1 })
    await firstQueuePromise
    await flushBackgroundAi()
    assert.deepEqual(calls, ["process", "enqueue:daily-plan", "process"])

    resolveSecondQueue({ applied: 1, failed: 0, queued: 0, remaining: 0 })
    await secondQueuePromise
    await flushBackgroundAi()
    assert.deepEqual(controller.getState().ai, { kind: "updated", count: 1, queue: { queued: 0, failed: 0 } })
  })

  test("stale AI idle enqueue drains queue without overwriting newer explicit AI status", async () => {
    const aiIdleScheduler = createFakeScheduler()
    let resolveEnqueue!: (value: { queued: number; failed: number }) => void
    const enqueuePromise = new Promise<{ queued: number; failed: number }>((resolve) => {
      resolveEnqueue = resolve
    })
    let resolveDescribe!: (value: { key: string; status: "applied" }) => void
    const describePromise = new Promise<{ key: string; status: "applied" }>((resolve) => {
      resolveDescribe = resolve
    })
    const calls: string[] = []
    const { deps } = createDeps({
      initialAiStatus: { kind: "connected", model: "gpt-4o-mini" },
      aiIdleScheduler,
      aiActions: {
        enqueueNote: (selector) => {
          calls.push(`enqueue:${selector}`)
          return enqueuePromise
        },
        describeNote: (selector) => {
          calls.push(`describe:${selector}`)
          return describePromise
        },
        processQueue: async () => {
          calls.push("process")
          return { applied: 1, failed: 0, queued: 0, remaining: 0 }
        },
      },
      persistEditorBody: (note, body) => ({ ...note, body }),
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("idle enqueue resolves after explicit command")
    assert.deepEqual(await controller.saveEditor(), { blocked: false })
    aiIdleScheduler.runNext()
    assert.deepEqual(calls, ["enqueue:daily-plan"])

    assert.deepEqual(controller.runCommand("/ai-describe"), { blocked: false })
    assert.deepEqual(controller.getState().ai, { kind: "running", key: "daily-plan", queue: { queued: 0, failed: 0 } })
    assert.deepEqual(calls, ["enqueue:daily-plan", "describe:daily-plan"])

    resolveEnqueue({ queued: 1, failed: 0 })
    await enqueuePromise
    await flushBackgroundAi()
    assert.deepEqual(calls, ["enqueue:daily-plan", "describe:daily-plan", "process"])
    assert.deepEqual(controller.getState().ai, { kind: "running", key: "daily-plan", queue: { queued: 0, failed: 0 } })

    resolveDescribe({ key: "daily-plan", status: "applied" })
    await describePromise
    await flushBackgroundAi()
    assert.deepEqual(controller.getState().ai, { kind: "updated", key: "daily-plan", queue: { queued: 0, failed: 0 } })
  })

  test("deferred AI idle queue rerun does not overwrite a newer explicit AI status", async () => {
    const aiIdleScheduler = createFakeScheduler()
    let resolveFirstQueue!: (value: { applied: number; failed: number; queued: number; remaining: number }) => void
    const firstQueuePromise = new Promise<{ applied: number; failed: number; queued: number; remaining: number }>((resolve) => {
      resolveFirstQueue = resolve
    })
    let resolveSecondQueue!: (value: { applied: number; failed: number; queued: number; remaining: number }) => void
    const secondQueuePromise = new Promise<{ applied: number; failed: number; queued: number; remaining: number }>((resolve) => {
      resolveSecondQueue = resolve
    })
    let resolveDescribe!: (value: { key: string; status: "applied" }) => void
    const describePromise = new Promise<{ key: string; status: "applied" }>((resolve) => {
      resolveDescribe = resolve
    })
    const calls: string[] = []
    const { deps } = createDeps({
      initialAiStatus: { kind: "connected", model: "gpt-4o-mini", queue: { queued: 1, failed: 0 } },
      aiIdleScheduler,
      aiActions: {
        enqueueNote: (selector) => {
          calls.push(`enqueue:${selector}`)
          return { queued: 1, failed: 0 }
        },
        describeNote: (selector) => {
          calls.push(`describe:${selector}`)
          return describePromise
        },
        processQueue: () => {
          calls.push("process")
          return calls.filter((call) => call === "process").length === 1 ? firstQueuePromise : secondQueuePromise
        },
      },
      persistEditorBody: (note, body) => ({ ...note, body }),
    })
    const controller = createWorkspaceController(deps)

    assert.deepEqual(controller.runCommand("/ai-process-queue"), { blocked: false })
    openInboxDaily(controller)
    controller.updateEditorBody("queue rerun requested before explicit command")
    assert.deepEqual(await controller.saveEditor(), { blocked: false })
    aiIdleScheduler.runNext()
    assert.deepEqual(calls, ["process", "enqueue:daily-plan"])

    assert.deepEqual(controller.runCommand("/ai-describe"), { blocked: false })
    assert.deepEqual(controller.getState().ai, { kind: "running", key: "daily-plan", queue: { queued: 1, failed: 0 } })

    resolveFirstQueue({ applied: 1, failed: 0, queued: 1, remaining: 1 })
    await firstQueuePromise
    await flushBackgroundAi()
    assert.deepEqual(calls, ["process", "enqueue:daily-plan", "describe:daily-plan", "process"])
    assert.deepEqual(controller.getState().ai, { kind: "running", key: "daily-plan", queue: { queued: 1, failed: 0 } })

    resolveSecondQueue({ applied: 1, failed: 0, queued: 0, remaining: 0 })
    await secondQueuePromise
    await flushBackgroundAi()
    assert.deepEqual(controller.getState().ai, { kind: "running", key: "daily-plan", queue: { queued: 0, failed: 0 } })

    resolveDescribe({ key: "daily-plan", status: "applied" })
    await describePromise
    await flushBackgroundAi()
    assert.deepEqual(controller.getState().ai, { kind: "updated", key: "daily-plan", queue: { queued: 0, failed: 0 } })
  })

  test("AI success with failed manager refresh reports an error without leaking an unhandled rejection", async () => {
    let resolveDescribe!: (value: { key: string; status: "applied" }) => void
    const describePromise = new Promise<{ key: string; status: "applied" }>((resolve) => {
      resolveDescribe = resolve
    })
    let failRefresh = false
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason)
    }
    process.on("unhandledRejection", onUnhandled)

    try {
      const { deps } = createDeps({
        listNotes: () => {
          if (failRefresh) {
            throw new Error("refresh failed sk-testsecret123")
          }
          return noteSummaries
        },
        aiActions: {
          describeNote: () => describePromise,
        },
      })
      const controller = createWorkspaceController(deps)
      openInboxDaily(controller)

      assert.deepEqual(controller.runCommand("/ai-describe"), { blocked: false })
      assert.deepEqual(controller.getState().ai, { kind: "running", key: "daily-plan" })

      failRefresh = true
      resolveDescribe({ key: "daily-plan", status: "applied" })
      await describePromise
      await flushBackgroundAi()

      assert.deepEqual(controller.getState().ai, { kind: "error", reason: "refresh failed [redacted]", queue: { queued: 0, failed: 0 } })
      assert.deepEqual(unhandled, [])
    } finally {
      process.off("unhandledRejection", onUnhandled)
    }
  })

  test("overlapping AI commands keep older completion from overwriting newer status", async () => {
    let resolveDescribe!: (value: { key: string; status: "applied" }) => void
    const describePromise = new Promise<{ key: string; status: "applied" }>((resolve) => {
      resolveDescribe = resolve
    })
    let resolveQueue!: (value: { applied: number; failed: number; remaining: number }) => void
    const queuePromise = new Promise<{ applied: number; failed: number; remaining: number }>((resolve) => {
      resolveQueue = resolve
    })
    const { deps } = createDeps({
      aiActions: {
        describeNote: () => describePromise,
        processQueue: () => queuePromise,
      },
    })
    const controller = createWorkspaceController(deps)
    openInboxDaily(controller)

    assert.deepEqual(controller.runCommand("/ai-describe"), { blocked: false })
    assert.deepEqual(controller.getState().ai, { kind: "running", key: "daily-plan" })
    assert.deepEqual(controller.runCommand("/ai-process-queue"), { blocked: false })
    assert.deepEqual(controller.getState().ai, { kind: "running", queue: { queued: 0, failed: 0 } })

    resolveQueue({ applied: 3, failed: 0, remaining: 0 })
    await queuePromise
    await flushBackgroundAi()
    assert.deepEqual(controller.getState().ai, { kind: "updated", count: 3, queue: { queued: 0, failed: 0 } })

    resolveDescribe({ key: "daily-plan", status: "applied" })
    await describePromise
    await flushBackgroundAi()

    assert.deepEqual(controller.getState().ai, { kind: "updated", count: 3, queue: { queued: 0, failed: 0 } })
  })

  test("AI non-blocking: unresolved describe work does not block manager navigation, note switching, quit, or dispose", () => {
    const neverResolves = new Promise<{ key: string; status: "applied" }>(() => {})
    const { deps } = createDeps({
      aiActions: {
        describeNote: () => neverResolves,
      },
    })
    const controller = createWorkspaceController(deps)
    openInboxDaily(controller)

    assert.deepEqual(controller.runCommand("/ai-describe"), { blocked: false })
    assert.deepEqual(controller.getState().ai, { kind: "running", key: "daily-plan" })

    assert.deepEqual(controller.showManager(), { blocked: false })
    assert.equal(controller.getState().screen, "manager")

    assert.deepEqual(openArchiveReview(controller), { blocked: false })
    assert.equal(controller.getState().screen, "editor")
    assert.equal(controller.getState().editor?.note.key, "archive-review")

    assert.deepEqual(controller.requestQuit(), { blocked: false })
    assert.deepEqual(controller.runCommand("/quit"), { blocked: false })
    assert.doesNotThrow(() => controller.dispose())
  })

  test("AI non-blocking: late describe completion cannot mutate the active editor after note navigation", async () => {
    let resolveDescribe!: (value: { key: string; status: "applied"; description: string }) => void
    const describePromise = new Promise<{ key: string; status: "applied"; description: string }>((resolve) => {
      resolveDescribe = resolve
    })
    let latestSummaries = noteSummaries
    const { deps } = createDeps({
      listNotes: () => latestSummaries,
      aiActions: {
        describeNote: () => describePromise,
      },
    })
    const controller = createWorkspaceController(deps)
    openInboxDaily(controller)

    assert.deepEqual(controller.runCommand("/ai-describe"), { blocked: false })
    assert.deepEqual(controller.showManager(), { blocked: false })
    assert.deepEqual(openArchiveReview(controller), { blocked: false })
    assert.equal(controller.getState().editor?.note.key, "archive-review")
    assert.equal(controller.getState().editor?.body, "Archive body")

    latestSummaries = noteSummaries.map((summary) => summary.key === "daily-plan" ? { ...summary, description: "Late AI summary" } : summary)
    resolveDescribe({ key: "daily-plan", status: "applied", description: "Late AI summary" })
    await describePromise
    await flushBackgroundAi()

    assert.equal(controller.getState().editor?.note.key, "archive-review")
    assert.equal(controller.getState().editor?.body, "Archive body")
  })

  test("loads empty user folders through the workspace discovery boundary without leaking hidden internal folders", () => {
    const { deps, calls } = createDeps({
      listNoteFolders: () => {
        calls.push("folders")
        return [
          "notes/projects/empty-client",
          "notes/.data",
          "notes/.cache/scratch",
          "notes/projects/.hidden-child",
        ]
      },
    })
    const controller = createWorkspaceController(deps)

    assert.deepEqual(
      controller.getState().manager.items.map((item) => `${item.type}:${item.relativePath}`),
      [
        "folder:notes/archive",
        "folder:notes/inbox",
        "folder:notes/projects",
      ],
    )
    assert.deepEqual(calls, ["list", "folders"])

    controller.focusManagerItem(2)
    assert.equal(controller.openFocusedManagerItem().blocked, false)
    assert.deepEqual(controller.getState().manager.items.map((item) => `${item.type}:${item.relativePath}`), [
      "folder:notes/projects/empty-client",
    ])
  })

  test("opening a note preserves updatedAt metadata for editor chrome", () => {
    const controller = createWorkspaceController({
      listNotes: () => [
        {
          key: "daily-plan",
          title: "Daily Plan",
          description: "Today priorities.",
          relativePath: "notes/inbox/daily-plan.md",
        },
      ],
      showNote: () => ({
        key: "daily-plan",
        title: "Daily Plan",
        description: "Today priorities.",
        relativePath: "notes/inbox/daily-plan.md",
        body: "# Daily Plan",
        updatedAt: "2026-05-28T10:30:00.000Z",
      }),
      searchNotes: () => [],
    })

    controller.refreshManager()
    controller.openFocusedManagerItem()
    controller.openFocusedManagerItem()

    assert.equal(controller.getState().editor?.note.updatedAt, "2026-05-28T10:30:00.000Z")
  })

  test("whole-note clipboard commands copy all and replace all from desktop clipboard", () => {
    let clipboardText = "Replacement from clipboard\nSecond replacement line"
    const { deps } = createDeps({
      clipboard: {
        name: "test desktop clipboard",
        canRead: true,
        canWrite: true,
        readText: () => clipboardText,
        readTextWithResult: () => ({
          ok: true,
          text: clipboardText,
          providerName: "test desktop clipboard",
          category: "desktop",
        }),
        writeText: (text) => {
          clipboardText = text
          return {
            ok: true,
            providerName: "test desktop clipboard",
            category: "desktop",
          }
        },
      },
    })
    const controller = createWorkspaceController(deps)
    openInboxDaily(controller)

    const copied = controller.runCommand("/copy-all")
    assert.deepEqual(copied, { blocked: false })
    assert.equal(clipboardText, "Original daily body")
    assert.match(controller.getState().editor?.statusMessage ?? "", /Copied 19 chars to desktop clipboard/i)

    clipboardText = "Replacement from clipboard\nSecond replacement line"
    const replaced = controller.runCommand("/replace-all")
    assert.deepEqual(replaced, { blocked: false })
    assert.equal(controller.getState().editor?.body, "Replacement from clipboard\nSecond replacement line")
    assert.equal(controller.getState().editor?.dirty, true)
    assert.match(controller.getState().editor?.statusMessage ?? "", /Replaced note body with 50 chars from desktop clipboard/i)

    clipboardText = ""
    const bodyBeforeEmptyReplace = controller.getState().editor?.body
    const emptyReplace = controller.runCommand("/replace-all")
    assert.deepEqual(emptyReplace, { blocked: false })
    assert.equal(controller.getState().editor?.body, bodyBeforeEmptyReplace)
    assert.match(controller.getState().editor?.statusMessage ?? "", /replace-all skipped/i)
  })

  test("replace-all refuses internal clipboard fallback so unavailable desktop read cannot overwrite the note", () => {
    const { deps } = createDeps({
      clipboard: {
        name: "BlueNote internal clipboard",
        canRead: true,
        canWrite: true,
        readText: () => "stale internal text",
        readTextWithResult: () => ({
          ok: true,
          text: "stale internal text",
          providerName: "BlueNote internal clipboard",
          category: "internal",
        }),
        writeText: () => ({
          ok: true,
          providerName: "BlueNote internal clipboard",
          category: "internal",
        }),
      },
    })
    const controller = createWorkspaceController(deps)
    openInboxDaily(controller)

    const before = controller.getState().editor?.body
    assert.deepEqual(controller.runCommand("/replace-all"), { blocked: false })

    assert.equal(controller.getState().editor?.body, before)
    assert.equal(controller.getState().editor?.dirty, false)
    assert.match(controller.getState().editor?.statusMessage ?? "", /desktop clipboard cannot be read/i)
  })

  test("toggles manager preview visibility without changing manager selection, filter, folder, or editor", () => {
    const { deps } = createDeps()
    const controller = createWorkspaceController(deps)
    openInboxDaily(controller)
    controller.updateEditorBody("Dirty daily body")
    controller.showManager()
    controller.openManagerFilter()
    controller.updateManagerFilter("daily")

    const before = controller.getState()
    controller.toggleManagerPreview()
    const after = controller.getState()

    assert.equal(after.manager.previewVisible, false)
    assert.equal(after.manager.focusedIndex, before.manager.focusedIndex)
    assert.equal(after.manager.currentFolderPath, before.manager.currentFolderPath)
    assert.equal(after.manager.filterQuery, before.manager.filterQuery)
    assert.deepEqual(after.editor, before.editor)
    assert.equal(after.manager.selectedNoteKey, before.manager.selectedNoteKey)
  })

  test("responsive manager preview visibility setter does not dirty/open/close notes", () => {
    const { deps, calls } = createDeps()
    const controller = createWorkspaceController(deps)
    openInboxDaily(controller)
    controller.showManager()

    const before = controller.getState()
    controller.setManagerPreviewVisible(false)
    const hidden = controller.getState()
    controller.setManagerPreviewVisible(false)
    const hiddenAgain = controller.getState()
    controller.setManagerPreviewVisible(true)
    const shown = controller.getState()

    assert.equal(hidden.manager.previewVisible, false)
    assert.equal(hiddenAgain.manager.previewVisible, false)
    assert.equal(shown.manager.previewVisible, true)
    assert.deepEqual(hidden.editor, before.editor)
    assert.equal(hidden.editor?.dirty, false)
    assert.equal(hidden.screen, before.screen)
    assert.equal(hidden.manager.selectedNoteKey, before.manager.selectedNoteKey)
    assert.deepEqual(calls, ["list", "show:daily-plan"])
  })

  test("toggles Search Everything preview visibility independently from manager preview visibility", () => {
    const { deps } = createDeps()
    const controller = createWorkspaceController(deps)

    controller.setManagerPreviewVisible(false)
    controller.openSearch("daily")
    assert.equal(controller.getState().search?.previewVisible, true)
    assert.equal(controller.getState().manager.previewVisible, false)

    controller.toggleSearchPreview()
    assert.equal(controller.getState().search?.previewVisible, false)
    assert.equal(controller.getState().manager.previewVisible, false)

    controller.setSearchPreviewVisible(true)
    assert.equal(controller.getState().search?.previewVisible, true)
    assert.equal(controller.getState().manager.previewVisible, false)
  })

  test("Search Everything focus keeps selection clamped while leaving result count unchanged for viewport rendering", () => {
    const notes = Array.from({ length: 18 }, (_, index) => ({
      key: `daily-${index.toString().padStart(2, "0")}`,
      title: `Daily ${index.toString().padStart(2, "0")}`,
      description: `Daily match ${index}`,
      relativePath: `notes/daily-${index.toString().padStart(2, "0")}.md`,
      body: `Daily match ${index}`,
    }))
    const controller = createWorkspaceController({
      listNotes: () => notes,
      showNote: (selector) => notes.find((note) => note.key === selector || note.relativePath === selector) ?? notes[0]!,
      searchNotes: () => [],
    })

    controller.openSearch("daily")
    assert.equal(controller.getSearchResults().length, 18)
    assert.equal(controller.getState().search?.selectedIndex, 0)
    assert.equal(controller.getState().search?.resultScrollOffset, 0)

    controller.focusSearchResult(12)
    assert.equal(controller.getSearchResults().length, 18)
    assert.equal(controller.getState().search?.selectedIndex, 12)

    controller.focusSearchResult(99)
    assert.equal(controller.getState().search?.selectedIndex, 17)

    controller.updateSearchQuery("daily 01")
    assert.equal(controller.getState().search?.selectedIndex, 0)
    assert.equal(controller.getState().search?.resultScrollOffset, 0)
  })

  test("Search Everything note previews hydrate raw note bodies when list summaries omit body text", () => {
    const summariesWithoutBodies = noteSummaries.map(({ body: _body, ...summary }) => summary)
    const { deps, calls } = createDeps({
      listNotes: () => {
        calls.push("list")
        return summariesWithoutBodies
      },
    })
    const controller = createWorkspaceController(deps)

    controller.openSearch("daily")
    const noteResult = controller.getSearchResults().find((result) => result.kind === "note" && result.key === "daily-plan")
    const preview = buildSearchEverythingPreview(noteResult, "daily")

    assert.deepEqual(preview?.lines, ["Original daily body"])
    assert.deepEqual(calls, ["list", "search:daily", "show:daily-plan"])
  })

  test("hidden manager previews do not hydrate the focused note body", () => {
    const summariesWithoutBodies = noteSummaries.map(({ body: _body, ...summary }) => summary)
    const calls: string[] = []
    const controller = createWorkspaceController(createDeps({
      listNotes: () => {
        calls.push("list")
        return summariesWithoutBodies
      },
      showNote: (selector) => {
        calls.push(`show:${selector}`)
        return notesByKey[selector]
      },
    }).deps)

    controller.focusManagerItem(1)
    controller.openFocusedManagerItem()
    controller.focusManagerItem(0)
    controller.setManagerPreviewVisible(false)
    const model = controller.getManagerBrowserModel()

    assert.deepEqual(calls, ["list"])
    assert.deepEqual(model.preview, { type: "hidden", path: "notes/inbox/daily-plan.md", reason: "manual" })
  })

  test("manager preview hydrates a focused note at most once per note during a session", () => {
    const summariesWithoutBodies = noteSummaries.map(({ body: _body, ...summary }) => summary)
    const calls: string[] = []
    const controller = createWorkspaceController(createDeps({
      listNotes: () => {
        calls.push("list")
        return summariesWithoutBodies
      },
      showNote: (selector) => {
        calls.push(`show:${selector}`)
        return notesByKey[selector]
      },
    }).deps)

    controller.focusManagerItem(1)
    controller.openFocusedManagerItem()
    controller.focusManagerItem(0)
    const first = controller.getManagerBrowserModel().preview
    const second = controller.getManagerBrowserModel().preview
    const third = controller.getManagerBrowserModel().preview

    assert.equal(first.type, "note-content")
    assert.deepEqual(first, second)
    assert.deepEqual(second, third)
    assert.deepEqual(calls, ["list", "show:daily-plan"])
  })

  test("moving between folder rows never hydrates manager preview note bodies", () => {
    const summariesWithoutBodies = noteSummaries.map(({ body: _body, ...summary }) => summary)
    const calls: string[] = []
    const controller = createWorkspaceController(createDeps({
      listNotes: () => {
        calls.push("list")
        return summariesWithoutBodies
      },
      showNote: (selector) => {
        calls.push(`show:${selector}`)
        return notesByKey[selector]
      },
    }).deps)

    controller.focusManagerItem(0)
    controller.getManagerBrowserModel()
    controller.focusManagerItem(1)
    controller.getManagerBrowserModel()
    controller.moveManagerSelection("up")
    controller.getManagerBrowserModel()

    assert.deepEqual(calls, ["list"])
  })

  test("refreshing manager invalidates cached hydrated previews", () => {
    let currentBody = "Original cached body"
    const summariesWithoutBodies = noteSummaries.map(({ body: _body, ...summary }) => summary)
    const calls: string[] = []
    const controller = createWorkspaceController(createDeps({
      listNotes: () => {
        calls.push("list")
        return summariesWithoutBodies
      },
      showNote: (selector) => {
        calls.push(`show:${selector}`)
        return { ...notesByKey[selector], body: currentBody }
      },
    }).deps)

    controller.focusManagerItem(1)
    controller.openFocusedManagerItem()
    controller.focusManagerItem(0)
    assert.deepEqual(controller.getManagerBrowserModel().preview.contentLines, ["Original cached body"])

    currentBody = "Changed body after refresh"
    assert.deepEqual(controller.getManagerBrowserModel().preview.contentLines, ["Original cached body"])
    controller.refreshManager()
    assert.deepEqual(controller.getManagerBrowserModel().preview.contentLines, ["Changed body after refresh"])
    assert.deepEqual(calls, ["list", "show:daily-plan", "list", "show:daily-plan"])
  })

  test("failed manager refresh still drops stale hydrated preview cache before the next successful refresh", () => {
    let currentBody = "Original cached body"
    let failNextList = false
    const summariesWithoutBodies = noteSummaries.map(({ body: _body, ...summary }) => summary)
    const controller = createWorkspaceController(createDeps({
      listNotes: () => {
        if (failNextList) {
          failNextList = false
          throw new Error("list failed after storage changed")
        }
        return summariesWithoutBodies
      },
      showNote: (selector) => ({ ...notesByKey[selector], body: currentBody }),
    }).deps)

    controller.focusManagerItem(1)
    controller.openFocusedManagerItem()
    controller.focusManagerItem(0)
    assert.deepEqual(controller.getManagerBrowserModel().preview.contentLines, ["Original cached body"])

    currentBody = "Changed body after failed refresh"
    failNextList = true
    assert.throws(() => controller.refreshManager(), /list failed/)
    assert.deepEqual(controller.getManagerBrowserModel().preview.contentLines, ["Changed body after failed refresh"])
    controller.refreshManager()
    assert.deepEqual(controller.getManagerBrowserModel().preview.contentLines, ["Changed body after failed refresh"])
  })

  test("failed editor saves clear stale hydrated manager preview cache after pre-write failure", async () => {
    const currentBody = "Cached body before failed save"
    const summariesWithoutBodies = noteSummaries.map(({ body: _body, ...summary }) => summary)
    const controller = createWorkspaceController(createDeps({
      listNotes: () => summariesWithoutBodies,
      showNote: (selector) => ({ ...notesByKey[selector], body: currentBody }),
      persistEditorBody: () => {
        throw new Error("atomic writer temp write failed")
      },
    }).deps)

    controller.focusManagerItem(1)
    controller.openFocusedManagerItem()
    controller.focusManagerItem(0)
    assert.deepEqual(controller.getManagerBrowserModel().preview.contentLines, ["Cached body before failed save"])

    assert.equal(controller.openFocusedManagerItem().blocked, false)
    controller.updateEditorBody("Unpersisted body after failed save")
    const result = await controller.saveEditor()

    assert.deepEqual(result, { blocked: true, reason: "dirty-editor" })
    controller.showManager()
    assert.deepEqual(controller.getManagerBrowserModel().preview.contentLines, ["Cached body before failed save"])
  })

  test("failed editor save keeps buffer dirty and retry can save later", async () => {
    let shouldFail = true
    const controller = createWorkspaceController({
      listNotes: () => [
        { key: "beta", title: "Beta", description: "Beta", relativePath: "notes/inbox/beta.md" },
      ],
      showNote: () => ({
        key: "beta",
        title: "Beta",
        description: "Beta",
        relativePath: "notes/inbox/beta.md",
        body: "Beta body",
      }),
      searchNotes: () => [],
      persistEditorBody: async (note, body) => {
        if (shouldFail) {
          throw new Error("EACCES: permission denied")
        }
        return { ...note, body, description: body }
      },
    })

    controller.refreshManager()
    controller.openFocusedManagerItem()
    controller.openFocusedManagerItem()
    controller.insertEditorText(" unsaved")

    const failed = await controller.saveEditor()
    assert.deepEqual(failed, { blocked: true, reason: "dirty-editor" })
    assert.equal(controller.getState().editor?.body, "Beta body unsaved")
    assert.equal(controller.getState().editor?.dirty, true)
    assert.equal(controller.getState().editor?.autosaveStatus, "error")

    shouldFail = false
    const retried = await controller.saveEditor()
    assert.deepEqual(retried, { blocked: false })
    assert.equal(controller.getState().editor?.body, "Beta body unsaved")
    assert.equal(controller.getState().editor?.dirty, false)
    assert.equal(controller.getState().editor?.autosaveStatus, "saved")
  })

  test("successful editor saves update the hydrated manager preview cache for the saved note", async () => {
    let currentBody = "Cached body before save"
    const summariesWithoutBodies = noteSummaries.map(({ body: _body, ...summary }) => summary)
    const calls: string[] = []
    const controller = createWorkspaceController(createDeps({
      listNotes: () => {
        calls.push("list")
        return summariesWithoutBodies
      },
      showNote: (selector) => {
        calls.push(`show:${selector}`)
        return { ...notesByKey[selector], body: currentBody }
      },
      persistEditorBody: (note, body) => ({ ...note, body }),
    }).deps)

    controller.focusManagerItem(1)
    controller.openFocusedManagerItem()
    controller.focusManagerItem(0)
    assert.deepEqual(controller.getManagerBrowserModel().preview.contentLines, ["Cached body before save"])

    const openResult = controller.openFocusedManagerItem()
    assert.equal(openResult.blocked, false)
    controller.updateEditorBody("Saved body should replace cached preview")
    await controller.saveEditor()

    currentBody = "Stale body from showNote should not be needed"
    controller.showManager()
    assert.deepEqual(controller.getManagerBrowserModel().preview.contentLines, ["Saved body should replace cached preview"])
    assert.deepEqual(calls, ["list", "show:daily-plan", "show:daily-plan"])
  })

  test("failed autosaves clear stale hydrated manager preview cache after pre-write failure", async () => {
    const scheduler = createFakeScheduler()
    const currentBody = "Cached body before failed autosave"
    const summariesWithoutBodies = noteSummaries.map(({ body: _body, ...summary }) => summary)
    const controller = createWorkspaceController(createDeps({
      autosaveScheduler: scheduler,
      listNotes: () => summariesWithoutBodies,
      showNote: (selector) => ({ ...notesByKey[selector], body: currentBody }),
      persistEditorBody: () => {
        throw new Error("atomic writer temp write failed")
      },
    }).deps)

    controller.focusManagerItem(1)
    controller.openFocusedManagerItem()
    controller.focusManagerItem(0)
    assert.deepEqual(controller.getManagerBrowserModel().preview.contentLines, ["Cached body before failed autosave"])

    assert.equal(controller.openFocusedManagerItem().blocked, false)
    controller.updateEditorBody("Unpersisted body after failed autosave")
    scheduler.runNext()
    await Promise.resolve()
    await Promise.resolve()

    assert.equal(controller.getState().editor?.autosaveStatus, "error")
    controller.showManager()
    assert.deepEqual(controller.getManagerBrowserModel().preview.contentLines, ["Cached body before failed autosave"])
  })

  test("successful autosaves update the hydrated manager preview cache for the saved note", async () => {
    const scheduler = createFakeScheduler()
    let currentBody = "Cached body before autosave"
    const summariesWithoutBodies = noteSummaries.map(({ body: _body, ...summary }) => summary)
    const calls: string[] = []
    const controller = createWorkspaceController(createDeps({
      autosaveScheduler: scheduler,
      listNotes: () => {
        calls.push("list")
        return summariesWithoutBodies
      },
      showNote: (selector) => {
        calls.push(`show:${selector}`)
        return { ...notesByKey[selector], body: currentBody }
      },
      persistEditorBody: (note, body) => ({ ...note, body }),
    }).deps)

    controller.focusManagerItem(1)
    controller.openFocusedManagerItem()
    controller.focusManagerItem(0)
    assert.deepEqual(controller.getManagerBrowserModel().preview.contentLines, ["Cached body before autosave"])

    assert.equal(controller.openFocusedManagerItem().blocked, false)
    controller.updateEditorBody("Autosaved body should replace cached preview")
    scheduler.runNext()
    await Promise.resolve()
    await Promise.resolve()

    currentBody = "Stale body from showNote should not be needed"
    controller.showManager()
    assert.deepEqual(controller.getManagerBrowserModel().preview.contentLines, ["Autosaved body should replace cached preview"])
    assert.deepEqual(calls, ["list", "show:daily-plan", "show:daily-plan"])
  })

  test("autosaved editor no longer blocks manager switching to a different note", async () => {
    const scheduler = createFakeScheduler()
    const { deps } = createDeps({
      autosaveScheduler: scheduler,
      persistEditorBody: (note, body) => ({ ...note, body }),
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.insertEditorText(" autosaved")
    scheduler.runNext()
    await Promise.resolve()
    await Promise.resolve()

    assert.equal(controller.getState().editor?.dirty, false)
    assert.equal(controller.getState().editor?.autosaveStatus, "saved")
    assert.equal(editorRequiresDestructiveConfirmation(controller.getState().editor), false)

    controller.showManager()
    const enterResult = openArchiveReview(controller)
    assert.equal(enterResult.blocked, false)
    assert.equal(controller.getState().screen, "editor")
    assert.equal(controller.getState().editor?.note.key, "archive-review")
    assert.notEqual(controller.getState().editor?.note.key, "daily-plan")
  })

  test("saved editor can switch to other notes and still quit", async () => {
    const notes = new Map<string, TuiNote>([
      [
        "alpha-summary",
        {
          key: "alpha-summary",
          title: "Alpha Summary",
          description: "Summary",
          relativePath: "notes/similar/alpha-summary.md",
          body: "summary",
        },
      ],
      [
        "alpha-source",
        {
          key: "alpha-source",
          title: "Alpha Source",
          description: "Source",
          relativePath: "notes/similar/alpha-source.md",
          body: "source",
        },
      ],
      [
        "beta",
        {
          key: "beta",
          title: "Beta",
          description: "Beta",
          relativePath: "notes/inbox/beta.md",
          body: "beta",
        },
      ],
    ])
    const persisted: string[] = []
    const controller = createWorkspaceController({
      listNotes: () => [...notes.values()].map(({ body: _body, ...summary }) => summary),
      showNote: (selector) => notes.get(selector)!,
      searchNotes: () => [],
      persistEditorBody: async (note, body) => {
        persisted.push(`${note.key}:${body}`)
        const next = { ...note, body, description: body.split("\n")[0] ?? "" }
        notes.set(note.key, next)
        return next
      },
      autosaveScheduler: {
        setTimeout: () => 0,
        clearTimeout: () => undefined,
      },
    })

    controller.refreshManager()
    const openFolder = (relativePath: string) => {
      const folderIndex = controller.getState().manager.items.findIndex(
        (item) => item.type === "folder" && item.relativePath === relativePath,
      )
      assert.notEqual(folderIndex, -1)
      controller.focusManagerItem(folderIndex)
      assert.equal(controller.openFocusedManagerItem().blocked, false)
    }

    openFolder("notes/similar")
    controller.openManagerFilter()
    controller.updateManagerFilter("alpha-summary")
    assert.equal(controller.openFocusedManagerItem().blocked, false)
    controller.insertEditorText(" saved")
    assert.deepEqual(await controller.saveEditor(), { blocked: false })
    assert.equal(controller.showManager().blocked, false)

    controller.openManagerFilter()
    controller.updateManagerFilter("alpha-source")
    assert.equal(controller.openFocusedManagerItem().blocked, false)
    assert.equal(controller.getState().editor?.note.key, "alpha-source")

    assert.equal(controller.showManager().blocked, false)
    controller.clearManagerFilter()
    assert.equal(controller.goBack().blocked, false)
    openFolder("notes/inbox")
    controller.openManagerFilter()
    controller.updateManagerFilter("beta")
    assert.equal(controller.openFocusedManagerItem().blocked, false)
    assert.equal(controller.getState().editor?.note.key, "beta")
    controller.insertEditorText(" saved")
    assert.deepEqual(await controller.saveEditor(), { blocked: false })

    assert.equal(controller.requestQuit().blocked, false)
    assert.deepEqual(persisted, ["alpha-summary:summary saved", "beta:beta saved"])
  })

  test("dirty manager note switch is blocked with visible manager status until confirmed", () => {
    const { deps } = createDeps()
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.insertEditorText(" unsaved")
    controller.showManager()

    const blocked = openArchiveReview(controller)
    assert.deepEqual(blocked, { blocked: true, reason: "dirty-editor" })
    assert.equal(controller.getState().screen, "manager")
    assert.equal(controller.getState().editor?.note.key, "daily-plan")
    assert.equal(controller.getState().manager.status, "Save or discard current note first")

    const vm = buildManagerViewModel(controller.getState(), controller.getManagerBrowserModel())
    assert.match(vm.status, /Save or discard current note first/u)

    const confirmed = controller.openFocusedManagerItem({ confirmed: true })
    assert.equal(confirmed.blocked, false)
    assert.equal(controller.getState().screen, "editor")
    assert.equal(controller.getState().editor?.note.key, "archive-review")
  })

  test("successful saves update manager preview summaries that already include note bodies", async () => {
    const { deps } = createDeps({ persistEditorBody: (note, body) => ({ ...note, body }) })
    const controller = createWorkspaceController(deps)

    controller.focusManagerItem(1)
    controller.openFocusedManagerItem()
    controller.focusManagerItem(0)
    assert.deepEqual(controller.getManagerBrowserModel().preview.contentLines, ["Original daily body"])

    assert.equal(controller.openFocusedManagerItem().blocked, false)
    controller.updateEditorBody("Saved body should replace summary body")
    await controller.saveEditor()

    controller.showManager()
    assert.deepEqual(controller.getManagerBrowserModel().preview.contentLines, ["Saved body should replace summary body"])
  })

  test("switches manager to editor by opening the selected note", () => {
    const { deps, calls } = createDeps()
    const controller = createWorkspaceController(deps)

    controller.focusManagerItem(1)
    controller.openFocusedManagerItem()
    assert.equal(controller.getState().screen, "manager")
    assert.equal(controller.getState().manager.currentFolderPath, "notes/inbox")
    controller.focusManagerItem(0)
    const result = controller.openFocusedManagerItem()

    assert.equal(result.blocked, false)
    assert.equal(controller.getState().screen, "editor")
    assert.equal(controller.getState().editor?.note.key, "daily-plan")
    assert.equal(controller.getState().editor?.body, "Original daily body")
    assert.deepEqual(calls, ["list", "show:daily-plan"])
  })

  test("controlled editor input mutates at cursor and preserves autosave behavior", () => {
    const scheduler = createFakeScheduler()
    const { deps } = createDeps({ autosaveScheduler: scheduler })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.insertEditorText("!")
    assert.equal(controller.getState().editor?.body, "Original daily body!")
    controller.moveEditorCursor("left")
    controller.insertEditorText(" before bang")
    assert.equal(controller.getState().editor?.body, "Original daily body before bang!")
    controller.backspaceEditor()
    assert.equal(controller.getState().editor?.body, "Original daily body before ban!")
    controller.deleteEditor()
    assert.equal(controller.getState().editor?.body, "Original daily body before ban")
    assert.equal(controller.getState().editor?.autosaveStatus, "pending")
    assert.deepEqual(scheduler.activeTasks().map((task) => task.delay), [750])
  })

  test("cursor-aware no-op edits do not reschedule autosave for unchanged dirty body", () => {
    const scheduler = createFakeScheduler()
    const invalidations: string[] = []
    const { deps } = createDeps({
      autosaveScheduler: scheduler,
      onAutosaveStateChange: () => invalidations.push(controller.getState().editor?.autosaveStatus ?? "none"),
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.insertEditorText("!")
    const pendingBeforeNoop = scheduler.activeTasks()[0]
    assert.ok(pendingBeforeNoop)
    assert.deepEqual(invalidations, ["pending"])

    controller.moveEditorCursor("home")
    controller.backspaceEditor()

    assert.equal(controller.getState().editor?.body, "Original daily body!")
    assert.equal(controller.getState().editor?.dirty, true)
    assert.equal(controller.getState().editor?.autosaveStatus, "pending")
    assert.deepEqual(scheduler.activeTasks(), [pendingBeforeNoop])
    assert.deepEqual(invalidations, ["pending"])
  })

  test("manual save preserves controlled cursor metadata", async () => {
    const { deps } = createDeps({
      persistEditorBody: (note, body) => ({ ...note, body }),
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.insertEditorText("!")
    controller.moveEditorCursor("left")
    controller.insertEditorText(" before bang")
    const beforeSave = controller.getState().editor
    assert.equal(beforeSave?.cursorOffset, Array.from("Original daily body before bang").length)

    await controller.saveEditor()

    const afterSave = controller.getState().editor
    assert.equal(afterSave?.dirty, false)
    assert.equal(afterSave?.autosaveStatus, "saved")
    assert.equal(afterSave?.cursorOffset, beforeSave?.cursorOffset)
    assert.equal(afterSave?.selectionStart, beforeSave?.selectionStart)
    assert.equal(afterSave?.selectionEnd, beforeSave?.selectionEnd)
    assert.equal(afterSave?.preferredColumn, beforeSave?.preferredColumn)
    assert.equal(afterSave?.wrapMode, beforeSave?.wrapMode)
  })

  test("workspace controller does not expose editor select-all UX", () => {
    const { deps } = createDeps()
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)

    assert.equal("selectAllEditorBody" in controller, false)
    assert.equal(controller.getState().editor?.selectionStart, Array.from("Original daily body").length)
    assert.equal(controller.getState().editor?.selectionEnd, Array.from("Original daily body").length)
  })

  test("pastes injected clipboard or paste event text over current selection and schedules autosave", () => {
    let clipboardText = "clipboard"
    const scheduler = createFakeScheduler()
    const { deps } = createDeps({
      autosaveScheduler: scheduler,
      clipboard: {
        name: "unit desktop clipboard",
        canRead: true,
        canWrite: true,
        readText: () => clipboardText,
        writeText: (text) => {
          clipboardText = text
        },
      },
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.setEditorSelection(9, 14)

    controller.pasteEditorClipboard()
    assert.equal(controller.getState().editor?.body, "Original clipboard body")
    assert.equal(controller.getState().editor?.cursorOffset, 18)
    assert.equal(controller.getState().editor?.autosaveStatus, "pending")
    assert.equal(controller.getState().editor?.statusMessage, "Pasted 9 chars from unit desktop clipboard")

    controller.setEditorSelection(9, 18)
    controller.pasteEditorClipboard("event text")

    assert.equal(controller.getState().editor?.body, "Original event text body")
    assert.equal(controller.getState().editor?.cursorOffset, 19)
    assert.equal(scheduler.activeTasks().length, 1)
  })

  test("paste with unavailable desktop clipboard reports visible status without mutating editor", () => {
    const { deps } = createDeps({
      clipboard: {
        name: "terminal OSC52 clipboard",
        canRead: false,
        canWrite: true,
        readText: () => "",
        writeText: () => undefined,
      },
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.pasteEditorClipboard()

    assert.equal(controller.getState().editor?.body, "Original daily body")
    assert.equal(controller.getState().editor?.statusMessage, "Clipboard paste unavailable; use terminal paste instead")
  })

  test("toggles editor wrap mode without marking the editor dirty", () => {
    const { deps } = createDeps()
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    assert.equal(controller.getState().editor?.wrapMode, "word")

    controller.toggleEditorWrapMode()
    assert.equal(controller.getState().editor?.wrapMode, "none")
    assert.equal(controller.getState().editor?.dirty, false)
    assert.equal(controller.getState().editor?.autosaveStatus, "idle")

    controller.toggleEditorWrapMode()
    assert.equal(controller.getState().editor?.wrapMode, "word")
    assert.equal(controller.getState().editor?.dirty, false)
  })

  test("moves across a long unwrapped editor line and returns to normal wrapping without mutating text", () => {
    const { deps } = createDeps()
    const controller = createWorkspaceController(deps)
    openInboxDaily(controller)
    const longBody = "abcdefghijklmnopqrstuvwxyz"
    controller.updateEditorBody(longBody)
    controller.moveEditorCursor("home")
    controller.toggleEditorWrapMode()

    for (let index = 0; index < 20; index += 1) {
      controller.moveEditorCursor("right")
    }
    assert.equal(controller.getState().editor?.cursorOffset, 20)
    assert.equal(controller.getState().editor?.body, longBody)
    assert.equal(controller.getState().editor?.wrapMode, "none")

    controller.moveEditorCursor("left")
    assert.equal(controller.getState().editor?.cursorOffset, 19)
    controller.moveEditorCursor("end")
    assert.equal(controller.getState().editor?.cursorOffset, Array.from(longBody).length)
    controller.moveEditorCursor("home")
    assert.equal(controller.getState().editor?.cursorOffset, 0)

    controller.toggleEditorWrapMode()
    assert.equal(controller.getState().editor?.wrapMode, "word")
    assert.equal(controller.getState().editor?.body, longBody)
  })

  test("switches editor and manager with shortcut actions while preserving dirty editor state", () => {
    const { deps } = createDeps()
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("Dirty daily body")

    controller.showManager()
    assert.equal(controller.getState().screen, "manager")
    assert.equal(controller.getState().editor?.dirty, true)

    controller.showEditor()
    assert.equal(controller.getState().screen, "editor")
    assert.equal(controller.getState().editor?.body, "Dirty daily body")
    assert.equal(controller.getState().editor?.dirty, true)
  })

  test("opens Search Everything from manager or editor and cancels back to the invoking screen", () => {
    const { deps } = createDeps()
    const controller = createWorkspaceController(deps)

    controller.openSearch("daily")
    assert.equal(controller.getState().screen, "search")
    assert.equal(controller.getState().search?.previousScreen, "manager")
    controller.cancelSearch()
    assert.equal(controller.getState().screen, "manager")

    openInboxDaily(controller)
    controller.openSearch("archive")
    assert.equal(controller.getState().screen, "search")
    assert.equal(controller.getState().search?.previousScreen, "editor")
    controller.cancelSearch()
    assert.equal(controller.getState().screen, "editor")
  })

  test("routes selected Search Everything note results to editor, folder results to manager, and command results to handlers", () => {
    const { deps, calls } = createDeps()
    const controller = createWorkspaceController(deps)

    controller.openSearch("archive")
    controller.selectSearchResult({
      kind: "note",
      id: "note:archive-review",
      key: "archive-review",
      filename: "archive-review.md",
      title: "Archive Review",
      description: "Old ideas.",
      relativePath: "notes/archive/archive-review.md",
      label: "Archive Review",
      detail: "archive-review.md — notes/archive/archive-review.md",
      score: 100,
      matchedFields: ["title"],
    })
    assert.equal(controller.getState().screen, "editor")
    assert.equal(controller.getState().editor?.note.key, "archive-review")

    controller.openSearch("inbox")
    controller.selectSearchResult({
      kind: "folder",
      id: "folder:notes/inbox",
      path: "notes/inbox",
      name: "inbox",
      label: "inbox/",
      detail: "1 note in notes/inbox",
      score: 90,
      noteCount: 1,
    })
    assert.equal(controller.getState().screen, "manager")
    assert.equal(controller.getState().manager.currentFolderPath, "notes/inbox")

    controller.openSearch("/new")
    controller.selectSearchResult(commandResult("/new"))
    assert.deepEqual(calls, ["list", "search:archive", "show:archive-review", "search:inbox", "search:/new", "command:/new"])
  })

  test("blocks destructive actions or screen switches that would lose dirty editor content unless confirmed", () => {
    const { deps, calls } = createDeps()
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("Unsaved daily body")
    controller.showManager()
    controller.goBack()
    controller.focusManagerItem(0)
    controller.openFocusedManagerItem()
    controller.focusManagerItem(0)

    const blockedSwitch = controller.openFocusedManagerItem()
    assert.equal(blockedSwitch.blocked, true)
    assert.equal(blockedSwitch.reason, "dirty-editor")
    assert.equal(controller.getState().screen, "manager")
    assert.equal(controller.getState().editor?.note.key, "daily-plan")
    assert.equal(controller.getState().editor?.dirty, true)

    const confirmedSwitch = controller.openFocusedManagerItem({ confirmed: true })
    assert.equal(confirmedSwitch.blocked, false)
    assert.equal(controller.getState().screen, "editor")
    assert.equal(controller.getState().editor?.note.key, "archive-review")

    controller.updateEditorBody("Unsaved archive body")
    const blockedDelete = controller.runCommand("/delete")
    assert.equal(blockedDelete.blocked, true)
    assert.equal(blockedDelete.reason, "dirty-editor")
    assert.equal(calls.includes("command:/delete"), false)

    const blockedDeleteWithArgument = controller.runCommand("/delete archive-review")
    assert.equal(blockedDeleteWithArgument.blocked, true)
    assert.equal(blockedDeleteWithArgument.reason, "dirty-editor")
    assert.equal(calls.includes("command:/delete"), false)

    const confirmedDelete = controller.runCommand("/delete archive-review", { confirmed: true })
    assert.equal(confirmedDelete.blocked, false)
    assert.equal(calls.includes("command:/delete"), true)
  })

  test("does not discard dirty content when reopening the same note without confirmation", () => {
    const { deps, calls } = createDeps()
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("Unsaved daily body")
    controller.showManager()
    controller.focusManagerItem(0)

    const result = controller.openFocusedManagerItem()

    assert.equal(result.blocked, false)
    assert.equal(controller.getState().screen, "editor")
    assert.equal(controller.getState().editor?.note.key, "daily-plan")
    assert.equal(controller.getState().editor?.body, "Unsaved daily body")
    assert.equal(controller.getState().editor?.dirty, true)
    assert.deepEqual(calls, ["list", "show:daily-plan"])

    controller.showManager()
    const confirmedSameNoteResult = controller.openFocusedManagerItem({ confirmed: true })
    assert.equal(confirmedSameNoteResult.blocked, false)
    assert.equal(controller.getState().screen, "editor")
    assert.equal(controller.getState().editor?.body, "Unsaved daily body")
    assert.equal(controller.getState().editor?.dirty, true)
    assert.deepEqual(calls, ["list", "show:daily-plan"])
  })

  test("async save completion does not replace a different active editor", async () => {
    let finishPersist!: (note: TuiNote) => void
    const { deps } = createDeps({
      persistEditorBody: (note, body) =>
        new Promise<TuiNote>((resolve) => {
          finishPersist = resolve
          return { ...note, body }
        }),
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("Async daily body")
    const savePromise = controller.saveEditor()

    controller.showManager()
    openArchiveReview(controller, { confirmed: true })
    assert.equal(controller.getState().editor?.note.key, "archive-review")

    finishPersist({ ...notesByKey["daily-plan"], body: "Async daily body" })
    await savePromise

    assert.equal(controller.getState().editor?.note.key, "archive-review")
    assert.equal(controller.getState().editor?.body, "Archive body")
  })

  test("Search Everything command results are filtered by invoking context", () => {
    const { deps } = createDeps({ commandHandlers: {} })
    const controller = createWorkspaceController(deps)

    controller.openSearch("/")
    assert.deepEqual(controller.getSearchResults().filter((result) => result.kind === "command").map((result) => result.name), ["/ai-process-queue", "/ai-status"])
    assert.equal(controller.getSearchResults().some((result) => result.kind === "command" && ["/archive", "/rebuild", "/migrate"].includes(result.name)), false)

    openInboxDaily(controller)
    controller.openSearch("/")
    assert.deepEqual(controller.getSearchResults().filter((result) => result.kind === "command").map((result) => result.name), ["/ai-describe", "/ai-process-queue", "/ai-status", "/find", "/replace", "/save", "/copy-all", "/replace-all", "/paste"])
  })

  test("selecting shown editor commands opens the expected editor prompt or mode", () => {
    const { deps } = createDeps({ commandHandlers: {} })
    const controller = createWorkspaceController(deps)
    openInboxDaily(controller)

    controller.openSearch("/find daily")
    const findResult = controller.getSearchResults().find((result) => result.kind === "command" && result.name === "/find")
    assert.ok(findResult)
    assert.equal(controller.selectSearchResult(findResult).blocked, false)
    assert.equal(controller.getState().screen, "editor")
    assert.equal(controller.getState().mode, "editor.find")
    assert.equal(controller.getState().editor?.findQuery, "daily")

    controller.openSearch("/replace body")
    const replaceResult = controller.getSearchResults().find((result) => result.kind === "command" && result.name === "/replace")
    assert.ok(replaceResult)
    assert.equal(controller.selectSearchResult(replaceResult).blocked, false)
    assert.equal(controller.getState().mode, "editor.replace")
    assert.equal(controller.getState().editor?.findQuery, "body")

    controller.openSearch("/copy-all")
    const copyAllResult = controller.getSearchResults().find((result) => result.kind === "command" && result.name === "/copy-all")
    assert.ok(copyAllResult)
    assert.equal(controller.selectSearchResult(copyAllResult).blocked, false)
    assert.match(controller.getState().editor?.statusMessage ?? "", /Copied/u)
  })

  test("unwired commands are not returned from Search Everything", () => {
    const { deps, calls } = createDeps({ commandHandlers: {} })
    const controller = createWorkspaceController(deps)

    controller.openSearch("/archive")
    assert.equal(controller.getSearchResults().some((searchResult) => searchResult.kind === "command"), false)
    const result = controller.selectSearchResult(commandResult("/archive"))

    assert.equal(result.blocked, false)
    assert.equal(controller.getState().screen, "search")
    assert.equal(controller.getState().search?.status, "Command unavailable: /archive")
    assert.deepEqual(calls, ["list", "search:/archive"])

    const backResult = controller.goBack()
    assert.equal(backResult.blocked, false)
    assert.equal(controller.getState().screen, "manager")
    assert.equal(controller.getState().search, null)
  })

  test("Search Everything stays usable with partial summary, folder, and command results when the search index is unavailable", () => {
    const { deps, calls } = createDeps({
      listNotes: () => [...noteSummaries, ...phaseSevenSummaries],
      listNoteFolders: () => ["notes/inbox", "notes/archive", "note"],
      searchNotes: (query) => {
        calls.push(`search:${query}`)
        throw new Error("simulated corrupt search index")
      },
    })
    const controller = createWorkspaceController(deps)

    controller.openSearch("")
    assert.doesNotThrow(() => controller.updateSearchQuery("daily"))

    assert.equal(controller.getState().screen, "search")
    assert.equal(controller.getState().search?.query, "daily")
    assert.equal(controller.getState().search?.status, "Search index unavailable; showing notes, folders, and commands only")
    assert.equal(controller.getSearchResults().some((result) => result.kind === "note" && result.key === "daily-plan"), true)
    assert.equal(controller.getSearchResults().some((result) => result.kind === "content"), false)

    assert.doesNotThrow(() => controller.updateSearchQuery("inbox"))
    assert.equal(controller.getState().search?.query, "inbox")
    assert.equal(controller.getState().search?.status, "Search index unavailable; showing notes, folders, and commands only")
    assert.equal(controller.getSearchResults().some((result) => result.kind === "folder" && result.path === "notes/inbox"), true)

    assert.doesNotThrow(() => controller.updateSearchQuery("/new"))
    assert.equal(controller.getState().search?.query, "/new")
    assert.equal(controller.getSearchResults().some((result) => result.kind === "command" && result.name === "/new"), false)

    controller.goBack()
    openManagerFolderPath(controller, "note")
    controller.openSearch("/new")
    assert.equal(controller.getSearchResults().some((result) => result.kind === "command" && result.name === "/new"), true)

    const backResult = controller.goBack()
    assert.equal(backResult.blocked, false)
    assert.equal(controller.getState().screen, "manager")
    assert.equal(controller.getState().search, null)
  })

  test("selecting a command search result closes search and dispatches by command name", () => {
    const commandContexts: string[] = []
    const { deps } = createDeps({
      commandHandlers: {
        "/new": ({ state, command }) => {
          commandContexts.push(`${state.screen}:${command}`)
        },
      },
    })
    const controller = createWorkspaceController(deps)

    controller.openSearch("/new Project Plan")
    const result = controller.selectSearchResult(commandResult("/new"))

    assert.equal(result.blocked, false)
    assert.equal(controller.getState().screen, "manager")
    assert.equal(controller.getState().search, null)
    assert.deepEqual(commandContexts, ["manager:/new Project Plan"])
  })

  test("dirty destructive command search result blocks before unavailable status or handler dispatch", () => {
    const { deps, calls } = createDeps({ commandHandlers: {} })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("Unsaved daily body")
    controller.openSearch("/archive")
    const result = controller.selectSearchResult(commandResult("/archive"))

    assert.deepEqual(result, { blocked: true, reason: "dirty-editor" })
    assert.equal(controller.getState().screen, "search")
    assert.equal(controller.getState().search?.status, null)
    assert.equal(controller.getState().editor?.dirty, true)
    assert.deepEqual(calls, ["list", "show:daily-plan", "search:/archive"])
  })

  test("returns immutable snapshots for state, search results, and command handler context", () => {
    let handlerStateScreen = ""
    const { deps } = createDeps({
      commandHandlers: {
        "/new": ({ state }) => {
          handlerStateScreen = state.screen
          state.screen = "editor"
        },
      },
    })
    const controller = createWorkspaceController(deps)

    const snapshot = controller.getState()
    snapshot.screen = "editor"
    snapshot.manager.items.length = 0
    assert.equal(controller.getState().screen, "manager")
    assert.equal(controller.getState().manager.items.length, 2)

    controller.openSearch("daily")
    const results = controller.getSearchResults() as SearchEverythingResult[]
    assert.equal(results.length > 0, true)
    const noteResult = results.find((result) => result.kind === "note")
    assert.equal(noteResult?.kind, "note")
    if (noteResult?.kind === "note") {
      noteResult.matchedFields.length = 0
    }
    results.length = 0
    assert.equal(controller.getSearchResults().length > 0, true)
    const freshNoteResult = controller.getSearchResults().find((result) => result.kind === "note")
    assert.equal(freshNoteResult?.kind, "note")
    if (freshNoteResult?.kind === "note") {
      assert.equal(freshNoteResult.matchedFields.length > 0, true)
    }

    controller.selectSearchResult(commandResult("/new"))
    assert.equal(handlerStateScreen, "manager")
    assert.equal(controller.getState().screen, "manager")
  })

  test("stale folder results and refreshes do not preserve impossible selected note keys", () => {
    let currentSummaries = noteSummaries
    const { deps } = createDeps({
      listNotes: () => currentSummaries,
    })
    const controller = createWorkspaceController(deps)

    controller.focusManagerItem(1)
    controller.openFocusedManagerItem()
    controller.focusManagerItem(0)
    assert.equal(controller.getState().manager.selectedNoteKey, "daily-plan")

    controller.openSearch("missing")
    controller.selectSearchResult({
      kind: "folder",
      id: "folder:notes/missing",
      path: "notes/missing",
      name: "missing",
      label: "missing/",
      detail: "0 notes in notes/missing",
      score: 90,
      noteCount: 0,
    })
    assert.equal(controller.getState().manager.selectedNoteKey, "daily-plan")

    currentSummaries = []
    controller.refreshManager()
    assert.deepEqual(controller.getState().manager.items, [])
    assert.equal(controller.getState().manager.selectedNoteKey, null)
  })

  test("opens focused manager folders and notes through the browser adapter", () => {
    const { deps, calls } = createDeps()
    const controller = createWorkspaceController(deps)

    assert.equal(controller.getState().manager.currentFolderPath, "")
    controller.focusManagerItem(1)
    const folderResult = controller.openFocusedManagerItem()

    assert.equal(folderResult.blocked, false)
    assert.equal(controller.getState().screen, "manager")
    assert.equal(controller.getState().manager.currentFolderPath, "notes/inbox")
    assert.deepEqual(controller.getState().manager.items.map((item) => item.key), ["daily-plan"])

    const noteResult = controller.openFocusedManagerItem()

    assert.equal(noteResult.blocked, false)
    assert.equal(controller.getState().screen, "editor")
    assert.equal(controller.getState().mode, "editor.body")
    assert.equal(controller.getState().editor?.note.key, "daily-plan")
    assert.deepEqual(calls, ["list", "show:daily-plan"])
  })

  test("editor replace mode replaces current match and all matches while preserving autosave semantics", () => {
    const scheduler = createFakeScheduler()
    const { deps } = createDeps({ autosaveScheduler: scheduler })
    const controller = createWorkspaceController(deps)
    openInboxDaily(controller)

    controller.updateEditorBody("alpha beta alpha")
    controller.openEditorReplace("alpha")
    controller.updateEditorReplacement("omega")
    assert.equal(controller.getState().mode, "editor.replace")
    assert.equal(controller.getState().editor?.findMatchCount, 2)
    assert.equal(controller.getState().editor?.activeFindIndex, 0)

    controller.replaceCurrentEditorMatch()
    assert.equal(controller.getState().editor?.body, "omega beta alpha")
    assert.equal(controller.getState().editor?.dirty, true)
    assert.equal(controller.getState().editor?.autosaveStatus, "pending")
    assert.equal(controller.getState().editor?.findQuery, "alpha")
    assert.equal(controller.getState().editor?.replacementText, "omega")
    assert.equal(controller.getState().editor?.activeFindIndex, 0)
    assert.equal(scheduler.tasks.length > 0, true)

    controller.updateEditorReplacement("done")
    controller.replaceAllEditorMatches()
    assert.equal(controller.getState().editor?.body, "omega beta done")
    assert.equal(controller.getState().editor?.dirty, true)
    assert.equal(controller.getState().editor?.findMatchCount, 0)
    assert.equal(controller.getState().editor?.activeFindIndex, null)
  })

  test("goBack closes transient modes and navigates manager folders to their parent", () => {
    const { deps } = createDeps()
    const controller = createWorkspaceController(deps)

    controller.openSearch("daily")
    assert.equal(controller.getState().screen, "search")
    controller.goBack()
    assert.equal(controller.getState().screen, "manager")
    assert.equal(controller.getState().mode, "manager.browse")

    openInboxDaily(controller)
    controller.openEditorFind("daily")
    assert.equal(controller.getState().mode, "editor.find")
    controller.goBack()
    assert.equal(controller.getState().screen, "editor")
    assert.equal(controller.getState().mode, "editor.body")
    controller.openEditorReplace("daily")
    assert.equal(controller.getState().mode, "editor.replace")
    controller.goBack()
    assert.equal(controller.getState().screen, "editor")
    assert.equal(controller.getState().mode, "editor.body")
    assert.equal(controller.getState().editor?.note.key, "daily-plan")

    controller.showManager()
    controller.openManagerFilter()
    controller.updateManagerFilter("daily")
    assert.equal(controller.getState().mode, "manager.filter")
    controller.goBack()
    assert.equal(controller.getState().mode, "manager.browse")
    assert.equal(controller.getState().manager.filterQuery, "")

    assert.equal(controller.getState().manager.currentFolderPath, "notes/inbox")
    controller.goBack()
    assert.equal(controller.getState().manager.currentFolderPath, "")
  })

  test("manager create submits a new folder name, refreshes indexes, and stays in manager", async () => {
    let folders = ["note/work"]
    const { deps, calls } = createDeps({
      listNotes: () => {
        calls.push("list")
        return phaseSevenSummaries
      },
      listNoteFolders: () => folders,
      createFolder: (folderRelativePath) => {
        calls.push(`create-folder:${folderRelativePath}`)
        folders = [...folders, folderRelativePath]
      },
      rebuildIndexes: () => {
        calls.push("rebuild")
      },
      showNote: (selector) => phaseSevenNotesByKey[selector],
    })
    const controller = createWorkspaceController(deps)

    openManagerFolderPath(controller, "note/work")
    controller.openManagerCreate()
    assert.equal(controller.getState().mode, "manager.create")
    const createVm = buildManagerViewModel(controller.getState())
    assert.equal(createVm.createPrompt?.inputId, "bluenote-manager-create-title")
    assert.equal(createVm.createPrompt?.sheetTitle, "New folder")
    assert.equal(createVm.createPrompt?.focused, true)
    assert.equal(createVm.deletePrompt, undefined)
    assert.equal(routeManagerKey("q", controller), true)
    assert.equal(controller.getState().manager.createDraft?.title, "q")
    controller.updateManagerCreateTitle("q-project")
    const result = await controller.submitManagerCreate()

    assert.equal(result.blocked, false)
    assert.equal(controller.getState().screen, "manager")
    assert.equal(controller.getState().mode, "manager.browse")
    assert.equal(controller.getState().manager.currentFolderPath, "note/work")
    assert.equal(controller.getState().manager.items.some((item) => item.type === "folder" && item.relativePath === "note/work/q-project"), true)
    assert.deepEqual(calls, ["list", "create-folder:note/work/q-project", "rebuild", "list"])
  })

  test("manager folder create does not block when the current editor is dirty", async () => {
    let folders = ["note/work"]
    const { deps, calls } = createDeps({
      listNotes: () => {
        calls.push("list")
        return phaseSevenSummaries
      },
      listNoteFolders: () => folders,
      showNote: (selector) => phaseSevenNotesByKey[selector],
      createFolder: (folderRelativePath) => {
        calls.push(`create-folder:${folderRelativePath}`)
        folders = [...folders, folderRelativePath]
      },
    })
    const controller = createWorkspaceController(deps)

    openManagerFolderPath(controller, "note/work")
    const openNoteIndex = controller.getState().manager.items.findIndex((item) => item.type === "note" && item.key === "alpha-note")
    assert.notEqual(openNoteIndex, -1)
    controller.focusManagerItem(openNoteIndex)
    controller.openFocusedManagerItem()
    controller.updateEditorBody("Unsaved draft")
    controller.showManager()
    openManagerFolderPath(controller, "note/work")
    controller.setManagerPreviewVisible(false)
    controller.openManagerCreate()
    controller.updateManagerCreateTitle("new-folder")

    const result = await controller.submitManagerCreate()

    assert.deepEqual(result, { blocked: false })
    assert.equal(controller.getState().mode, "manager.browse")
    assert.equal(controller.getState().manager.previewVisible, false)
    assert.equal(controller.getState().editor?.body, "Unsaved draft")
    assert.equal(controller.getState().manager.items.some((item) => item.type === "folder" && item.relativePath === "note/work/new-folder"), true)
    assert.deepEqual(calls.filter((call) => call.startsWith("create-folder:")), ["create-folder:note/work/new-folder"])
  })

  test("manager rename note updates an open editor and latest-opened while staying in manager", () => {
    let summaries = [...phaseSevenSummaries]
    const renamedNote: TuiNote = {
      key: "renamed-alpha",
      title: "Renamed Alpha",
      description: "First normal note.",
      relativePath: "note/work/renamed-alpha.md",
      body: "Renamed Alpha body",
    }
    const latestOpened: string[] = []
    const { deps, calls } = createDeps({
      listNotes: () => summaries,
      listNoteFolders: () => ["note/work"],
      showNote: (selector) => selector === "renamed-alpha" ? renamedNote : phaseSevenNotesByKey[selector],
      renameNote: (selector, title) => {
        calls.push(`rename-note:${selector}:${title}`)
        summaries = summaries.map((summary) => summary.key === selector
          ? {
              ...summary,
              key: renamedNote.key,
              title: renamedNote.title,
              relativePath: renamedNote.relativePath,
            }
          : summary)
        return renamedNote
      },
      rebuildIndexes: () => calls.push("rebuild"),
      recordLatestOpenedNote: (note) => latestOpened.push(note.relativePath),
    })
    const controller = createWorkspaceController(deps)

    openManagerFolderPath(controller, "note/work")
    const alphaIndex = controller.getState().manager.items.findIndex((item) => item.type === "note" && item.key === "alpha-note")
    assert.notEqual(alphaIndex, -1)
    controller.focusManagerItem(alphaIndex)
    controller.openFocusedManagerItem()
    controller.showManager()
    openManagerFolderPath(controller, "note/work")
    controller.focusManagerItem(controller.getState().manager.items.findIndex((item) => item.type === "note" && item.key === "alpha-note"))

    const result = controller.renameFocusedManagerItem("Renamed Alpha")

    assert.equal(result.blocked, false)
    assert.equal(controller.getState().screen, "manager")
    assert.equal(controller.getState().mode, "manager.browse")
    assert.equal(controller.getState().editor?.note.key, "renamed-alpha")
    assert.equal(controller.getState().editor?.note.relativePath, "note/work/renamed-alpha.md")
    assert.equal(controller.getState().manager.status, "Renamed")
    assert.equal(controller.getState().manager.items.some((item) => item.type === "note" && item.key === "renamed-alpha"), true)
    assert.deepEqual(calls.filter((call) => call.startsWith("rename-note:") || call === "rebuild"), ["rename-note:alpha-note:Renamed Alpha", "rebuild"])
    assert.equal(latestOpened.at(-1), "note/work/renamed-alpha.md")
  })

  test("manager rename folder refreshes affected note rows without allowing protected folders", () => {
    let folders = ["note/work", "note/work/projects"]
    let summaries = [...phaseSevenSummaries]
    const { deps, calls } = createDeps({
      listNotes: () => summaries,
      listNoteFolders: () => folders,
      showNote: (selector) => phaseSevenNotesByKey[selector],
      renameFolder: (folderRelativePath, nextName) => {
        calls.push(`rename-folder:${folderRelativePath}:${nextName}`)
        folders = folders.map((folder) => folder === folderRelativePath ? "note/renamed-work" : folder.replace(/^note\/work\//u, "note/renamed-work/"))
        summaries = summaries.map((summary) => summary.relativePath.startsWith("note/work/")
          ? { ...summary, relativePath: summary.relativePath.replace(/^note\/work\//u, "note/renamed-work/") }
          : summary)
      },
      rebuildIndexes: () => calls.push("rebuild"),
    })
    const controller = createWorkspaceController(deps)

    openManagerFolderPath(controller, "note")
    const workFolderIndex = controller.getState().manager.items.findIndex((item) => item.type === "folder" && item.relativePath === "note/work")
    assert.notEqual(workFolderIndex, -1)
    controller.focusManagerItem(workFolderIndex)

    assert.equal(controller.renameFocusedManagerItem("Renamed Work").blocked, false)

    assert.equal(controller.getState().manager.status, "Renamed")
    assert.equal(controller.getState().manager.items.some((item) => item.type === "folder" && item.relativePath === "note/renamed-work"), true)
    assert.deepEqual(calls.filter((call) => call.startsWith("rename-folder:") || call === "rebuild"), ["rename-folder:note/work:Renamed Work", "rebuild"])

    openManagerFolderPath(controller, "draft")
    assert.equal(controller.renameFocusedManagerItem("Nope").blocked, false)
    assert.notEqual(calls.at(-1), "rename-folder:draft:Nope")
  })

  test("manager rename folder updates an open contained note and latest-opened path", () => {
    let folders = ["note/work", "note/work/projects"]
    let summaries = [...phaseSevenSummaries]
    let notesByKey = { ...phaseSevenNotesByKey }
    const latestOpened: string[] = []
    const { deps } = createDeps({
      listNotes: () => summaries,
      listNoteFolders: () => folders,
      showNote: (selector) => notesByKey[selector],
      recordLatestOpenedNote: (note) => latestOpened.push(note.relativePath),
      renameFolder: (folderRelativePath, nextName) => {
        assert.equal(folderRelativePath, "note/work")
        assert.equal(nextName, "Renamed Work")
        folders = folders.map((folder) => folder === folderRelativePath ? "note/renamed-work" : folder.replace(/^note\/work\//u, "note/renamed-work/"))
        summaries = summaries.map((summary) => summary.relativePath.startsWith("note/work/")
          ? { ...summary, relativePath: summary.relativePath.replace(/^note\/work\//u, "note/renamed-work/") }
          : summary)
        notesByKey = Object.fromEntries(Object.entries(notesByKey).map(([key, note]) => [
          key,
          note.relativePath.startsWith("note/work/")
            ? { ...note, relativePath: note.relativePath.replace(/^note\/work\//u, "note/renamed-work/") }
            : note,
        ]))
      },
    })
    const controller = createWorkspaceController(deps)

    openManagerFolderPath(controller, "note/work")
    const alphaIndex = controller.getState().manager.items.findIndex((item) => item.type === "note" && item.key === "alpha-note")
    assert.notEqual(alphaIndex, -1)
    controller.focusManagerItem(alphaIndex)
    assert.equal(controller.openFocusedManagerItem().blocked, false)
    assert.equal(controller.getState().editor?.note.relativePath, "note/work/alpha.md")
    assert.equal(latestOpened.at(-1), "note/work/alpha.md")

    controller.showManager()
    openManagerFolderPath(controller, "note")
    const workFolderIndex = controller.getState().manager.items.findIndex((item) => item.type === "folder" && item.relativePath === "note/work")
    assert.notEqual(workFolderIndex, -1)
    controller.focusManagerItem(workFolderIndex)

    assert.equal(controller.renameFocusedManagerItem("Renamed Work").blocked, false)

    assert.equal(controller.getState().screen, "manager")
    assert.equal(controller.getState().editor?.note.relativePath, "note/renamed-work/alpha.md")
    assert.equal(latestOpened.at(-1), "note/renamed-work/alpha.md")
  })

  test("manager move normal note refreshes rows and rejects draft destinations", () => {
    let summaries = [...phaseSevenSummaries]
    const movedNote: TuiNote = {
      ...phaseSevenNotesByKey["alpha-note"],
      relativePath: "note/work/projects/alpha.md",
    }
    const { deps, calls } = createDeps({
      listNotes: () => summaries,
      listNoteFolders: () => ["note/work", "note/work/projects"],
      showNote: (selector) => selector === "alpha-note" ? movedNote : phaseSevenNotesByKey[selector],
      moveNote: (selector, destinationFolder) => {
        calls.push(`move-note:${selector}:${destinationFolder}`)
        if (destinationFolder.startsWith("draft")) {
          throw new Error("invalid destination")
        }
        summaries = summaries.map((summary) => summary.key === selector ? { ...summary, relativePath: "note/work/projects/alpha.md" } : summary)
        return movedNote
      },
      rebuildIndexes: () => calls.push("rebuild"),
    })
    const controller = createWorkspaceController(deps)

    openManagerFolderPath(controller, "note/work")
    const alphaIndex = controller.getState().manager.items.findIndex((item) => item.type === "note" && item.key === "alpha-note")
    assert.notEqual(alphaIndex, -1)
    controller.focusManagerItem(alphaIndex)

    assert.equal(controller.moveFocusedManagerNote("note/work/projects").blocked, false)
    assert.equal(controller.getState().manager.status, "Moved")
    assert.deepEqual(calls.filter((call) => call.startsWith("move-note:") || call === "rebuild"), ["move-note:alpha-note:note/work/projects", "rebuild"])

    openManagerFolderPath(controller, "note/work/projects")
    assert.equal(controller.getState().manager.items.some((item) => item.type === "note" && item.key === "alpha-note"), true)

    assert.equal(controller.moveFocusedManagerNote("draft").blocked, false)
    assert.equal(controller.getState().manager.status, "invalid destination")
  })

  test("manager move prompt selects an existing folder destination", () => {
    const calls: string[] = []
    const movedNote: TuiNote = { ...phaseSevenNotesByKey["alpha-note"], relativePath: "note/work/projects/alpha.md" }
    const controller = createWorkspaceController(createDeps({
      listNotes: () => phaseSevenSummaries,
      listNoteFolders: () => ["note/work", "note/work/projects"],
      showNote: (selector) => phaseSevenNotesByKey[selector],
      moveNote: (selector, destinationFolder) => {
        calls.push(`move-note:${selector}:${destinationFolder}`)
        return movedNote
      },
    }).deps)

    openManagerFolderPath(controller, "note/work")
    const alphaIndex = controller.getState().manager.items.findIndex((item) => item.type === "note" && item.key === "alpha-note")
    assert.notEqual(alphaIndex, -1)
    controller.focusManagerItem(alphaIndex)
    controller.openManagerMove()
    const projectsFolderIndex = controller.getState().manager.items.findIndex((item) => item.type === "folder" && item.relativePath === "note/work/projects")
    assert.notEqual(projectsFolderIndex, -1)
    controller.focusManagerItem(projectsFolderIndex)

    assert.equal(controller.submitManagerAction().blocked, false)
    assert.equal(calls.at(-1), "move-note:alpha-note:note/work/projects")
    assert.equal(controller.getState().manager.status, "Moved")
  })

  test("manager create keeps prompt recoverable when folder create or refresh fails", async () => {
    const failingCreateController = createWorkspaceController(createDeps({
      listNotes: () => phaseSevenSummaries,
      listNoteFolders: () => ["note/work"],
      showNote: (selector) => phaseSevenNotesByKey[selector],
      createFolder: () => {
        throw new Error("create folder failed")
      },
    }).deps)
    openManagerFolderPath(failingCreateController, "note/work")
    failingCreateController.openManagerCreate()
    failingCreateController.updateManagerCreateTitle("broken-folder")

    await failingCreateController.submitManagerCreate()

    assert.equal(failingCreateController.getState().mode, "manager.create")
    assert.equal(failingCreateController.getState().manager.createDraft?.status, "Create folder failed")

    const failingRefreshController = createWorkspaceController(createDeps({
      listNotes: () => phaseSevenSummaries,
      listNoteFolders: () => ["note/work"],
      showNote: (selector) => phaseSevenNotesByKey[selector],
      createFolder: () => {},
      rebuildIndexes: () => {
        throw new Error("rebuild failed")
      },
    }).deps)
    openManagerFolderPath(failingRefreshController, "note/work")
    failingRefreshController.openManagerCreate()
    failingRefreshController.updateManagerCreateTitle("broken-rebuild")

    await failingRefreshController.submitManagerCreate()

    assert.equal(failingRefreshController.getState().mode, "manager.create")
    assert.equal(failingRefreshController.getState().manager.createDraft?.status, "Create folder failed")
  })

  test("manager create clears stale preview cache when a partial folder mutation fails", async () => {
    let currentBody = "Cached body before failed create"
    const summariesWithoutBodies = phaseSevenSummaries.map(({ body: _body, ...summary }) => summary)
    const controller = createWorkspaceController(createDeps({
      listNotes: () => summariesWithoutBodies,
      listNoteFolders: () => ["note/work"],
      showNote: (selector) => ({ ...phaseSevenNotesByKey[selector], body: currentBody }),
      createFolder: () => {
        currentBody = "Body changed by partial folder mutation"
        throw new Error("create failed after partial mutation")
      },
    }).deps)

    openManagerFolderPath(controller, "note/work")
    const alphaIndex = controller.getState().manager.items.findIndex((item) => item.type === "note" && item.key === "alpha-note")
    assert.notEqual(alphaIndex, -1)
    controller.focusManagerItem(alphaIndex)
    assert.deepEqual(controller.getManagerBrowserModel().preview.contentLines, ["Cached body before failed create"])

    controller.openManagerCreate()
    controller.updateManagerCreateTitle("broken-partial-create")
    await controller.submitManagerCreate()

    assert.equal(controller.getState().mode, "manager.create")
    assert.equal(controller.getState().manager.createDraft?.status, "Create folder failed")
    assert.deepEqual(controller.getManagerBrowserModel().preview.contentLines, ["Body changed by partial folder mutation"])
  })

  test("empty manager create title stays in the folder prompt with calm validation and does not create", async () => {
    const { deps, calls } = createDeps({
      listNotes: () => phaseSevenSummaries,
      listNoteFolders: () => ["note/work"],
      showNote: (selector) => phaseSevenNotesByKey[selector],
      createFolder: (folderRelativePath) => calls.push(`create-folder:${folderRelativePath}`),
      rebuildIndexes: () => calls.push("rebuild"),
    })
    const controller = createWorkspaceController(deps)

    openManagerFolderPath(controller, "note/work")
    controller.openManagerCreate()
    assert.equal(controller.getState().mode, "manager.create")
    controller.updateManagerCreateTitle("   ")
    const result = await controller.submitManagerCreate()

    assert.equal(result.blocked, false)
    assert.equal(controller.getState().screen, "manager")
    assert.equal(controller.getState().mode, "manager.create")
    assert.equal(controller.getState().manager.createDraft?.status, "Folder name required")
    assert.deepEqual(calls, [])
  })

  test("cancel manager create exits without creating", () => {
    const { deps, calls } = createDeps({
      listNotes: () => phaseSevenSummaries,
      listNoteFolders: () => ["note/work"],
      showNote: (selector) => phaseSevenNotesByKey[selector],
      createFolder: (folderRelativePath) => calls.push(`create-folder:${folderRelativePath}`),
    })
    const controller = createWorkspaceController(deps)

    openManagerFolderPath(controller, "note/work")
    controller.openManagerCreate()
    controller.updateManagerCreateTitle("Ignored")
    controller.cancelManagerCreate()

    assert.equal(controller.getState().mode, "manager.browse")
    assert.equal(controller.getState().manager.createDraft, null)
    assert.deepEqual(calls, [])
  })

  test("goBack cancels manager create mode and clears the draft", () => {
    const controller = createWorkspaceController(createDeps({
      listNotes: () => phaseSevenSummaries,
      listNoteFolders: () => ["note/work"],
      showNote: (selector) => phaseSevenNotesByKey[selector],
    }).deps)

    openManagerFolderPath(controller, "note/work")
    controller.openManagerCreate()
    controller.updateManagerCreateTitle("Draft Title")
    const result = controller.goBack()

    assert.equal(result.blocked, false)
    assert.equal(controller.getState().mode, "manager.browse")
    assert.equal(controller.getState().manager.createDraft, null)
  })

  test("manager delete confirmation deletes a note, refreshes, and clears an open editor", async () => {
    let currentSummaries = noteSummaries.map(({ body: _body, ...summary }) => summary)
    let currentDailyBody = "Original daily body"
    const { deps, calls } = createDeps({
      listNotes: () => {
        calls.push("list")
        return currentSummaries
      },
      showNote: (selector) => {
        calls.push(`show:${selector}`)
        return selector === "daily-plan" ? { ...notesByKey["daily-plan"], body: currentDailyBody } : notesByKey[selector]
      },
      deleteNote: (selector) => {
        calls.push(`delete:${selector}`)
        currentSummaries = currentSummaries.filter((summary) => summary.key !== selector)
      },
      rebuildIndexes: () => calls.push("rebuild"),
    })
    const controller = createWorkspaceController(deps)

    controller.focusManagerItem(1)
    controller.openFocusedManagerItem()
    assert.deepEqual(controller.getManagerBrowserModel().preview.contentLines, ["Original daily body"])
    controller.openFocusedManagerItem()
    controller.showManager()
    controller.openManagerDeleteConfirmation()

    assert.equal(controller.getState().mode, "manager.deleteConfirm")
    assert.equal(controller.getState().manager.deleteDraft?.key, "daily-plan")

    controller.cancelManagerDelete()
    assert.equal(controller.getState().mode, "manager.browse")
    assert.equal(controller.getState().manager.deleteDraft, null)
    assert.equal(controller.getState().editor?.note.key, "daily-plan")
    assert.equal(controller.getState().manager.items.some((item) => item.key === "daily-plan"), true)
    assert.equal(calls.some((call) => call.startsWith("delete:")), false)

    controller.openManagerDeleteConfirmation()
    assert.equal(controller.getState().mode, "manager.deleteConfirm")
    assert.equal(controller.getState().manager.deleteDraft?.key, "daily-plan")

    const result = await controller.confirmManagerDelete()

    assert.equal(result.blocked, false)
    assert.equal(controller.getState().screen, "manager")
    assert.equal(controller.getState().mode, "manager.browse")
    assert.equal(controller.getState().editor, null)
    assert.equal(controller.getState().manager.deleteDraft, null)
    assert.equal(controller.getState().manager.items.some((item) => item.key === "daily-plan"), false)
    assert.deepEqual(calls, ["list", "show:daily-plan", "show:daily-plan", "delete:daily-plan", "rebuild", "list"])

    currentDailyBody = "Recreated daily body must not use deleted-note preview cache"
    currentSummaries = [{
      key: "daily-plan",
      title: "Daily Plan",
      description: "Today priorities.",
      relativePath: "notes/inbox/daily-plan.md",
    }]
    controller.refreshManager()
    assert.deepEqual(controller.getManagerBrowserModel().preview.contentLines, ["Recreated daily body must not use deleted-note preview cache"])
  })

  test("manager delete confirmation is blocked while the open editor is dirty or autosave failed", async () => {
    const scheduler = createFakeScheduler()
    let currentSummaries = [...noteSummaries]
    const { deps, calls } = createDeps({
      autosaveScheduler: scheduler,
      persistEditorBody: () => Promise.reject(new Error("disk full")),
      listNotes: () => {
        calls.push("list")
        return currentSummaries
      },
      deleteNote: (selector) => {
        calls.push(`delete:${selector}`)
        currentSummaries = currentSummaries.filter((summary) => summary.key !== selector)
      },
      rebuildIndexes: () => calls.push("rebuild"),
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.insertEditorText(" dirty")
    controller.showManager()
    controller.toggleManagerPreview()
    controller.openManagerDeleteConfirmation()

    const dirtyResult = await controller.confirmManagerDelete()
    assert.deepEqual(dirtyResult, { blocked: true, reason: "dirty-editor" })
    assert.equal(controller.getState().mode, "manager.deleteConfirm")
    assert.equal(controller.getState().manager.previewVisible, false)
    assert.equal(controller.getState().manager.deleteDraft?.status, "Save or discard current note first")
    assert.match(buildManagerViewModel(controller.getState()).deletePrompt?.status ?? "", /Save or discard/)
    assert.equal(controller.getState().editor?.body, "Original daily body dirty")
    assert.equal(calls.some((call) => call.startsWith("delete:")), false)

    controller.cancelManagerDelete()
    controller.showEditor()
    scheduler.runNext()
    await Promise.resolve()
    await Promise.resolve()
    assert.equal(controller.getState().editor?.autosaveStatus, "error")

    controller.showManager()
    controller.openManagerDeleteConfirmation()
    const failedAutosaveResult = await controller.confirmManagerDelete()
    assert.deepEqual(failedAutosaveResult, { blocked: true, reason: "dirty-editor" })
    assert.equal(controller.getState().mode, "manager.deleteConfirm")
    assert.equal(calls.some((call) => call.startsWith("delete:")), false)
  })

  test("manager delete confirmation cancels and refuses folders without deletion", async () => {
    const { deps, calls } = createDeps({
      deleteNote: (selector) => calls.push(`delete:${selector}`),
    })
    const controller = createWorkspaceController(deps)

    controller.openManagerDeleteConfirmation()
    assert.equal(controller.getState().mode, "manager.browse")
    assert.equal(controller.getState().manager.status, "Folders cannot be deleted here")
    assert.equal(controller.getState().manager.deleteDraft, null)

    controller.focusManagerItem(1)
    assert.equal(controller.getState().manager.status, null)
    controller.openFocusedManagerItem()
    controller.openManagerDeleteConfirmation()
    assert.equal(controller.getState().mode, "manager.deleteConfirm")
    controller.cancelManagerDelete()

    assert.equal(controller.getState().mode, "manager.browse")
    assert.equal(controller.getState().manager.deleteDraft, null)
    assert.equal(calls.some((call) => call.startsWith("delete:")), false)
  })

  test("manager delete confirmation keeps prompt recoverable when delete is unavailable or fails", async () => {
    const noDeleteController = createWorkspaceController(createDeps().deps)
    noDeleteController.focusManagerItem(1)
    noDeleteController.openFocusedManagerItem()
    noDeleteController.openManagerDeleteConfirmation()

    await noDeleteController.confirmManagerDelete()

    assert.equal(noDeleteController.getState().mode, "manager.deleteConfirm")
    assert.equal(noDeleteController.getState().manager.deleteDraft?.status, "Delete unavailable")

    const failingController = createWorkspaceController(createDeps({
      deleteNote: () => {
        throw new Error("delete failed")
      },
    }).deps)
    failingController.focusManagerItem(1)
    failingController.openFocusedManagerItem()
    failingController.openManagerDeleteConfirmation()

    await failingController.confirmManagerDelete()

    assert.equal(failingController.getState().mode, "manager.deleteConfirm")
    assert.equal(failingController.getState().manager.deleteDraft?.status, "Delete failed")
  })

  test("manager delete clears stale preview cache when a partial mutation fails", async () => {
    let currentBody = "Cached body before failed delete"
    const summariesWithoutBodies = noteSummaries.map(({ body: _body, ...summary }) => summary)
    const controller = createWorkspaceController(createDeps({
      listNotes: () => summariesWithoutBodies,
      showNote: (selector) => ({ ...notesByKey[selector], body: currentBody }),
      deleteNote: () => {
        currentBody = "Body changed by partial delete mutation"
        throw new Error("delete failed after partial mutation")
      },
    }).deps)

    controller.focusManagerItem(1)
    controller.openFocusedManagerItem()
    controller.focusManagerItem(0)
    assert.deepEqual(controller.getManagerBrowserModel().preview.contentLines, ["Cached body before failed delete"])

    controller.openManagerDeleteConfirmation()
    await controller.confirmManagerDelete()

    assert.equal(controller.getState().mode, "manager.deleteConfirm")
    assert.equal(controller.getState().manager.deleteDraft?.status, "Delete failed")
    assert.deepEqual(controller.getManagerBrowserModel().preview.contentLines, ["Body changed by partial delete mutation"])
  })

  test("manager filter updates visible manager state and preview, and clear restores browsing", () => {
    const { deps } = createDeps()
    const controller = createWorkspaceController(deps)

    controller.openManagerFilter()
    controller.setManagerFilter("inbox")

    assert.equal(controller.getState().screen, "manager")
    assert.equal(controller.getState().mode, "manager.filter")
    assert.equal(controller.getState().manager.filterQuery, "inbox")
    assert.deepEqual(controller.getState().manager.items.map((item) => item.key), ["notes/inbox"])
    assert.equal(controller.getState().manager.hoveredPath, "notes/inbox")

    controller.clearManagerFilter()

    assert.equal(controller.getState().mode, "manager.browse")
    assert.equal(controller.getState().manager.filterQuery, "")
    assert.deepEqual(controller.getState().manager.items.map((item) => item.key), ["notes/archive", "notes/inbox"])

    controller.openManagerFilter()
    controller.updateManagerFilter("inbox")
    assert.equal(routeManagerKey("\r", controller), true)
    assert.equal(controller.getState().screen, "manager")
    assert.equal(controller.getState().mode, "manager.browse")
    assert.equal(controller.getState().manager.currentFolderPath, "notes/inbox")
    assert.equal(controller.getState().manager.filterQuery, "")
  })

  test("manager filter routing moves filtered focus, opens the focused note, and clears on Arrow Left", () => {
    const { deps } = createDeps({
      listNotes: () => [
        {
          key: "daily-plan",
          title: "Daily Plan",
          description: "Today priorities.",
          relativePath: "notes/inbox/daily-plan.md",
          body: "Original daily body",
        },
        {
          key: "daily-retro",
          title: "Daily Retro",
          description: "Today retrospective.",
          relativePath: "notes/inbox/daily-retro.md",
          body: "Retro body",
        },
      ],
      showNote: (selector) => ({
        key: selector,
        title: selector,
        description: "",
        relativePath: `notes/inbox/${selector}.md`,
        body: `${selector} body`,
      }),
    })
    const controller = createWorkspaceController(deps)

    controller.focusManagerItem(0)
    assert.equal(controller.openFocusedManagerItem().blocked, false)
    controller.openManagerFilter()
    assert.equal(routeManagerKey("d", controller), true)
    assert.equal(routeManagerKey("a", controller), true)
    assert.deepEqual(controller.getState().manager.items.map((item) => item.key), ["daily-plan", "daily-retro"])

    assert.equal(routeManagerKey("\u001b[B", controller), true)
    assert.equal(controller.getState().manager.focusedIndex, 1)
    assert.equal(controller.getState().manager.filterQuery, "da")

    assert.equal(routeManagerKey("\r", controller), true)
    assert.equal(controller.getState().screen, "editor")
    assert.equal(controller.getState().editor?.note.key, "daily-retro")
    assert.equal(controller.getState().manager.filterQuery, "")
    assert.equal(controller.getState().mode, "editor.body")

    assert.equal(controller.showManager().blocked, false)
    controller.openManagerFilter()
    controller.updateManagerFilter("retro")
    assert.equal(routeManagerKey("\u001b[D", controller), true)
    assert.equal(controller.getState().mode, "manager.browse")
    assert.equal(controller.getState().manager.filterQuery, "")
  })

  test("manager filter Enter and Arrow Right open the visible filtered note when full-list index points at a folder", () => {
    const rootSummaries: NoteManagerSummary[] = [
      {
        key: "project-plan",
        title: "Project Plan",
        description: "Nested note that creates a root folder row.",
        relativePath: "notes/projects/project-plan.md",
        body: "Project body",
      },
      {
        key: "target-note",
        title: "Target Note",
        description: "Top-level note visible after filtering.",
        relativePath: "notes/target-note.md",
        body: "Target body",
      },
    ]
    const notes = Object.fromEntries(rootSummaries.map((note) => [note.key, note])) as Record<string, TuiNote>
    const openWith = (sequence: "\r" | "\u001b[C") => {
      const { deps } = createDeps({
        listNotes: () => rootSummaries,
        showNote: (selector) => notes[selector],
      })
      const controller = createWorkspaceController(deps)

      assert.equal(controller.getState().manager.items[0]?.type, "folder")
      assert.equal(controller.getState().manager.items[0]?.relativePath, "notes/projects")
      controller.openManagerFilter()
      controller.updateManagerFilter("target")
      assert.deepEqual(controller.getManagerBrowserModel().layout1Rows.map((row) => row.relativePath), ["notes/target-note.md"])

      assert.equal(routeManagerKey(sequence, controller), true)
      assert.equal(controller.getState().screen, "editor")
      assert.equal(controller.getState().editor?.note.key, "target-note")
    }

    openWith("\r")
    openWith("\u001b[C")
  })

  test("toggleSearch records previous mode and toggles back when search is already active", () => {
    const { deps } = createDeps()
    const controller = createWorkspaceController(deps)

    controller.openManagerFilter()
    controller.updateManagerFilter("archive")
    controller.toggleSearch("arc")

    assert.equal(controller.getState().screen, "search")
    assert.equal(controller.getState().mode, "search.input")
    assert.equal(controller.getState().search?.previousScreen, "manager")
    assert.equal(controller.getState().search?.previousMode, "manager.filter")

    controller.toggleSearch()

    assert.equal(controller.getState().screen, "manager")
    assert.equal(controller.getState().mode, "manager.filter")
    assert.equal(controller.getState().manager.filterQuery, "archive")
  })

  test("selecting the current dirty note from search restores editor body mode without discarding edits", () => {
    const { deps } = createDeps()
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("Unsaved daily body")
    controller.openSearch("daily")

    const result = controller.selectSearchResult({
      kind: "note",
      id: "note:daily-plan",
      key: "daily-plan",
      filename: "daily-plan.md",
      title: "Daily Plan",
      description: "Today priorities.",
      relativePath: "notes/inbox/daily-plan.md",
      label: "Daily Plan",
      detail: "daily-plan.md — notes/inbox/daily-plan.md",
      score: 100,
      matchedFields: ["title"],
    })

    assert.equal(result.blocked, false)
    assert.equal(controller.getState().screen, "editor")
    assert.equal(controller.getState().mode, "editor.body")
    assert.equal(controller.getState().search, null)
    assert.equal(controller.getState().editor?.body, "Unsaved daily body")
    assert.equal(controller.getState().editor?.dirty, true)
  })

  test("dirty, autosave pending, saving, and error editor states require destructive confirmation", () => {
    const { deps, calls } = createDeps({
      commandHandlers: {
        "/quit": () => calls.push("command:/quit"),
      },
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("Unsaved daily body")

    const blockedQuit = controller.runCommand("/quit")
    assert.equal(blockedQuit.blocked, true)
    assert.equal(blockedQuit.reason, "dirty-editor")
    assert.equal(calls.includes("command:/quit"), false)

    const blockedDirectQuit = controller.requestQuit()
    assert.equal(blockedDirectQuit.blocked, true)
    assert.equal(blockedDirectQuit.reason, "dirty-editor")
    assert.equal(controller.requestQuit({ confirmed: true }).blocked, false)

    const cleanEditor = {
      note: notesByKey["daily-plan"],
      body: "Original daily body",
      savedBody: "Original daily body",
      dirty: false,
      autosaveStatus: "saved" as const,
    }

    assert.equal(editorRequiresDestructiveConfirmation(cleanEditor), false)
    assert.equal(editorRequiresDestructiveConfirmation({ ...cleanEditor, dirty: true }), true)
    assert.equal(editorRequiresDestructiveConfirmation({ ...cleanEditor, autosaveStatus: "pending" }), true)
    assert.equal(editorRequiresDestructiveConfirmation({ ...cleanEditor, autosaveStatus: "saving" }), true)
    assert.equal(editorRequiresDestructiveConfirmation({ ...cleanEditor, autosaveStatus: "error" }), true)
  })

  test("changing editor body marks dirty, sets autosave pending, and debounces persistence for 750ms", async () => {
    const scheduler = createFakeScheduler()
    const persistedBodies: string[] = []
    const { deps } = createDeps({
      autosaveScheduler: scheduler,
      persistEditorBody: (note, body) => {
        persistedBodies.push(`${note.key}:${body}`)
        return { ...note, body }
      },
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("Draft one")

    assert.equal(controller.getState().editor?.dirty, true)
    assert.equal(controller.getState().editor?.autosaveStatus, "pending")
    assert.deepEqual(scheduler.activeTasks().map((task) => task.delay), [750])
    assert.deepEqual(persistedBodies, [])

    controller.updateEditorBody("Draft two")
    assert.equal(scheduler.tasks[0]?.cleared, true)
    assert.deepEqual(scheduler.activeTasks().map((task) => task.delay), [750])

    scheduler.runNext()
    await Promise.resolve()

    assert.deepEqual(persistedBodies, ["daily-plan:Draft two"])
    assert.equal(controller.getState().editor?.body, "Draft two")
    assert.equal(controller.getState().editor?.savedBody, "Draft two")
    assert.equal(controller.getState().editor?.dirty, false)
    assert.equal(controller.getState().editor?.autosaveStatus, "saved")
  })

  test("successful autosave after controlled typing saves the submitted snapshot without error", async () => {
    const scheduler = createFakeScheduler()
    const persistedSnapshots: Array<{ key: string; relativePath: string; body: string }> = []
    const { deps } = createDeps({
      autosaveScheduler: scheduler,
      persistEditorBody: (note, body) => {
        persistedSnapshots.push({ key: note.key, relativePath: note.relativePath, body })
        return { ...note, body }
      },
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.insertEditorText(" typed autosave token")
    assert.equal(controller.getState().screen, "editor")
    assert.equal(controller.getState().mode, "editor.body")
    assert.equal(controller.getState().editor?.body, "Original daily body typed autosave token")
    assert.equal(controller.getState().editor?.savedBody, "Original daily body")
    assert.equal(controller.getState().editor?.autosaveStatus, "pending")

    scheduler.runNext()
    await Promise.resolve()

    assert.deepEqual(persistedSnapshots, [
      {
        key: "daily-plan",
        relativePath: "notes/inbox/daily-plan.md",
        body: "Original daily body typed autosave token",
      },
    ])
    assert.equal(controller.getState().editor?.note.key, "daily-plan")
    assert.equal(controller.getState().editor?.note.relativePath, "notes/inbox/daily-plan.md")
    assert.equal(controller.getState().editor?.body, "Original daily body typed autosave token")
    assert.equal(controller.getState().editor?.savedBody, "Original daily body typed autosave token")
    assert.equal(controller.getState().editor?.dirty, false)
    assert.equal(controller.getState().editor?.autosaveStatus, "saved")
  })

  test("autosave after controlled typing reports failure only when persistence throws", async () => {
    const scheduler = createFakeScheduler()
    const persistenceErrors: string[] = []
    const { deps } = createDeps({
      autosaveScheduler: scheduler,
      persistEditorBody: (note, body) => {
        persistenceErrors.push(`Error: atomic writer temp write failed for ${note.key} ${note.relativePath} ${body}`)
        throw new Error("atomic writer temp write failed")
      },
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.insertEditorText(" typed failing autosave token")
    scheduler.runNext()
    await Promise.resolve()
    await Promise.resolve()

    assert.deepEqual(persistenceErrors, [
      "Error: atomic writer temp write failed for daily-plan notes/inbox/daily-plan.md Original daily body typed failing autosave token",
    ])
    assert.equal(controller.getState().screen, "editor")
    assert.equal(controller.getState().mode, "editor.body")
    assert.equal(controller.getState().editor?.body, "Original daily body typed failing autosave token")
    assert.equal(controller.getState().editor?.savedBody, "Original daily body")
    assert.equal(controller.getState().editor?.dirty, true)
    assert.equal(controller.getState().editor?.autosaveStatus, "error")
  })

  test("autosave uses the same persistence dependency as manual save", async () => {
    const scheduler = createFakeScheduler()
    const persistedBodies: string[] = []
    const { deps } = createDeps({
      autosaveScheduler: scheduler,
      persistEditorBody: (note, body) => {
        persistedBodies.push(`${note.key}:${body}`)
        return { ...note, body }
      },
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("Manual body")
    await controller.saveEditor()
    controller.updateEditorBody("Autosaved body")
    scheduler.runNext()
    await Promise.resolve()

    assert.deepEqual(persistedBodies, ["daily-plan:Manual body", "daily-plan:Autosaved body"])
  })

  test("AI idle autosave scheduling waits until successful changed saves and does not call providers immediately", async () => {
    const autosaveScheduler = createFakeScheduler()
    const aiIdleScheduler = createFakeScheduler()
    const aiCalls: string[] = []
    const persistedBodies: string[] = []
    const { deps } = createDeps({
      initialAiStatus: { kind: "connected", model: "gpt-4o-mini" },
      autosaveScheduler,
      aiIdleScheduler,
      aiActions: {
        describeNote: (selector) => {
          aiCalls.push(`describe:${selector}`)
          return Promise.resolve({ key: selector, status: "applied" })
        },
        processQueue: () => {
          aiCalls.push("process")
          return Promise.resolve({ applied: 0, failed: 0, remaining: 0 })
        },
      },
      persistEditorBody: (note, body) => {
        persistedBodies.push(`${note.key}:${body}`)
        // The default TUI persistence path can return a note object whose body
        // has already been updated by lower-level storage/indexing code. AI
        // idle scheduling must compare against the editor's savedBody snapshot,
        // not the persisted note object.
        note.body = body
        return { ...note, body }
      },
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("AI idle autosave body one")
    autosaveScheduler.runNext()
    await Promise.resolve()

    assert.deepEqual(persistedBodies, ["daily-plan:AI idle autosave body one"])
    assert.deepEqual(aiCalls, [])
    assert.deepEqual(aiIdleScheduler.activeTasks().map((task) => task.delay), [10_000])

    controller.updateEditorBody("AI idle autosave body two")
    assert.equal(aiIdleScheduler.tasks[0]?.cleared, true)
    assert.deepEqual(aiIdleScheduler.activeTasks(), [])

    autosaveScheduler.runNext()
    await Promise.resolve()
    assert.deepEqual(persistedBodies, ["daily-plan:AI idle autosave body one", "daily-plan:AI idle autosave body two"])
    assert.deepEqual(aiCalls, [])
    assert.deepEqual(aiIdleScheduler.activeTasks().map((task) => task.delay), [10_000])
  })

  test("AI idle scheduler errors do not turn changed autosaves into persistence failures", async () => {
    const autosaveScheduler = createFakeScheduler()
    const persistedBodies: string[] = []
    const throwingAiIdleScheduler = {
      setTimeout: () => {
        throw new Error("scheduler unavailable")
      },
      clearTimeout: () => undefined,
    }
    const { deps } = createDeps({
      initialAiStatus: { kind: "connected", model: "gpt-4o-mini" },
      autosaveScheduler,
      aiIdleScheduler: throwingAiIdleScheduler,
      aiActions: {
        processQueue: () => Promise.resolve({ applied: 0, failed: 0, remaining: 0 }),
      },
      persistEditorBody: (note, body) => {
        persistedBodies.push(`${note.key}:${body}`)
        return { ...note, body }
      },
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("AI idle autosave survives scheduler failure")
    autosaveScheduler.runNext()
    await Promise.resolve()

    assert.deepEqual(persistedBodies, ["daily-plan:AI idle autosave survives scheduler failure"])
    assert.equal(controller.getState().editor?.dirty, false)
    assert.equal(controller.getState().editor?.autosaveStatus, "saved")
    assert.equal(controller.getState().editor?.savedBody, "AI idle autosave survives scheduler failure")
  })

  test("AI idle scheduler errors do not turn changed manual saves into dirty blocked failures", async () => {
    const persistedBodies: string[] = []
    const throwingAiIdleScheduler = {
      setTimeout: () => {
        throw new Error("scheduler unavailable")
      },
      clearTimeout: () => undefined,
    }
    const { deps } = createDeps({
      initialAiStatus: { kind: "connected", model: "gpt-4o-mini" },
      aiIdleScheduler: throwingAiIdleScheduler,
      aiActions: {
        processQueue: () => Promise.resolve({ applied: 0, failed: 0, remaining: 0 }),
      },
      persistEditorBody: (note, body) => {
        persistedBodies.push(`${note.key}:${body}`)
        return { ...note, body }
      },
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("AI idle manual save survives scheduler failure")

    assert.deepEqual(await controller.saveEditor(), { blocked: false })
    assert.deepEqual(persistedBodies, ["daily-plan:AI idle manual save survives scheduler failure"])
    assert.equal(controller.getState().editor?.dirty, false)
    assert.equal(controller.getState().editor?.autosaveStatus, "saved")
    assert.equal(controller.getState().editor?.savedBody, "AI idle manual save survives scheduler failure")
  })

  test("AI idle scheduler failure does not leave orphaned pending work for later manager navigation", async () => {
    const aiCalls: string[] = []
    const throwingAiIdleScheduler = {
      setTimeout: () => {
        throw new Error("scheduler unavailable")
      },
      clearTimeout: () => undefined,
    }
    const { deps } = createDeps({
      initialAiStatus: { kind: "connected", model: "gpt-4o-mini" },
      aiIdleScheduler: throwingAiIdleScheduler,
      aiActions: {
        enqueueNote: (selector) => {
          aiCalls.push(`enqueue:${selector}`)
          return { queued: 1, failed: 0 }
        },
        processQueue: () => {
          aiCalls.push("process")
          return Promise.resolve({ applied: 0, failed: 0, remaining: 0 })
        },
      },
      persistEditorBody: (note, body) => ({ ...note, body }),
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("AI idle scheduler failure should not queue later")
    assert.deepEqual(await controller.saveEditor(), { blocked: false })

    assert.deepEqual(controller.showManager(), { blocked: false })
    assert.deepEqual(openArchiveReview(controller, { confirmed: true }), { blocked: false })
    await flushBackgroundAi()

    assert.deepEqual(aiCalls, [])
  })

  test("AI idle opening another note does not queue before dirty switch confirmation", async () => {
    const aiIdleScheduler = createFakeScheduler()
    const aiCalls: string[] = []
    const { deps } = createDeps({
      initialAiStatus: { kind: "connected", model: "gpt-4o-mini" },
      aiIdleScheduler,
      aiActions: {
        enqueueNote: (selector) => {
          aiCalls.push(`enqueue:${selector}`)
          return { queued: 1, failed: 0 }
        },
        processQueue: () => {
          aiCalls.push("process")
          return Promise.resolve({ applied: 0, failed: 0, remaining: 0 })
        },
      },
      persistEditorBody: (note, body) => ({ ...note, body }),
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("AI idle saved before dirty edit")
    assert.deepEqual(await controller.saveEditor(), { blocked: false })
    controller.updateEditorBody("AI idle dirty edit must block before queue")
    assert.deepEqual(controller.showManager(), { blocked: false })

    assert.deepEqual(openArchiveReview(controller), { blocked: true, reason: "dirty-editor" })
    await flushBackgroundAi()

    assert.deepEqual(aiCalls, [])
    assert.deepEqual(aiIdleScheduler.activeTasks(), [])
  })

  test("AI idle manual save queues only latest saved editor body after 10 seconds of editor idle", async () => {
    const aiIdleScheduler = createFakeScheduler()
    const aiCalls: string[] = []
    const persistedBodies: string[] = []
    const { deps } = createDeps({
      initialAiStatus: { kind: "connected", model: "gpt-4o-mini" },
      aiIdleScheduler,
      aiActions: {
        enqueueNote: (selector) => {
          aiCalls.push(`enqueue:${selector}:${controller.getState().editor?.savedBody ?? "missing"}`)
          return { queued: 1, failed: 0 }
        },
        processQueue: () => {
          aiCalls.push("process")
          return Promise.resolve({ applied: 1, failed: 0, queued: 0, remaining: 0 })
        },
      },
      persistEditorBody: (note, body) => {
        persistedBodies.push(`${note.key}:${body}`)
        return { ...note, body }
      },
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("AI idle manual saved first body")
    assert.deepEqual(await controller.saveEditor(), { blocked: false })
    assert.deepEqual(aiIdleScheduler.activeTasks().map((task) => task.delay), [10_000])

    controller.updateEditorBody("AI idle manual saved latest body")
    assert.deepEqual(await controller.saveEditor(), { blocked: false })

    assert.deepEqual(persistedBodies, [
      "daily-plan:AI idle manual saved first body",
      "daily-plan:AI idle manual saved latest body",
    ])
    assert.equal(aiIdleScheduler.tasks[0]?.cleared, true)
    assert.deepEqual(aiIdleScheduler.activeTasks().map((task) => task.delay), [10_000])

    aiIdleScheduler.runNext()
    assert.deepEqual(aiCalls, ["enqueue:daily-plan:AI idle manual saved latest body"])
    await flushBackgroundAi()
    assert.deepEqual(aiCalls, ["enqueue:daily-plan:AI idle manual saved latest body", "process"])

    controller.updateEditorBody("AI idle manual saved latest body while queue is pending")
    assert.equal(controller.getState().editor?.body, "AI idle manual saved latest body while queue is pending")
    assert.equal(controller.getState().editor?.dirty, true)
  })

  test("AI idle switching to manager before autosave completes queues after 5 seconds of manager idle", async () => {
    const autosaveScheduler = createFakeScheduler()
    const aiIdleScheduler = createFakeScheduler()
    const aiCalls: string[] = []
    const { deps } = createDeps({
      initialAiStatus: { kind: "connected", model: "gpt-4o-mini" },
      autosaveScheduler,
      aiIdleScheduler,
      aiActions: {
        enqueueNote: (selector) => {
          aiCalls.push(`enqueue:${selector}`)
          return { queued: 1, failed: 0 }
        },
        processQueue: () => {
          aiCalls.push("process")
          return Promise.resolve({ applied: 1, failed: 0, queued: 0, remaining: 0 })
        },
      },
      persistEditorBody: (note, body) => ({ ...note, body }),
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("manager before autosave body")
    assert.deepEqual(autosaveScheduler.activeTasks().map((task) => task.delay), [750])
    assert.deepEqual(controller.showManager(), { blocked: false })
    assert.deepEqual(aiIdleScheduler.activeTasks(), [])

    autosaveScheduler.runNext()
    await flushBackgroundAi()

    assert.deepEqual(aiCalls, [])
    assert.deepEqual(aiIdleScheduler.activeTasks().map((task) => task.delay), [5_000])

    aiIdleScheduler.runNext()
    assert.deepEqual(aiCalls, ["enqueue:daily-plan"])
    await flushBackgroundAi()
    assert.deepEqual(aiCalls, ["enqueue:daily-plan", "process"])
  })

  test("AI idle switching from editor to manager queues the open note after 5 seconds of manager idle", async () => {
    const aiIdleScheduler = createFakeScheduler()
    const aiCalls: string[] = []
    const { deps } = createDeps({
      initialAiStatus: { kind: "connected", model: "gpt-4o-mini" },
      aiIdleScheduler,
      aiActions: {
        enqueueNote: (selector) => {
          aiCalls.push(`enqueue:${selector}`)
          return { queued: 1, failed: 0 }
        },
        processQueue: () => {
          aiCalls.push("process")
          return Promise.resolve({ applied: 1, failed: 0, queued: 0, remaining: 0 })
        },
      },
      persistEditorBody: (note, body) => ({ ...note, body }),
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("manager idle body")
    assert.deepEqual(await controller.saveEditor(), { blocked: false })
    assert.deepEqual(aiIdleScheduler.activeTasks().map((task) => task.delay), [10_000])

    assert.deepEqual(controller.showManager(), { blocked: false })
    assert.deepEqual(aiCalls, [])
    assert.equal(aiIdleScheduler.tasks[0]?.cleared, true)
    assert.deepEqual(aiIdleScheduler.activeTasks().map((task) => task.delay), [5_000])

    aiIdleScheduler.runNext()
    assert.deepEqual(aiCalls, ["enqueue:daily-plan"])
    await flushBackgroundAi()
    assert.deepEqual(aiCalls, ["enqueue:daily-plan", "process"])
  })

  test("AI idle manager navigation resets the 5 second manager idle timer", async () => {
    const aiIdleScheduler = createFakeScheduler()
    const aiCalls: string[] = []
    const { deps } = createDeps({
      initialAiStatus: { kind: "connected", model: "gpt-4o-mini" },
      aiIdleScheduler,
      aiActions: {
        enqueueNote: (selector) => {
          aiCalls.push(`enqueue:${selector}`)
          return { queued: 1, failed: 0 }
        },
        processQueue: () => Promise.resolve({ applied: 1, failed: 0, queued: 0, remaining: 0 }),
      },
      persistEditorBody: (note, body) => ({ ...note, body }),
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("manager idle reset body")
    assert.deepEqual(await controller.saveEditor(), { blocked: false })
    assert.deepEqual(controller.showManager(), { blocked: false })
    const firstManagerTimer = aiIdleScheduler.activeTasks()[0]

    controller.moveManagerSelection("down")

    assert.equal(firstManagerTimer?.cleared, true)
    assert.deepEqual(aiIdleScheduler.activeTasks().map((task) => task.delay), [5_000])
    assert.deepEqual(aiCalls, [])

    aiIdleScheduler.runNext()
    assert.deepEqual(aiCalls, ["enqueue:daily-plan"])
  })

  test("AI idle Search Everything note selection immediately queues the previously edited note", async () => {
    const aiIdleScheduler = createFakeScheduler()
    const aiCalls: string[] = []
    const { deps } = createDeps({
      initialAiStatus: { kind: "connected", model: "gpt-4o-mini" },
      aiIdleScheduler,
      aiActions: {
        enqueueNote: (selector) => {
          aiCalls.push(`enqueue:${selector}`)
          return { queued: 1, failed: 0 }
        },
        processQueue: () => {
          aiCalls.push("process")
          return Promise.resolve({ applied: 1, failed: 0, queued: 0, remaining: 0 })
        },
      },
      persistEditorBody: (note, body) => ({ ...note, body }),
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("search immediately queues previous note")
    assert.deepEqual(await controller.saveEditor(), { blocked: false })
    assert.deepEqual(controller.showManager(), { blocked: false })
    assert.deepEqual(aiIdleScheduler.activeTasks().map((task) => task.delay), [5_000])

    controller.openSearch("archive")
    const result = controller.selectSearchResult({
      kind: "note",
      id: "note:archive-review",
      key: "archive-review",
      filename: "archive-review.md",
      title: "Archive Review",
      description: "Old ideas.",
      relativePath: "notes/archive/archive-review.md",
      label: "Archive Review",
      detail: "archive-review.md — notes/archive/archive-review.md",
      score: 100,
      matchedFields: ["title"],
    })

    assert.deepEqual(result, { blocked: false })
    assert.equal(controller.getState().editor?.note.key, "archive-review")
    assert.equal(aiIdleScheduler.tasks.some((task) => task.delay === 5_000 && task.cleared), true)
    assert.deepEqual(aiCalls, ["enqueue:daily-plan"])
    await flushBackgroundAi()
    assert.deepEqual(aiCalls, ["enqueue:daily-plan", "process"])
  })

  test("AI idle opening another note from manager immediately queues the previously edited note", async () => {
    const aiIdleScheduler = createFakeScheduler()
    const aiCalls: string[] = []
    const { deps } = createDeps({
      initialAiStatus: { kind: "connected", model: "gpt-4o-mini" },
      aiIdleScheduler,
      aiActions: {
        enqueueNote: (selector) => {
          aiCalls.push(`enqueue:${selector}`)
          return { queued: 1, failed: 0 }
        },
        processQueue: () => {
          aiCalls.push("process")
          return Promise.resolve({ applied: 1, failed: 0, queued: 0, remaining: 0 })
        },
      },
      persistEditorBody: (note, body) => ({ ...note, body }),
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("manager immediate body")
    assert.deepEqual(await controller.saveEditor(), { blocked: false })
    assert.deepEqual(controller.showManager(), { blocked: false })
    assert.deepEqual(aiIdleScheduler.activeTasks().map((task) => task.delay), [5_000])

    assert.deepEqual(openArchiveReview(controller, { confirmed: true }), { blocked: false })
    assert.equal(aiIdleScheduler.tasks.some((task) => task.delay === 5_000 && task.cleared), true)
    assert.deepEqual(aiCalls, ["enqueue:daily-plan"])
    await flushBackgroundAi()
    assert.deepEqual(aiCalls, ["enqueue:daily-plan", "process"])
  })

  test("AI status label reports queue processing progress without provider names", () => {
    const { deps } = createDeps({ initialAiStatus: { kind: "running", progress: { processed: 1, total: 3 }, queue: { queued: 2, failed: 1 } } })
    const controller = createWorkspaceController(deps)

    assert.equal(buildManagerViewModel(controller.getState()).aiStatus.text, "AI: running · processing 1/3 · 1 failed")
  })

  test("AI idle manual process command clears pending delayed queue work", async () => {
    const aiIdleScheduler = createFakeScheduler()
    const queueCalls: string[] = []
    const { deps } = createDeps({
      initialAiStatus: { kind: "connected", model: "gpt-4o-mini" },
      aiIdleScheduler,
      aiActions: {
        processQueue: () => {
          queueCalls.push("process")
          return Promise.resolve({ applied: 0, failed: 0, remaining: 0 })
        },
      },
      persistEditorBody: (note, body) => ({ ...note, body }),
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("AI idle explicit process clears timer")
    assert.deepEqual(await controller.saveEditor(), { blocked: false })
    assert.deepEqual(aiIdleScheduler.activeTasks().map((task) => task.delay), [10_000])

    assert.deepEqual(controller.runCommand("/ai-process-queue"), { blocked: false })
    await flushBackgroundAi()

    assert.deepEqual(queueCalls, ["process"])
    assert.equal(aiIdleScheduler.tasks[0]?.cleared, true)
    assert.deepEqual(aiIdleScheduler.activeTasks(), [])
  })

  test("AI idle status command clears pending delayed queue work", async () => {
    const aiIdleScheduler = createFakeScheduler()
    const queueCalls: string[] = []
    const { deps } = createDeps({
      initialAiStatus: { kind: "connected", model: "gpt-4o-mini" },
      aiIdleScheduler,
      aiActions: {
        processQueue: () => {
          queueCalls.push("process")
          return Promise.resolve({ applied: 0, failed: 0, remaining: 0 })
        },
        getStatus: () => ({ kind: "connected", model: "gpt-4o-mini" }),
      },
      persistEditorBody: (note, body) => ({ ...note, body }),
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("AI idle explicit status clears timer")
    assert.deepEqual(await controller.saveEditor(), { blocked: false })
    assert.deepEqual(aiIdleScheduler.activeTasks().map((task) => task.delay), [10_000])

    assert.deepEqual(controller.runCommand("/ai-status"), { blocked: false })
    await flushBackgroundAi()

    assert.deepEqual(queueCalls, [])
    assert.equal(aiIdleScheduler.tasks[0]?.cleared, true)
    assert.deepEqual(aiIdleScheduler.activeTasks(), [])
    assert.deepEqual(controller.getState().ai, { kind: "connected", model: "gpt-4o-mini" })
  })

  test("AI idle stale timer does not run if clearing the old scheduler handle fails", async () => {
    type ScheduledTask = { id: number; callback: () => void; delay: number; cleared: boolean }
    const tasks: ScheduledTask[] = []
    const aiIdleScheduler = {
      tasks,
      setTimeout(callback: () => void, delay: number) {
        const task = { id: tasks.length + 1, callback, delay, cleared: false }
        tasks.push(task)
        return task.id
      },
      clearTimeout() {
        throw new Error("clear failed")
      },
      activeTasks() {
        return tasks.filter((task) => !task.cleared)
      },
    }
    const aiCalls: string[] = []
    const { deps } = createDeps({
      initialAiStatus: { kind: "connected", model: "gpt-4o-mini" },
      aiIdleScheduler,
      aiActions: {
        processQueue: () => {
          aiCalls.push("process")
          return Promise.resolve({ applied: 1, failed: 0, remaining: 0 })
        },
      },
      persistEditorBody: (note, body) => ({ ...note, body }),
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("AI idle stale timer one")
    assert.deepEqual(await controller.saveEditor(), { blocked: false })
    controller.updateEditorBody("AI idle stale timer two")
    assert.deepEqual(await controller.saveEditor(), { blocked: false })

    tasks[0]?.callback()
    await flushBackgroundAi()
    assert.deepEqual(aiCalls, [])

    tasks[1]?.callback()
    await flushBackgroundAi()
    assert.deepEqual(aiCalls, ["process"])
  })

  test("AI idle pending timer is cleared before /ai-describe so stale background work cannot preempt explicit results", async () => {
    const aiIdleScheduler = createFakeScheduler()
    const aiCalls: string[] = []
    let resolveDescribe!: (value: { key: string; status: "applied"; description: string }) => void
    const describePromise = new Promise<{ key: string; status: "applied"; description: string }>((resolve) => {
      resolveDescribe = resolve
    })
    const { deps } = createDeps({
      initialAiStatus: { kind: "connected", model: "gpt-4o-mini" },
      aiIdleScheduler,
      aiActions: {
        describeNote: (selector) => {
          aiCalls.push(`describe:${selector}`)
          return describePromise
        },
        processQueue: () => {
          aiCalls.push("process")
          return Promise.resolve({ applied: 1, failed: 0, remaining: 0 })
        },
      },
      persistEditorBody: (note, body) => ({ ...note, body }),
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("AI idle explicit describe clears timer")
    assert.deepEqual(await controller.saveEditor(), { blocked: false })
    assert.deepEqual(aiIdleScheduler.activeTasks().map((task) => task.delay), [10_000])

    assert.deepEqual(controller.runCommand("/ai-describe"), { blocked: false })

    assert.deepEqual(aiCalls, ["describe:daily-plan"])
    assert.equal(aiIdleScheduler.tasks[0]?.cleared, true)
    assert.deepEqual(aiIdleScheduler.activeTasks(), [])

    resolveDescribe({ key: "daily-plan", status: "applied", description: "AI summary" })
    await describePromise
    await flushBackgroundAi()

    assert.deepEqual(aiCalls, ["describe:daily-plan"])
    assert.deepEqual(controller.getState().ai, { kind: "updated", key: "daily-plan", queue: { queued: 0, failed: 0 } })
  })

  test("AI idle changed save enqueues and starts unresolved queue processing without blocking UI actions", async () => {
    const autosaveScheduler = createFakeScheduler()
    const aiIdleScheduler = createFakeScheduler()
    const aiCalls: string[] = []
    const persistedBodies: string[] = []
    const neverSettledQueue = new Promise<{ applied: number; failed: number; remaining: number }>(() => {})
    const { deps } = createDeps({
      initialAiStatus: { kind: "connected", model: "gpt-4o-mini" },
      autosaveScheduler,
      aiIdleScheduler,
      aiActions: {
        enqueueNote: (selector: string) => {
          aiCalls.push(`enqueue:${selector}`)
          return true
        },
        processQueue: () => {
          aiCalls.push("process")
          return neverSettledQueue
        },
      },
      persistEditorBody: (note, body) => {
        persistedBodies.push(`${note.key}:${body}`)
        return { ...note, body }
      },
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("AI idle nonblocking saved body")
    assert.deepEqual(await controller.saveEditor(), { blocked: false })

    assert.deepEqual(persistedBodies, ["daily-plan:AI idle nonblocking saved body"])
    assert.equal(controller.getState().editor?.dirty, false)
    assert.equal(controller.getState().editor?.autosaveStatus, "saved")
    assert.deepEqual(aiCalls, [])
    assert.deepEqual(aiIdleScheduler.activeTasks().map((task) => task.delay), [10_000])

    aiIdleScheduler.runNext()
    assert.deepEqual(aiCalls, ["enqueue:daily-plan"])
    await flushBackgroundAi()
    assert.deepEqual(aiCalls, ["enqueue:daily-plan", "process"])
    assert.deepEqual(controller.getState().ai, { kind: "running", progress: { processed: 0, total: 1 }, queue: { queued: 1, failed: 0 } })

    assert.deepEqual(controller.showManager(), { blocked: false })
    assert.deepEqual(openArchiveReview(controller), { blocked: false })
    assert.equal(controller.getState().editor?.note.key, "archive-review")
    controller.insertEditorText(" while queue is unresolved")
    assert.equal(controller.getState().editor?.body, "Archive body while queue is unresolved")
    autosaveScheduler.runNext()
    await Promise.resolve()
    await Promise.resolve()
    assert.equal(controller.getState().editor?.dirty, false)
    assert.equal(controller.getState().editor?.autosaveStatus, "saved")
    assert.deepEqual(controller.requestQuit(), { blocked: false })
    assert.doesNotThrow(() => controller.getManagerBrowserModel())
    assert.doesNotThrow(() => controller.getState())
    assert.doesNotThrow(() => controller.dispose())
    assert.deepEqual(aiCalls, ["enqueue:daily-plan", "process"])
  })

  test("AI idle timer enqueues the latest saved note before delayed queue processing", async () => {
    const aiIdleScheduler = createFakeScheduler()
    const aiCalls: string[] = []
    const { deps } = createDeps({
      initialAiStatus: { kind: "connected", model: "gpt-4o-mini" },
      aiIdleScheduler,
      aiActions: {
        enqueueNote: (selector: string) => {
          aiCalls.push(`enqueue:${selector}`)
        },
        processQueue: () => {
          aiCalls.push("process")
          return Promise.resolve({ applied: 1, failed: 0, remaining: 0 })
        },
      },
      persistEditorBody: (note, body) => ({ ...note, body }),
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("AI idle enqueue latest daily")
    assert.deepEqual(await controller.saveEditor(), { blocked: false })

    assert.deepEqual(aiCalls, [])
    assert.deepEqual(aiIdleScheduler.activeTasks().map((task) => task.delay), [10_000])

    aiIdleScheduler.runNext()
    assert.deepEqual(aiCalls, ["enqueue:daily-plan"])
    await flushBackgroundAi()

    assert.deepEqual(aiCalls, ["enqueue:daily-plan", "process"])
    assert.deepEqual(controller.getState().ai, { kind: "updated", count: 1, queue: { queued: 0, failed: 0 } })
  })

  test("AI idle enqueue false result is reported as an AI error instead of processing an empty queue", async () => {
    const aiIdleScheduler = createFakeScheduler()
    const aiCalls: string[] = []
    const persistedBodies: string[] = []
    const { deps } = createDeps({
      initialAiStatus: { kind: "connected", model: "gpt-4o-mini" },
      aiIdleScheduler,
      aiActions: {
        enqueueNote: (selector: string) => {
          aiCalls.push(`enqueue:${selector}`)
          return false
        },
        processQueue: () => {
          aiCalls.push("process")
          return Promise.resolve({ applied: 0, failed: 0, remaining: 0 })
        },
      },
      persistEditorBody: (note, body) => {
        persistedBodies.push(`${note.key}:${body}`)
        return { ...note, body }
      },
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("AI idle enqueue failure remains saved")
    assert.deepEqual(await controller.saveEditor(), { blocked: false })

    aiIdleScheduler.runNext()
    await flushBackgroundAi()

    assert.deepEqual(persistedBodies, ["daily-plan:AI idle enqueue failure remains saved"])
    assert.equal(controller.getState().editor?.dirty, false)
    assert.deepEqual(aiCalls, ["enqueue:daily-plan"])
    assert.deepEqual(controller.getState().ai, { kind: "error", reason: "enqueue failed", queue: { queued: 0, failed: 0 } })
  })

  test("AI idle delayed save completion after dispose does not schedule timers or start work", async () => {
    const aiIdleScheduler = createFakeScheduler()
    const aiCalls: string[] = []
    let resolvePersist!: (note: TuiNote) => void
    const persistPromise = new Promise<TuiNote>((resolve) => {
      resolvePersist = resolve
    })
    const { deps } = createDeps({
      initialAiStatus: { kind: "connected", model: "gpt-4o-mini" },
      aiIdleScheduler,
      aiActions: {
        enqueueNote: (selector: string) => {
          aiCalls.push(`enqueue:${selector}`)
        },
        processQueue: () => {
          aiCalls.push("process")
          return Promise.resolve({ applied: 1, failed: 0, remaining: 0 })
        },
      },
      persistEditorBody: (note, body) => {
        return persistPromise.then(() => ({ ...note, body }))
      },
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("AI idle save resolves after dispose")
    const save = controller.saveEditor()
    controller.dispose()
    resolvePersist({ ...notesByKey["daily-plan"], body: "AI idle save resolves after dispose" })
    assert.deepEqual(await save, { blocked: false })

    assert.deepEqual(aiIdleScheduler.activeTasks(), [])
    assert.deepEqual(aiCalls, [])
  })

  test("AI idle unavailable or not configured skips provider work while note persistence succeeds", async () => {
    const unavailableAiIdleScheduler = createFakeScheduler()
    const unavailablePersistedBodies: string[] = []
    const { deps: unavailableDeps } = createDeps({
      initialAiStatus: { kind: "connected", model: "gpt-4o-mini" },
      aiIdleScheduler: unavailableAiIdleScheduler,
      persistEditorBody: (note, body) => {
        unavailablePersistedBodies.push(`${note.key}:${body}`)
        return { ...note, body }
      },
    })
    const unavailableController = createWorkspaceController(unavailableDeps)

    openInboxDaily(unavailableController)
    unavailableController.updateEditorBody("AI idle unavailable body")
    assert.deepEqual(await unavailableController.saveEditor(), { blocked: false })
    assert.deepEqual(unavailablePersistedBodies, ["daily-plan:AI idle unavailable body"])
    assert.deepEqual(unavailableAiIdleScheduler.activeTasks(), [])

    const notConfiguredAiIdleScheduler = createFakeScheduler()
    let providerCalls = 0
    const configuredOffPersistedBodies: string[] = []
    const { deps: notConfiguredDeps } = createDeps({
      initialAiStatus: { kind: "not-configured" },
      aiIdleScheduler: notConfiguredAiIdleScheduler,
      aiActions: {
        processQueue: () => {
          providerCalls += 1
          return Promise.resolve({ applied: 0, failed: 0, remaining: 0 })
        },
      },
      persistEditorBody: (note, body) => {
        configuredOffPersistedBodies.push(`${note.key}:${body}`)
        return { ...note, body }
      },
    })
    const notConfiguredController = createWorkspaceController(notConfiguredDeps)

    openInboxDaily(notConfiguredController)
    notConfiguredController.updateEditorBody("AI idle not configured body")
    assert.deepEqual(await notConfiguredController.saveEditor(), { blocked: false })

    assert.deepEqual(configuredOffPersistedBodies, ["daily-plan:AI idle not configured body"])
    assert.deepEqual(notConfiguredAiIdleScheduler.activeTasks(), [])
    assert.equal(providerCalls, 0)
  })

  test("updating editor body to saved content does not schedule autosave or mark pending", () => {
    const scheduler = createFakeScheduler()
    const { deps } = createDeps({ autosaveScheduler: scheduler })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("Original daily body")

    assert.equal(controller.getState().editor?.dirty, false)
    assert.equal(controller.getState().editor?.autosaveStatus, "saved")
    assert.deepEqual(scheduler.activeTasks(), [])
  })

  test("newer manual save waits behind an older autosave so disk side effects cannot complete out of order", async () => {
    const scheduler = createFakeScheduler()
    const startedSaves: Array<{ body: string; resolve: (note: TuiNote) => void }> = []
    const completedDiskWrites: string[] = []
    const { deps } = createDeps({
      autosaveScheduler: scheduler,
      persistEditorBody: (note, body) =>
        new Promise<TuiNote>((resolve) => {
          startedSaves.push({
            body,
            resolve: (savedNote) => {
              completedDiskWrites.push(body)
              resolve({ ...note, ...savedNote })
            },
          })
        }),
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("Older autosave body")
    scheduler.runNext()
    await Promise.resolve()
    assert.deepEqual(startedSaves.map((save) => save.body), ["Older autosave body"])

    controller.updateEditorBody("Newer manual body")
    const manualSave = controller.saveEditor()
    await Promise.resolve()
    assert.deepEqual(startedSaves.map((save) => save.body), ["Older autosave body"])

    startedSaves[0]?.resolve({ ...notesByKey["daily-plan"], body: "Older autosave body" })
    await Promise.resolve()
    await Promise.resolve()
    assert.deepEqual(startedSaves.map((save) => save.body), ["Older autosave body", "Newer manual body"])
    startedSaves[1]?.resolve({ ...notesByKey["daily-plan"], body: "Newer manual body" })
    assert.deepEqual(await manualSave, { blocked: false })
    await Promise.resolve()

    assert.deepEqual(completedDiskWrites, ["Older autosave body", "Newer manual body"])
    assert.equal(controller.getState().editor?.body, "Newer manual body")
    assert.equal(controller.getState().editor?.savedBody, "Newer manual body")
    assert.equal(controller.getState().editor?.dirty, false)
    assert.equal(controller.getState().editor?.autosaveStatus, "saved")
  })

  test("manual save coalesces with an in-flight autosave for the same editor snapshot", async () => {
    const scheduler = createFakeScheduler()
    const persistedBodies: string[] = []
    let finishPersist!: (note: TuiNote) => void
    const { deps } = createDeps({
      autosaveScheduler: scheduler,
      persistEditorBody: (note, body) =>
        new Promise<TuiNote>((resolve) => {
          persistedBodies.push(`${note.key}:${body}`)
          finishPersist = (savedNote) => resolve({ ...note, ...savedNote, body })
        }),
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("Shared autosave manual body")
    scheduler.runNext()
    await Promise.resolve()
    assert.equal(controller.getState().editor?.autosaveStatus, "saving")

    const manualSave = controller.saveEditor()
    await Promise.resolve()

    assert.deepEqual(persistedBodies, ["daily-plan:Shared autosave manual body"])
    finishPersist({ ...notesByKey["daily-plan"], body: "Shared autosave manual body" })
    assert.deepEqual(await manualSave, { blocked: false })
    await Promise.resolve()

    assert.deepEqual(persistedBodies, ["daily-plan:Shared autosave manual body"])
    assert.equal(controller.getState().editor?.dirty, false)
    assert.equal(controller.getState().editor?.autosaveStatus, "saved")
  })

  test("rapid repeated manual saves keep only one persistence operation in flight", async () => {
    const scheduler = createFakeScheduler()
    const persistedBodies: string[] = []
    let finishPersist!: (note: TuiNote) => void
    const { deps } = createDeps({
      autosaveScheduler: scheduler,
      persistEditorBody: (note, body) =>
        new Promise<TuiNote>((resolve) => {
          persistedBodies.push(`${note.key}:${body}`)
          finishPersist = (savedNote) => resolve({ ...note, ...savedNote, body })
        }),
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("Rapid manual body")
    const firstSave = controller.saveEditor()
    const secondSave = controller.saveEditor()
    const thirdSave = controller.saveEditor()
    await Promise.resolve()

    assert.deepEqual(persistedBodies, ["daily-plan:Rapid manual body"])
    assert.deepEqual(scheduler.activeTasks(), [])

    finishPersist({ ...notesByKey["daily-plan"], body: "Rapid manual body" })
    assert.deepEqual(await firstSave, { blocked: false })
    assert.deepEqual(await secondSave, { blocked: false })
    assert.deepEqual(await thirdSave, { blocked: false })
    assert.equal(controller.getState().editor?.dirty, false)
    assert.equal(controller.getState().editor?.autosaveStatus, "saved")
  })

  test("typing immediately after a save request is accepted without waiting for persistence", async () => {
    const persistedBodies: string[] = []
    let finishPersist!: (note: TuiNote) => void
    const { deps } = createDeps({
      persistEditorBody: (note, body) =>
        new Promise<TuiNote>((resolve) => {
          persistedBodies.push(`${note.key}:${body}`)
          finishPersist = (savedNote) => resolve({ ...note, ...savedNote, body })
        }),
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("First saved body")
    const save = controller.saveEditor()
    controller.insertEditorText(" plus immediate typing")

    assert.equal(controller.getState().editor?.body, "First saved body plus immediate typing")
    assert.equal(controller.getState().editor?.dirty, true)
    assert.equal(controller.getState().editor?.autosaveStatus, "pending")
    assert.deepEqual(persistedBodies, ["daily-plan:First saved body"])

    finishPersist({ ...notesByKey["daily-plan"], body: "First saved body" })
    await save

    assert.equal(controller.getState().editor?.body, "First saved body plus immediate typing")
    assert.equal(controller.getState().editor?.dirty, true)
    assert.equal(controller.getState().editor?.autosaveStatus, "pending")
  })

  test("dispose clears pending autosave timers", () => {
    const scheduler = createFakeScheduler()
    const { deps } = createDeps({ autosaveScheduler: scheduler })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("Pending before destroy")
    assert.equal(scheduler.activeTasks().length, 1)

    controller.dispose()

    assert.deepEqual(scheduler.activeTasks(), [])
  })

  test("dispose detaches autosave state change handlers so stale saves cannot keep render callbacks live", async () => {
    const scheduler = createFakeScheduler()
    const invalidations: string[] = []
    let resolvePersist!: (note: TuiNote) => void
    const { deps } = createDeps({
      autosaveScheduler: scheduler,
      onAutosaveStateChange: () => invalidations.push(controller.getState().editor?.autosaveStatus ?? "none"),
      persistEditorBody: (note, body) => new Promise<TuiNote>((resolve) => {
        resolvePersist = (savedNote) => resolve({ ...note, ...savedNote, body })
      }),
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("Pending before destroy")
    scheduler.runNext()
    assert.deepEqual(invalidations, ["pending", "saving"])

    controller.dispose()
    resolvePersist({ ...notesByKey["daily-plan"], body: "Pending before destroy" })
    await Promise.resolve()

    assert.deepEqual(invalidations, ["pending", "saving"])
  })

  test("autosave status changes notify the renderer to rerender", async () => {
    const scheduler = createFakeScheduler()
    const invalidations: string[] = []
    const { deps } = createDeps({
      autosaveScheduler: scheduler,
      onAutosaveStateChange: () => invalidations.push(controller.getState().editor?.autosaveStatus ?? "none"),
      persistEditorBody: (note, body) => Promise.resolve({ ...note, body }),
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("Autosave status body")
    scheduler.runNext()
    await Promise.resolve()
    await Promise.resolve()

    assert.deepEqual(invalidations, ["pending", "saving", "saved"])
  })

  test("stale autosave completion for an older body does not overwrite a newer dirty body", async () => {
    const scheduler = createFakeScheduler()
    const pendingSaves: Array<{ body: string; resolve: (note: TuiNote) => void }> = []
    const { deps } = createDeps({
      autosaveScheduler: scheduler,
      persistEditorBody: (note, body) =>
        new Promise<TuiNote>((resolve) => {
          pendingSaves.push({ body, resolve: (savedNote) => resolve({ ...note, ...savedNote }) })
        }),
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("Older autosave body")
    scheduler.runNext()
    await Promise.resolve()
    assert.equal(controller.getState().editor?.autosaveStatus, "saving")

    controller.updateEditorBody("Newer unsaved body")
    assert.equal(controller.getState().editor?.autosaveStatus, "pending")
    pendingSaves[0]?.resolve({ ...notesByKey["daily-plan"], body: "Older autosave body" })
    await Promise.resolve()

    assert.equal(controller.getState().editor?.body, "Newer unsaved body")
    assert.equal(controller.getState().editor?.dirty, true)
    assert.equal(controller.getState().editor?.autosaveStatus, "pending")
  })

  test("stale autosave completion for a different active note is ignored", async () => {
    const scheduler = createFakeScheduler()
    let finishPersist!: (note: TuiNote) => void
    const { deps } = createDeps({
      autosaveScheduler: scheduler,
      persistEditorBody: (note, body) =>
        new Promise<TuiNote>((resolve) => {
          finishPersist = (savedNote) => resolve({ ...note, ...savedNote, body })
        }),
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("Autosaving daily")
    scheduler.runNext()
    await Promise.resolve()
    openArchiveReview(controller, { confirmed: true })

    finishPersist({ ...notesByKey["daily-plan"], body: "Autosaving daily" })
    await Promise.resolve()

    assert.equal(controller.getState().editor?.note.key, "archive-review")
    assert.equal(controller.getState().editor?.body, "Archive body")
    assert.equal(controller.getState().editor?.autosaveStatus, "idle")
  })

  test("stale autosave failure after a newer manual save does not mark clean editor as failed", async () => {
    const scheduler = createFakeScheduler()
    const pendingSaves: Array<{ body: string; resolve: (note: TuiNote) => void; reject: (error: Error) => void }> = []
    const { deps } = createDeps({
      autosaveScheduler: scheduler,
      persistEditorBody: (note, body) =>
        new Promise<TuiNote>((resolve, reject) => {
          pendingSaves.push({ body, resolve: (savedNote) => resolve({ ...note, ...savedNote }), reject })
        }),
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("Shared body")
    scheduler.runNext()
    await Promise.resolve()
    const manualSave = controller.saveEditor()
    pendingSaves[0]?.reject(new Error("late autosave failure"))
    await Promise.resolve()
    pendingSaves[1]?.resolve({ ...notesByKey["daily-plan"], body: "Shared body" })
    await manualSave

    await Promise.resolve()
    await Promise.resolve()

    assert.equal(controller.getState().editor?.body, "Shared body")
    assert.equal(controller.getState().editor?.savedBody, "Shared body")
    assert.equal(controller.getState().editor?.dirty, false)
    assert.equal(controller.getState().editor?.autosaveStatus, "saved")
  })

  test("manual save pre-write failure keeps editor dirty, marks visible failure status, and leaves saved source unchanged", async () => {
    const storedBody = "Original daily body"
    const { deps } = createDeps({
      showNote: (selector) => ({ ...notesByKey[selector], body: storedBody }),
      persistEditorBody: () => {
        throw new Error("atomic writer temp write failed")
      },
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("Dirty body after manual failure")
    const result = await controller.saveEditor()

    assert.deepEqual(result, { blocked: true, reason: "dirty-editor" })
    assert.equal(storedBody, "Original daily body")
    assert.equal(controller.getState().editor?.body, "Dirty body after manual failure")
    assert.equal(controller.getState().editor?.savedBody, "Original daily body")
    assert.equal(controller.getState().editor?.dirty, true)
    assert.equal(controller.getState().editor?.autosaveStatus, "error")
  })

  test("autosave pre-write failure changes status to error, preserves dirty body, and leaves saved source unchanged", async () => {
    const scheduler = createFakeScheduler()
    const storedBody = "Original daily body"
    const { deps } = createDeps({
      autosaveScheduler: scheduler,
      showNote: (selector) => ({ ...notesByKey[selector], body: storedBody }),
      persistEditorBody: () => Promise.reject(new Error("atomic writer temp write failed")),
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("Dirty body after failure")
    scheduler.runNext()
    await Promise.resolve()
    await Promise.resolve()

    assert.equal(storedBody, "Original daily body")
    assert.equal(controller.getState().editor?.body, "Dirty body after failure")
    assert.equal(controller.getState().editor?.savedBody, "Original daily body")
    assert.equal(controller.getState().editor?.dirty, true)
    assert.equal(controller.getState().editor?.autosaveStatus, "error")
  })

  test("successful retry after autosave failure marks the current buffer clean", async () => {
    const scheduler = createFakeScheduler()
    let storedBody = "Original daily body"
    let failNextPersist = true
    const { deps } = createDeps({
      autosaveScheduler: scheduler,
      showNote: (selector) => ({ ...notesByKey[selector], body: storedBody }),
      persistEditorBody: (note, body) => {
        if (failNextPersist) {
          failNextPersist = false
          return Promise.reject(new Error("atomic writer temp write failed"))
        }
        storedBody = body
        return Promise.resolve({ ...note, body })
      },
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("Body that initially fails")
    scheduler.runNext()
    await Promise.resolve()
    await Promise.resolve()

    assert.equal(controller.getState().editor?.dirty, true)
    assert.equal(controller.getState().editor?.autosaveStatus, "error")
    assert.equal(storedBody, "Original daily body")

    const retryResult = await controller.saveEditor()

    assert.deepEqual(retryResult, { blocked: false })
    assert.equal(storedBody, "Body that initially fails")
    assert.equal(controller.getState().editor?.body, "Body that initially fails")
    assert.equal(controller.getState().editor?.savedBody, "Body that initially fails")
    assert.equal(controller.getState().editor?.dirty, false)
    assert.equal(controller.getState().editor?.autosaveStatus, "saved")
  })

  test("editor undo and redo restore snapshots, clear redo on new edits, and keep autosave semantics", async () => {
    const scheduler = createFakeScheduler()
    const persistedBodies: string[] = []
    const { deps } = createDeps({
      autosaveScheduler: scheduler,
      persistEditorBody: (note, body) => {
        persistedBodies.push(body)
        return { ...note, body }
      },
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.openEditorFind("daily")
    controller.updateEditorFindQuery("daily")
    controller.goBack()
    controller.setEditorSelection(8, 8)
    controller.insertEditorText(" edited")

    let editor = controller.getState().editor
    assert.equal(editor?.body, "Original edited daily body")
    assert.equal(editor?.dirty, true)
    assert.equal(editor?.autosaveStatus, "pending")
    assert.equal(editor?.undoStack?.length, 1)
    assert.equal(editor?.redoStack?.length, 0)

    controller.undoEditor()

    editor = controller.getState().editor
    assert.equal(editor?.body, "Original daily body")
    assert.equal(editor?.cursorOffset, 8)
    assert.equal(editor?.selectionStart, 8)
    assert.equal(editor?.selectionEnd, 8)
    assert.equal(editor?.dirty, false)
    assert.equal(editor?.autosaveStatus, "saved")
    assert.equal(editor?.findQuery, "daily")
    assert.equal(editor?.findMatchCount, 1)
    assert.equal(editor?.activeFindIndex, 0)
    assert.equal(editor?.undoStack?.length, 0)
    assert.equal(editor?.redoStack?.length, 1)
    assert.equal(scheduler.activeTasks().length, 0)

    controller.redoEditor()

    editor = controller.getState().editor
    assert.equal(editor?.body, "Original edited daily body")
    assert.equal(editor?.dirty, true)
    assert.equal(editor?.autosaveStatus, "pending")
    assert.equal(editor?.redoStack?.length, 0)
    assert.equal(scheduler.activeTasks().length, 1)

    scheduler.runNext()
    await Promise.resolve()
    assert.deepEqual(persistedBodies, ["Original edited daily body"])
    assert.equal(controller.getState().editor?.dirty, false)
    assert.equal(controller.getState().editor?.savedBody, "Original edited daily body")

    controller.undoEditor()
    editor = controller.getState().editor
    assert.equal(editor?.body, "Original daily body")
    assert.equal(editor?.savedBody, "Original edited daily body")
    assert.equal(editor?.dirty, true)
    assert.equal(editor?.autosaveStatus, "pending")
    assert.equal(scheduler.activeTasks().length, 1)

    controller.insertEditorText(" fresh")
    editor = controller.getState().editor
    assert.equal(editor?.body, "Original fresh daily body")
    assert.equal(editor?.redoStack?.length, 0)
  })

  test("editor undo history is bounded and empty undo redo are safe", () => {
    const scheduler = createFakeScheduler()
    const { deps } = createDeps({ autosaveScheduler: scheduler })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.undoEditor()
    assert.equal(controller.getState().editor?.statusMessage, "Nothing to undo")
    controller.redoEditor()
    assert.equal(controller.getState().editor?.statusMessage, "Nothing to redo")
    assert.equal(controller.getState().editor?.body, "Original daily body")

    for (let index = 0; index < 60; index += 1) {
      controller.insertEditorText(String(index % 10))
    }

    const editor = controller.getState().editor
    assert.ok((editor?.undoStack?.length ?? 0) <= 50)
    assert.equal(editor?.redoStack?.length, 0)
    assert.equal(editor?.statusMessage, null)
  })

  test("stale autosave timer skips persistence after an in-flight save already made restored redo body clean", async () => {
    const scheduler = createFakeScheduler()
    const pendingSaves: Array<{ body: string; resolve: (note: TuiNote) => void }> = []
    const persistedBodies: string[] = []
    const { deps } = createDeps({
      autosaveScheduler: scheduler,
      persistEditorBody: (note, body) =>
        new Promise<TuiNote>((resolve) => {
          persistedBodies.push(body)
          pendingSaves.push({
            body,
            resolve: (savedNote) => resolve({ ...note, ...savedNote }),
          })
        }),
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.insertEditorText(" updated")
    scheduler.runNext()
    await Promise.resolve()
    assert.deepEqual(persistedBodies, ["Original daily body updated"])

    controller.undoEditor()
    assert.equal(controller.getState().editor?.body, "Original daily body")
    controller.redoEditor()
    assert.equal(controller.getState().editor?.body, "Original daily body updated")
    assert.deepEqual(scheduler.activeTasks().map((task) => task.delay), [750])

    pendingSaves[0]?.resolve({ ...notesByKey["daily-plan"], body: "Original daily body updated" })
    await Promise.resolve()
    await Promise.resolve()
    assert.equal(controller.getState().editor?.dirty, false)
    assert.equal(controller.getState().editor?.autosaveStatus, "saved")
    assert.deepEqual(scheduler.activeTasks(), [])
    assert.deepEqual(persistedBodies, ["Original daily body updated"])
  })

  test("undoing to a clean snapshot while autosave is in flight re-saves the restored body", async () => {
    const scheduler = createFakeScheduler()
    const pendingSaves: Array<{ body: string; resolve: (note: TuiNote) => void }> = []
    const persistedBodies: string[] = []
    const { deps } = createDeps({
      autosaveScheduler: scheduler,
      persistEditorBody: (note, body) =>
        new Promise<TuiNote>((resolve) => {
          persistedBodies.push(body)
          pendingSaves.push({
            body,
            resolve: (savedNote) => resolve({ ...note, ...savedNote }),
          })
        }),
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.insertEditorText(" updated")
    scheduler.runNext()
    await Promise.resolve()
    assert.deepEqual(persistedBodies, ["Original daily body updated"])

    controller.undoEditor()
    assert.equal(controller.getState().editor?.body, "Original daily body")
    assert.equal(controller.getState().editor?.dirty, true)
    assert.equal(controller.getState().editor?.autosaveStatus, "pending")
    assert.deepEqual(scheduler.activeTasks().map((task) => task.delay), [750])

    pendingSaves[0]?.resolve({ ...notesByKey["daily-plan"], body: "Original daily body updated" })
    await Promise.resolve()
    await Promise.resolve()
    assert.equal(controller.getState().editor?.body, "Original daily body")
    assert.equal(controller.getState().editor?.dirty, true)

    scheduler.runNext()
    await Promise.resolve()
    await Promise.resolve()
    pendingSaves[1]?.resolve({ ...notesByKey["daily-plan"], body: "Original daily body" })
    await Promise.resolve()
    await Promise.resolve()

    assert.deepEqual(persistedBodies, ["Original daily body updated", "Original daily body"])
    assert.equal(controller.getState().editor?.body, "Original daily body")
    assert.equal(controller.getState().editor?.savedBody, "Original daily body")
    assert.equal(controller.getState().editor?.dirty, false)
    assert.equal(controller.getState().editor?.autosaveStatus, "saved")
  })
})
