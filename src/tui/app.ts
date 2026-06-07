import path from "node:path"
import { existsSync, mkdirSync, readFileSync, readdirSync, type Dirent } from "node:fs"
import { createCliRenderer, BoxRenderable, type CliRenderer, type PasteEvent, type Renderable } from "@opentui/core"

import { resolveBlueNoteRoot } from "../config/root"
import { createAiConfigRepository } from "../ai/config"
import { createCodexAuthClient } from "../ai/codex-auth-client"
import { createCodexAuthRepository } from "../ai/codex-auth-repository"
import { generateNoteDescription } from "../ai/description-service"
import { sanitizeAiErrorMessage } from "../ai/error-redaction"
import { enqueueDescribeNoteIfAiEnabled } from "../ai/enqueue-describe-note"
import { scanAndEnqueueStaleDescriptions } from "../ai/stale-description-scan"
import { CodexProviderSetupRequiredError, createAiTextGenerationClient, type AiTextGenerationClient } from "../ai/provider"
import { CodexTextGenerationClientError } from "../ai/codex-client"
import { createAiQueueRepository } from "../ai/queue-repository"
import { dropDescribeNoteJobIfNoteMissing, listPendingAiJobs, listRetryableAiJobs, markDescribeNoteJobFailedIfContentHashMatches } from "../ai/queue-service"
import { createNote } from "../core/create-note"
import { deleteNote } from "../core/delete-note"
import { IndexUnavailableError } from "../core/errors"
import { listNotes } from "../core/list-notes"
import { moveNote } from "../core/move-note"
import { promoteDraft } from "../core/promote-draft"
import { rebuildIndexes } from "../core/rebuild-indexes"
import { renameNote } from "../core/rename-note"
import { updateIndexedNote } from "../index/index-store"
import { searchNotes } from "../core/search-notes"
import { showNote } from "../core/show-note"
import type { CliResult } from "../core/types"
import { systemClock, type Clock } from "../platform/clock"
import { createNoteRepository } from "../storage/note-repository"
import { createSidecarRepository } from "../storage/sidecar-repository"
import { getNotesPath } from "../storage/root-layout"
import { cleanupStaleAtomicNoteWriterTemps } from "../storage/atomic-note-writer"
import { renderEditorScreen, routeEditorKey } from "./render-editor"
import { sanitizePastedEditorText } from "./paste"
import { renderManagerScreen, routeManagerKey } from "./render-manager"
import { renderSearchEverythingScreen, routeSearchEverythingKey } from "./render-search-everything"
import type { AiStatusState, TuiNote } from "./state"
import { createDesktopClipboardModel } from "./adapters/desktop-clipboard-adapter"
import { createWorkspaceController, type WorkspaceCommandHandler, type WorkspaceController, type WorkspaceControllerDependencies } from "./workspace-controller"
import { recordLatestOpenedNote, resolveStartupNote } from "./latest-opened-note"
import type { NoteManagerSummary } from "./adapters/note-manager-adapter"

export { createDesktopClipboardModel } from "./adapters/desktop-clipboard-adapter"

export interface TuiBootstrapInfo {
  appName: string
  status: string
  followUp: string
}

export interface StartTuiWorkspaceOptions {
  controller?: WorkspaceController
  renderer?: CliRenderer
}

export interface RunningTuiWorkspace {
  renderer: CliRenderer
  controller: WorkspaceController
  destroy: () => void
}

type WorkspaceInputRenderer = {
  prependInputHandler?: (handler: (sequence: string) => boolean) => void
  addInputHandler?: (handler: (sequence: string) => boolean) => void
  removeInputHandler?: (handler: (sequence: string) => boolean) => void
}


export interface DefaultWorkspaceControllerOptions {
  rootPath?: string
  clock?: Clock
  aiClient?: AiTextGenerationClient
  fetch?: typeof fetch
  autosaveScheduler?: WorkspaceControllerDependencies["autosaveScheduler"]
  aiIdleScheduler?: WorkspaceControllerDependencies["aiIdleScheduler"]
  aiStartupScheduler?: WorkspaceControllerDependencies["aiIdleScheduler"]
  commandHandlers?: Partial<Record<string, WorkspaceCommandHandler>>
  clipboard?: WorkspaceControllerDependencies["clipboard"]
  createClipboard?: () => NonNullable<WorkspaceControllerDependencies["clipboard"]>
  cleanupStaleAtomicTemps?: (rootPath: string) => void
}

export function getTuiBootstrapInfo(): TuiBootstrapInfo {
  return {
    appName: "BlueNote",
    status: "tui-workspace-ready",
    followUp: "hardening-follow-up",
  }
}

export function formatTuiBootstrapMessage(info: TuiBootstrapInfo = getTuiBootstrapInfo()): string {
  return `${info.appName} TUI workspace bootstrap ready (${info.status}). Follow-up: ${info.followUp}.\n`
}

function enqueueAiDescriptionAfterTuiSave(rootPath: string, note: TuiNote, body: string, clock: Clock, warn?: (message: string) => void): boolean {
  return enqueueDescribeNoteIfAiEnabled(rootPath, {
    key: note.key,
    relativePath: note.relativePath,
    title: note.title,
    body,
    currentDescription: note.description,
  }, { clock, warn })
}

function persistTuiEditorBody(rootPath: string, note: TuiNote, body: string, clock: Clock, warn?: (message: string) => void): TuiNote {
  const repository = createNoteRepository(rootPath)
  repository.syncEditedNote(path.join(rootPath, note.relativePath), {
    title: note.title,
    body,
    updatedAt: clock.now().toISOString(),
  })

  const savedNote = showTuiNote(rootPath, note.key)
  try {
    updateIndexedNote(rootPath, {
      key: savedNote.key,
      title: savedNote.title,
      description: savedNote.description,
      body: savedNote.body,
      relativePath: savedNote.relativePath,
      createdAt: savedNote.createdAt ?? "",
      updatedAt: savedNote.updatedAt ?? "",
      archivedAt: null,
    })
  } catch {
    return savedNote
  }
  return savedNote
}

function showTuiNote(rootPath: string, selector: string): TuiNote {
  let note: TuiNote
  try {
    note = showNote({ override: rootPath, selector })
  } catch (error) {
    const legacySummary = listLegacyTuiNoteSummaries(rootPath).find((summary) => summary.key === selector || summary.relativePath === selector || summary.title === selector)
    if (!legacySummary) {
      throw error
    }
    return {
      key: legacySummary.key,
      title: legacySummary.title,
      description: legacySummary.description,
      body: legacySummary.body ?? "",
      relativePath: legacySummary.relativePath,
      createdAt: legacySummary.createdAt,
    }
  }

  const sidecars = createSidecarRepository(rootPath)

  if (!existsSync(sidecars.getSidecarPath(note.key))) {
    return note
  }

  const sidecar = sidecars.read(note.key)
  return {
    ...note,
    createdAt: sidecar.createdAt,
    updatedAt: sidecar.updatedAt,
  }
}

function legacyNotesPath(rootPath: string): string {
  return path.join(rootPath, "notes")
}

function listTuiNoteFolders(rootPath: string): string[] {
  const folders: string[] = []

  function visit(directoryPath: string, relativePath: string): void {
    let entries: Dirent[]
    try {
      entries = readdirSync(directoryPath, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) {
        continue
      }

      const childRelativePath = `${relativePath}/${entry.name}`
      folders.push(childRelativePath)
      visit(path.join(directoryPath, entry.name), childRelativePath)
    }
  }

  visit(getNotesPath(rootPath), "note")
  visit(legacyNotesPath(rootPath), "notes")
  return folders
}

function titleFromLegacyMarkdown(body: string, fallback: string): string {
  const frontmatterTitle = body.match(/^---\n(?<frontmatter>[\s\S]*?)\n---/u)?.groups?.frontmatter.match(/^title:\s*['"]?(?<title>[^'"\n]+)['"]?\s*$/mu)?.groups?.title?.trim()
  if (frontmatterTitle) {
    return frontmatterTitle
  }

  const headingTitle = body.match(/^#\s+(?<title>.+)$/mu)?.groups?.title?.trim()
  return headingTitle || fallback
}

function listLegacyTuiNoteSummaries(rootPath: string): NoteManagerSummary[] {
  const summaries: NoteManagerSummary[] = []

  function visit(directoryPath: string, relativePath: string): void {
    let entries: Dirent[]
    try {
      entries = readdirSync(directoryPath, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        continue
      }
      const childRelativePath = `${relativePath}/${entry.name}`
      const childPath = path.join(directoryPath, entry.name)
      if (entry.isDirectory()) {
        visit(childPath, childRelativePath)
        continue
      }
      if (!entry.isFile() || !entry.name.endsWith(".md")) {
        continue
      }

      let body = ""
      try {
        body = readFileSync(childPath, "utf8")
      } catch {
        continue
      }

      const key = path.basename(entry.name, ".md")
      summaries.push({
        key,
        title: titleFromLegacyMarkdown(body, key),
        description: "",
        body,
        relativePath: childRelativePath,
      })
    }
  }

  visit(legacyNotesPath(rootPath), "notes")
  return summaries
}

function createTuiNoteFolder(rootPath: string, folderRelativePath: string): void {
  const normalizedPath = folderRelativePath.replaceAll("\\", "/").replace(/^\/+|\/+$/gu, "")
  const parts = normalizedPath.split("/").filter(Boolean)

  if (parts.length < 2 || parts[0] !== "note" || parts.some((part) => part === "." || part === ".." || part.startsWith("."))) {
    throw new Error("Folder must be under note/")
  }

  mkdirSync(path.join(getNotesPath(rootPath), ...parts.slice(1)), { recursive: true })
}

function renameTuiNote(rootPath: string, selector: string, title: string, clock: Clock): TuiNote {
  const currentNote = showTuiNote(rootPath, selector)
  const renamed = renameNote({
    override: rootPath,
    selector,
    title,
    body: currentNote.body,
    updatedAt: clock.now().toISOString(),
  })

  return showTuiNote(rootPath, renamed.key)
}

function renameTuiNoteFolder(rootPath: string, folderRelativePath: string, nextName: string): void {
  createNoteRepository(rootPath).renameFolder(folderRelativePath, nextName)
}

function moveTuiNote(rootPath: string, selector: string, destinationFolder: string): TuiNote {
  const moved = moveNote({ override: rootPath, selector, destinationFolder })
  return showTuiNote(rootPath, moved.key)
}

function promoteTuiDraft(rootPath: string, selector: string, title: string, destinationFolder: string, clock: Clock): TuiNote {
  const promoted = promoteDraft({ override: rootPath, selector, title, destinationFolder, updatedAt: clock.now().toISOString() })
  return showTuiNote(rootPath, promoted.key)
}

function ensureTuiIndexes(rootPath: string): void {
  try {
    listNotes({ override: rootPath })
  } catch (error) {
    if (!(error instanceof IndexUnavailableError)) {
      throw error
    }

    rebuildIndexes({ override: rootPath })
  }
}

function readTuiAiQueueSummary(rootPath: string): { queued: number; failed: number } {
  const queueRepository = createAiQueueRepository(rootPath)
  try {
    return queueRepository.exists()
      ? queueRepository.read().jobs.reduce((summary, job) => {
          if (job.status === "pending" || job.status === "running") {
            summary.queued += 1
          } else if (job.status === "failed") {
            summary.failed += 1
          }
          return summary
        }, { queued: 0, failed: 0 })
      : { queued: 0, failed: 0 }
  } catch {
    return { queued: 0, failed: 0 }
  }
}

export function getInitialTuiAiStatus(rootPath: string): AiStatusState {
  const repository = createAiConfigRepository(rootPath)
  const queue = readTuiAiQueueSummary(rootPath)

  if (!repository.exists()) {
    return { kind: "not-configured" }
  }

  let config: ReturnType<typeof repository.read>
  try {
    config = repository.read()
  } catch {
    return { kind: "error", reason: "config invalid" }
  }

  if (!config.enabled) {
    return { kind: "not-configured" }
  }

  if (config.provider === "codex") {
    const status = createCodexAuthRepository(rootPath).getStatus({ provider: config.provider })
    switch (status.state) {
      case "authenticated":
      case "expired":
        return { kind: "connected", model: config.model, queue }
      case "setup-required":
        return { kind: "auth-required", reason: "auth required · run bn ai codex auth login", queue }
      case "invalid":
        return { kind: "error", reason: sanitizeAiErrorMessage(status.message), queue }
      case "not-configured":
      default:
        return { kind: "not-configured" }
    }
  }

  try {
    createAiTextGenerationClient(config)
  } catch (error) {
    return { kind: "error", reason: sanitizeAiErrorMessage(error), queue }
  }

  return { kind: "connected", model: config.model, queue }
}

function markTuiAiQueueJobFailed(rootPath: string, job: ReturnType<typeof listPendingAiJobs>[number], error: unknown, secrets: string[] = []): boolean {
  const message = sanitizeAiErrorMessage(error, secrets)
  return markDescribeNoteJobFailedIfContentHashMatches({
    rootPath,
    key: job.key,
    contentHash: job.contentHash,
    lastError: message,
  })
}

function isCodexProviderSetupBlocked(error: unknown): boolean {
  if (error instanceof CodexProviderSetupRequiredError) {
    return true
  }

  if (!(error instanceof CodexTextGenerationClientError)) {
    return false
  }

  const message = error.message.toLowerCase()
  return message.includes("codex auth setup is required")
    || message.includes("codex auth refresh failed")
    || message.includes("codex auth is expired")
    || message.includes("run bn ai codex auth login")
}

function codexAuthRequiredError(): Error {
  return new Error("auth required · run bn ai codex auth login")
}

function failPendingTuiAiQueueJobs(rootPath: string, error: unknown): { applied: number; failed: number; failedThisRun: number; queued: number; remaining: number } {
  let failedThisRun = 0
  for (const job of listPendingAiJobs(rootPath)) {
    if (markTuiAiQueueJobFailed(rootPath, job, error)) {
      failedThisRun += 1
    }
  }

  const summary = readTuiAiQueueSummary(rootPath)
  return { applied: 0, failed: summary.failed, failedThisRun, queued: summary.queued, remaining: summary.queued }
}

function dropMissingTuiAiQueueJobs(rootPath: string): void {
  const queueRepository = createAiQueueRepository(rootPath)
  if (!queueRepository.exists()) {
    return
  }

  for (const job of queueRepository.read().jobs) {
    dropDescribeNoteJobIfNoteMissing(rootPath, job)
  }
}

async function processTuiAiQueue(rootPath: string, client: AiTextGenerationClient, onProgress?: (progress: { processed: number; total: number }) => void): Promise<{ applied: number; failed: number; failedThisRun: number; queued: number; remaining: number }> {
  const config = createAiConfigRepository(rootPath).exists() ? createAiConfigRepository(rootPath).read() : null
  const jobs = listRetryableAiJobs(rootPath, config?.maxAttempts ?? 3)
  const secrets = config?.provider === "openai-compatible" ? [config.apiKey] : []
  let applied = 0
  let failedThisRun = 0
  let processed = 0

  onProgress?.({ processed, total: jobs.length })
  for (const job of jobs) {
    let reportProcessed = true
    try {
      if (dropDescribeNoteJobIfNoteMissing(rootPath, job)) {
        continue
      }

      const result = await generateNoteDescription({ rootPath, selector: job.key, client })
      if (result.status === "applied") {
        applied += 1
      } else if (result.status === "stale") {
        // A newer autosave/queue refresh superseded this provider response.
        // Leave the refreshed pending job untouched for a later run.
      } else {
        if (markTuiAiQueueJobFailed(rootPath, job, result.error ?? "invalid description", secrets)) {
          failedThisRun += 1
        }
      }
    } catch (error) {
      if (isCodexProviderSetupBlocked(error)) {
        reportProcessed = false
        throw codexAuthRequiredError()
      }
      if (markTuiAiQueueJobFailed(rootPath, job, error, secrets)) {
        failedThisRun += 1
      }
    } finally {
      if (reportProcessed) {
        processed += 1
        onProgress?.({ processed, total: jobs.length })
      }
    }
  }

  const summary = readTuiAiQueueSummary(rootPath)
  return { applied, failed: summary.failed, failedThisRun, queued: summary.queued, remaining: summary.queued }
}

export function createDefaultWorkspaceController(options: DefaultWorkspaceControllerOptions = {}): WorkspaceController {
  const rootPath = resolveBlueNoteRoot({ override: options.rootPath })
  const clock = options.clock ?? systemClock
  const cleanupStaleAtomicTemps = options.cleanupStaleAtomicTemps ?? cleanupStaleAtomicNoteWriterTemps

  cleanupStaleAtomicTemps(rootPath)
  ensureTuiIndexes(rootPath)
  try {
    dropMissingTuiAiQueueJobs(rootPath)
  } catch {
    // Startup should still surface queue read/write problems through later save/status paths
    // instead of blocking the whole TUI before the user can interact.
  }
  const aiConfigRepository = createAiConfigRepository(rootPath)
  let aiClient: AiTextGenerationClient | undefined = options.aiClient
  if (!aiClient && aiConfigRepository.exists()) {
    try {
      const config = aiConfigRepository.read()
      if (config.enabled && config.provider === "openai-compatible") {
        aiClient = createAiTextGenerationClient(config, { fetch: options.fetch ?? fetch })
      }
    } catch {
      aiClient = undefined
    }
  }

  function getAiClient(): AiTextGenerationClient | undefined {
    if (!aiConfigRepository.exists()) {
      return aiClient
    }

    const config = aiConfigRepository.read()
    if (!config.enabled) {
      aiClient = undefined
      return undefined
    }
    if (aiClient) {
      return aiClient
    }
    if (config.provider === "openai-compatible") {
      aiClient = createAiTextGenerationClient(config, { fetch: options.fetch ?? fetch })
      return aiClient
    }

    const repository = createCodexAuthRepository(rootPath)
    const authClient = createCodexAuthClient({
      fetch: options.fetch ?? fetch,
      repository,
    })
    aiClient = createAiTextGenerationClient(config, {
      fetch: options.fetch ?? fetch,
      codexAuth: {
        hasAuth: () => repository.exists(),
        async getAuth() {
          return repository.exists() ? repository.read() : null
        },
        async refreshAuth(auth) {
          const refreshed = await authClient.refreshAuth(auth)
          repository.write(refreshed)
          return refreshed
        },
      },
      now: () => clock.now(),
    })
    return aiClient
  }

  const initialNote = resolveStartupNote({
    rootPath,
    clock,
    showNote: (selector) => showTuiNote(rootPath, selector),
    createDraft: () => createNote({ override: rootPath, type: "draft", body: "", clock, enqueueAi: false }),
  })

  const controller = createWorkspaceController({
    listNotes: () => [...listNotes({ override: rootPath, visibility: "drafts" }), ...listLegacyTuiNoteSummaries(rootPath)],
    listNoteFolders: () => listTuiNoteFolders(rootPath),
    showNote: (selector) => showTuiNote(rootPath, selector),
    searchNotes: (query) => searchNotes(query, { override: rootPath, visibility: "drafts" }),
    createFolder: (folderRelativePath) => createTuiNoteFolder(rootPath, folderRelativePath),
    createNote: (title, destinationFolder) => {
      const created = createNote({ override: rootPath, type: "normal", title, destinationFolder, body: "", clock, enqueueAi: false })
      return showTuiNote(rootPath, created.key)
    },
    createDraft: () => {
      const created = createNote({ override: rootPath, type: "draft", body: "", clock, enqueueAi: false })
      return showTuiNote(rootPath, created.key)
    },
    managedRootPath: rootPath,
    renameNote: (selector, title) => renameTuiNote(rootPath, selector, title, clock),
    renameFolder: (folderRelativePath, nextName) => renameTuiNoteFolder(rootPath, folderRelativePath, nextName),
    moveNote: (selector, destinationFolder) => moveTuiNote(rootPath, selector, destinationFolder),
    promoteDraft: (selector, title, destinationFolder) => promoteTuiDraft(rootPath, selector, title, destinationFolder, clock),
    rebuildIndexes: () => {
      rebuildIndexes({ override: rootPath })
    },
    deleteNote: (selector) => {
      deleteNote({ override: rootPath, selector, force: true })
    },
    persistEditorBody: (note, body, warn) => persistTuiEditorBody(rootPath, note, body, clock, warn),
    initialNote,
    recordLatestOpenedNote: (note) => recordLatestOpenedNote(rootPath, note, clock),
    autosaveScheduler: options.autosaveScheduler,
    aiIdleScheduler: options.aiIdleScheduler,
    clipboard: options.clipboard ?? options.createClipboard?.() ?? createDesktopClipboardModel(),
    initialAiStatus: getInitialTuiAiStatus(rootPath),
    aiActions: {
      describeNote: async (selector) => {
        const client = getAiClient()
        if (!client) {
          throw new Error("AI is not configured.")
        }
        return generateNoteDescription({ rootPath, selector, client, clock })
      },
      enqueueNote: (selector) => {
        const note = showTuiNote(rootPath, selector)
        const enqueued = enqueueAiDescriptionAfterTuiSave(rootPath, note, note.body, clock)
        return enqueued ? readTuiAiQueueSummary(rootPath) : false
      },
      enqueueStaleDescriptions: () => {
        const result = scanAndEnqueueStaleDescriptions(rootPath, { clock })
        return { ...result, ...readTuiAiQueueSummary(rootPath) }
      },
      processQueue: (onProgress) => {
        try {
          dropMissingTuiAiQueueJobs(rootPath)
        } catch (error) {
          return Promise.resolve(failPendingTuiAiQueueJobs(rootPath, error))
        }

        let client: AiTextGenerationClient | undefined
        try {
          client = getAiClient()
        } catch (error) {
          if (isCodexProviderSetupBlocked(error)) {
            return Promise.reject(codexAuthRequiredError())
          }
          return Promise.resolve(failPendingTuiAiQueueJobs(rootPath, error))
        }
        if (client) {
          return processTuiAiQueue(rootPath, client, onProgress)
        }
        const summary = readTuiAiQueueSummary(rootPath)
        return Promise.resolve({ applied: 0, failed: summary.failed, queued: summary.queued, remaining: summary.queued })
      },
      getStatus: () => getInitialTuiAiStatus(rootPath),
    },
    commandHandlers: options.commandHandlers,
  })

  const startupScanScheduler = options.aiStartupScheduler ?? {
    setTimeout: (callback: () => void, delay: number) => globalThis.setTimeout(callback, delay),
    clearTimeout: (handle: unknown) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  }
  let startupScanTimer: unknown = startupScanScheduler.setTimeout(() => {
    startupScanTimer = null
    controller.startAiStartupScan()
  }, 0)

  return {
    ...controller,
    dispose() {
      if (startupScanTimer !== null) {
        try {
          startupScanScheduler.clearTimeout(startupScanTimer)
        } finally {
          startupScanTimer = null
        }
      }
      controller.dispose()
    },
  }
}

export interface RoutedWorkspaceKey {
  handled: boolean
  exit?: boolean
}

export function routeWorkspaceKey(
  sequence: string,
  controller: WorkspaceController,
  onExit: () => void,
  onInvalidate: () => void = () => {},
): RoutedWorkspaceKey {
  const state = controller.getState()

  if (sequence === "\u0010") {
    if (state.screen === "search") {
      controller.toggleSearch()
    } else {
      controller.openSearch()
    }
    return { handled: true }
  }

  if (state.screen === "search") {
    return { handled: routeSearchEverythingKey(sequence, controller) }
  }

  if (state.screen === "editor") {
    const handled = routeEditorKey(sequence, controller, onExit, onInvalidate)
    if (handled) return { handled: true }
    if (sequence === "\u001b[6;5~") {
      controller.switchEditorNote("next")
      return { handled: true }
    }
    if (sequence === "\u001b[5;5~") {
      controller.switchEditorNote("previous")
      return { handled: true }
    }
    if (sequence === "\u0003") {
      const quit = controller.requestQuit()
      if (!quit.blocked) {
        onExit()
      }
      return { handled: true, exit: !quit.blocked || undefined }
    }
    return { handled: routeControlledEditorBodyInput(controller, sequence) }
  }

  if (sequence === "\u0003") {
    const quit = controller.requestQuit()
    if (!quit.blocked) {
      onExit()
    }
    return { handled: true, exit: !quit.blocked || undefined }
  }

  if (
    sequence === "q" &&
    state.mode !== "manager.filter" &&
    state.mode !== "manager.create" &&
    state.mode !== "manager.rename" &&
    state.mode !== "manager.move" &&
    state.mode !== "manager.saveDraftAs" &&
    state.mode !== "manager.deleteConfirm"
  ) {
    const quit = controller.requestQuit()
    if (!quit.blocked) {
      onExit()
    }
    return { handled: true, exit: !quit.blocked || undefined }
  }

  return { handled: routeManagerKey(sequence, controller, onExit) }
}

function effectiveWorkspaceWidth(renderer: CliRenderer): number | undefined {
  const rendererSize = renderer as CliRenderer & { width?: number; terminalWidth?: number }
  return (process.stdout.isTTY ? process.stdout.columns : undefined) ?? rendererSize.width ?? rendererSize.terminalWidth
}

function effectiveWorkspaceHeight(renderer: CliRenderer): number | undefined {
  const rendererSize = renderer as CliRenderer & { height?: number; terminalHeight?: number }
  return (process.stdout.isTTY ? process.stdout.rows : undefined) ?? rendererSize.height ?? rendererSize.terminalHeight
}

function renderWorkspace(renderer: CliRenderer, controller: WorkspaceController, onExit: () => void, onInvalidate: () => void): BoxRenderable {
  const state = controller.getState()
  if (state.screen === "search") {
    return renderSearchEverythingScreen({ renderer, controller, onInvalidate, height: effectiveWorkspaceHeight(renderer) })
  }

  if (state.screen === "editor") {
    return renderEditorScreen({ renderer, controller, onExit, onInvalidate })
  }

  return renderManagerScreen({ renderer, controller, onExit, onInvalidate, width: effectiveWorkspaceWidth(renderer) })
}

function renderableDescendants(node: Renderable): Renderable[] {
  return [node, ...node.getChildren().flatMap((child) => renderableDescendants(child))]
}

export function routeControlledEditorBodyInput(controller: WorkspaceController, sequence: string): boolean {
  const state = controller.getState()
  if (state.screen !== "editor" || state.mode !== "editor.body" || !state.editor) return false

  const bracketedPasteStart = "\u001b[200~"
  const bracketedPasteEnd = "\u001b[201~"
  if (sequence.startsWith(bracketedPasteStart) && sequence.endsWith(bracketedPasteEnd)) {
    const pasted = sequence.slice(bracketedPasteStart.length, -bracketedPasteEnd.length)
    const sanitized = sanitizePastedEditorText(pasted)
    if (sanitized.length > 0) {
      controller.pasteEditorClipboard(sanitized)
    }
    return true
  }

  switch (sequence) {
    case "\r":
    case "\n":
      controller.insertEditorText("\n")
      return true
    case "\u007f":
    case "\b":
      controller.backspaceEditor()
      return true
    case "\u001b[3~":
      controller.deleteEditor()
      return true
    case "\u001b[D":
    case "\u001bOD":
      controller.moveEditorCursor("left")
      return true
    case "\u001b[C":
    case "\u001bOC":
      controller.moveEditorCursor("right")
      return true
    case "\u001b[A":
    case "\u001bOA":
      controller.moveEditorCursor("up")
      return true
    case "\u001b[B":
    case "\u001bOB":
      controller.moveEditorCursor("down")
      return true
    case "\u001b[H":
    case "\u001b[1~":
      controller.moveEditorCursor("home")
      return true
    case "\u001b[F":
    case "\u001b[4~":
      controller.moveEditorCursor("end")
      return true
    default: {
      const firstCode = sequence.charCodeAt(0)
      if (sequence.length > 1) {
        if (firstCode < 32 || (firstCode >= 0x80 && firstCode <= 0x9f)) {
          return false
        }
        const sanitized = sanitizePastedEditorText(sequence)
        if (sanitized.length > 0) {
          controller.pasteEditorClipboard(sanitized)
        }
        return true
      }
      if (sequence.length > 0 && ((firstCode >= 32 && firstCode < 127) || firstCode >= 160)) {
        controller.insertEditorText(sequence)
        return true
      }
      return false
    }
  }
}

function isWorkspaceInput(node: Renderable): boolean {
  return node.id === "bluenote-search-query"
    || node.id === "bluenote-editor-replace-text"
    || node.id === "bluenote-editor-find-query"
    || node.id === "bluenote-editor-body-input"
    || node.id === "bluenote-editor-body"
    || node.id === "bluenote-manager-filter-query"
    || node.id === "bluenote-manager-create-title"
}

export function focusActiveWorkspaceInput(screen: Renderable): void {
  const descendants = renderableDescendants(screen)
  const activeInputIds = [
    "bluenote-search-query",
    "bluenote-editor-replace-text",
    "bluenote-editor-find-query",
    "bluenote-editor-body-input",
    "bluenote-manager-filter-query",
    "bluenote-manager-create-title",
  ]
  const activeInput = descendants.find((node) => isWorkspaceInput(node) && node.focused)
    ?? activeInputIds.flatMap((id) => descendants.filter((node) => node.id === id)).at(0)
  if (!activeInput) {
    return
  }
  // OpenTUI focus registration is tied to the live renderable tree. Renderers may
  // focus inputs while composing a screen, before that screen is attached to the
  // root, so re-register the active component after attach.
  for (const node of descendants) {
    if (isWorkspaceInput(node) && node.focused) {
      node.blur()
    }
  }
  activeInput.focus()
}

export function blurWorkspaceInputs(screen: Renderable): void {
  for (const node of renderableDescendants(screen)) {
    if (isWorkspaceInput(node)) {
      node.blur()
    }
  }
}

export function defaultTuiRendererConfig() {
  return {
    screenMode: "alternate-screen" as const,
    exitOnCtrlC: true,
    useMouse: false,
    enableMouseMovement: false,
  }
}

export async function startTuiWorkspace(options: StartTuiWorkspaceOptions = {}): Promise<RunningTuiWorkspace> {
  const renderer = options.renderer ?? (await createCliRenderer(defaultTuiRendererConfig()))
  const controller = options.controller ?? createDefaultWorkspaceController()
  let currentScreen: BoxRenderable | null = null
  let destroyed = false
  let rerenderScheduled = false
  let rerenderTimer: ReturnType<typeof setTimeout> | null = null
  let cleanupTerminalResize = (): void => {}
  let cleanupWorkspaceInput = (): void => {}

  const destroy = (): void => {
    if (destroyed) {
      return
    }
    destroyed = true
    if (rerenderTimer) {
      clearTimeout(rerenderTimer)
      rerenderTimer = null
      rerenderScheduled = false
    }
    cleanupWorkspaceInput()
    cleanupWorkspaceInput = (): void => {}
    if (currentScreen) {
      blurWorkspaceInputs(currentScreen)
      currentScreen.destroyRecursively()
    }
    cleanupTerminalResize()
    currentScreen = null
    controller.dispose()
    renderer.destroy()
  }

  const rerender = (): void => {
    if (destroyed || renderer.isDestroyed) {
      return
    }
    for (const child of renderer.root.getChildren()) {
      blurWorkspaceInputs(child)
      renderer.root.remove(child.id)
      child.destroyRecursively()
    }
    currentScreen = renderWorkspace(renderer, controller, destroy, rerender)
    renderer.root.add(currentScreen)
    focusActiveWorkspaceInput(currentScreen)
    currentScreen.requestRender()
    renderer.root.requestRender()
    const immediateRenderer = renderer as unknown as { intermediateRender?: () => void; requestRender?: () => void }
    immediateRenderer.requestRender?.()
    immediateRenderer.intermediateRender?.()
  }

  const scheduleRerender = (): void => {
    if (rerenderScheduled) {
      return
    }
    rerenderScheduled = true
    rerenderTimer = setTimeout(() => {
      rerenderTimer = null
      rerenderScheduled = false
      rerender()
    }, 0)
  }

  if (process.stdout.isTTY) {
    const handleTerminalResize = (): void => {
      scheduleRerender()
    }
    process.stdout.on("resize", handleTerminalResize)
    process.on("SIGWINCH", handleTerminalResize)
    cleanupTerminalResize = () => {
      process.stdout.off("resize", handleTerminalResize)
      process.off("SIGWINCH", handleTerminalResize)
    }
  }

  controller.setAutosaveStateChangeHandler(rerender)

  const workspaceInputHandler = (sequence: string): boolean => {
    if (destroyed || renderer.isDestroyed) {
      return false
    }

    let routed = routeWorkspaceKey(sequence, controller, destroy, rerender)
    if (!routed.handled && routeControlledEditorBodyInput(controller, sequence)) {
      routed = { handled: true }
    }

    if (routed.handled && !routed.exit) {
      scheduleRerender()
    }
    return routed.handled
  }
  const workspacePasteHandler = (event: PasteEvent): void => {
    if (destroyed || renderer.isDestroyed) {
      return
    }
    const pasted = sanitizePastedEditorText(new TextDecoder().decode(event.bytes))
    if (pasted.length === 0) {
      return
    }
    if (routeControlledEditorBodyInput(controller, pasted)) {
      event.preventDefault()
      event.stopPropagation()
      scheduleRerender()
    }
  }
  const inputRegistration = renderer as unknown as WorkspaceInputRenderer
  if (inputRegistration.prependInputHandler) {
    inputRegistration.prependInputHandler(workspaceInputHandler)
  } else {
    inputRegistration.addInputHandler?.(workspaceInputHandler)
  }
  const pasteRegistration = renderer.keyInput
  pasteRegistration.on("paste", workspacePasteHandler)
  cleanupWorkspaceInput = () => {
    inputRegistration.removeInputHandler?.(workspaceInputHandler)
    pasteRegistration.off("paste", workspacePasteHandler)
  }

  renderer.start()
  rerender()

  return { renderer, controller, destroy }
}

export async function waitForInteractiveTuiExit(running: RunningTuiWorkspace): Promise<CliResult["exitCode"]> {
  let exitCode: CliResult["exitCode"] = 0
  const signals = ["SIGINT", "SIGTERM", "SIGHUP"] as const

  await new Promise<void>((resolve) => {
    let resolved = false
    let signalFallbackTimer: ReturnType<typeof setTimeout> | null = null
    const cleanupSignalHandlers = (): void => {
      for (const signal of signals) {
        process.off(signal, handleSignal)
      }
    }
    const cleanupFallback = (): void => {
      if (signalFallbackTimer) {
        clearTimeout(signalFallbackTimer)
        signalFallbackTimer = null
      }
    }
    const finish = (): void => {
      if (resolved) {
        return
      }
      resolved = true
      cleanupFallback()
      cleanupSignalHandlers()
      running.renderer.off("destroy", finish)
      resolve()
    }
    const handleSignal = (_signal: NodeJS.Signals): void => {
      exitCode = 1
      running.destroy()
      if (resolved) {
        return
      }
      // Renderer destroy can be deferred while OpenTUI is rendering. Prefer the
      // renderer's destroy event so terminal final cleanup completes before the
      // CLI resolves, but do not hang forever if an injected/test renderer fails
      // to emit the event after accepting destroy.
      if (!signalFallbackTimer) {
        signalFallbackTimer = setTimeout(finish, 1000)
      }
    }
    for (const signal of signals) {
      process.once(signal, handleSignal)
    }
    if (running.renderer.isDestroyed) {
      finish()
      return
    }
    running.renderer.once("destroy", finish)
  })

  return exitCode
}

export function runTuiCli(): CliResult {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: "BlueNote TUI requires an interactive terminal. Run `bn tui` from a TTY.\n",
    }
  }

  void startTuiWorkspace()

  return {
    exitCode: 0,
    stdout: "",
    stderr: "",
  }
}

export async function runTuiCliInteractive(): Promise<CliResult> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: "BlueNote TUI requires an interactive terminal. Run `bn tui` from a TTY.\n",
    }
  }

  const running = await startTuiWorkspace()
  const exitCode = await waitForInteractiveTuiExit(running)

  return {
    exitCode,
    stdout: "",
    stderr: "",
  }
}

const invokedPath = process.argv[1]
const isMainModule = invokedPath
  ? import.meta.url === new URL(invokedPath, "file://").href
  : false

if (isMainModule) {
  process.stdout.write(formatTuiBootstrapMessage())
}
