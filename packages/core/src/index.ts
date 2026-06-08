import type { ResolveBlueNoteRootOptions } from "../../../src/config/root"
import { initRoot, type InitRootSummary } from "../../../src/core/init-root"
import { listNotes, type NoteSummary } from "../../../src/core/list-notes"
import { showNote, type ShowNoteOptions, type ShowNoteSummary } from "../../../src/core/show-note"
import { createNote, type CreateNoteOptions, type CreateNoteSummary } from "../../../src/core/create-note"
import { deleteNote, type DeleteNoteOptions, type DeleteNoteSummary } from "../../../src/core/delete-note"
import { archiveNote, type ArchiveNoteOptions, type ArchiveNoteSummary } from "../../../src/core/archive-note"
import { renameNote, type RenameNoteOptions, type RenameNoteSummary } from "../../../src/core/rename-note"
import { moveNote, type MoveNoteOptions, type MoveNoteSummary } from "../../../src/core/move-note"
import { promoteDraft, type PromoteDraftOptions, type PromoteDraftSummary } from "../../../src/core/promote-draft"
import { searchNotes, type SearchNoteMatch } from "../../../src/core/search-notes"
import { rebuildIndexes, type RebuildIndexesOptions, type RebuildIndexesSummary } from "../../../src/core/rebuild-indexes"
import type { NoteVisibilityOptions } from "../../../src/core/note-visibility"

export * from "./core/errors"
export type * from "./core/types"
export * from "./domain/note-description"
export * from "./domain/note-key"
export * from "./platform/clock"
export * from "./platform/ids"
export * from "./platform/path-safety"

export type {
  InitRootSummary,
  NoteSummary,
  ShowNoteSummary,
  CreateNoteOptions,
  CreateNoteSummary,
  DeleteNoteSummary,
  ArchiveNoteSummary,
  RenameNoteSummary,
  MoveNoteSummary,
  PromoteDraftSummary,
  SearchNoteMatch,
  RebuildIndexesSummary,
}

export interface BlueNoteCoreConfig extends Omit<ResolveBlueNoteRootOptions, "override"> {
  rootPath?: string
}

export type BlueNoteCoreRootOptions = Omit<ResolveBlueNoteRootOptions, "override"> & {
  rootPath?: string
}

type RootedOptions = BlueNoteCoreRootOptions & { override?: string }

export type NotesListOptions = BlueNoteCoreRootOptions & NoteVisibilityOptions
export type NotesGetOptions = BlueNoteCoreRootOptions & Omit<ShowNoteOptions, keyof ResolveBlueNoteRootOptions | "selector">
export type NotesCreateOptions = BlueNoteCoreRootOptions & Omit<CreateNoteOptions, keyof ResolveBlueNoteRootOptions>
export type NotesDeleteOptions = BlueNoteCoreRootOptions & Omit<DeleteNoteOptions, keyof ResolveBlueNoteRootOptions | "selector">
export type NotesArchiveOptions = BlueNoteCoreRootOptions & Omit<ArchiveNoteOptions, keyof ResolveBlueNoteRootOptions | "selector">
export type NotesRenameOptions = BlueNoteCoreRootOptions & Omit<RenameNoteOptions, keyof ResolveBlueNoteRootOptions | "selector">
export type NotesMoveOptions = BlueNoteCoreRootOptions & Omit<MoveNoteOptions, keyof ResolveBlueNoteRootOptions | "selector">
export type NotesPromoteDraftOptions = BlueNoteCoreRootOptions & Omit<PromoteDraftOptions, keyof ResolveBlueNoteRootOptions | "selector">
export type SearchOptions = BlueNoteCoreRootOptions & NoteVisibilityOptions
export type RebuildOptions = BlueNoteCoreRootOptions & Omit<RebuildIndexesOptions, keyof ResolveBlueNoteRootOptions>

export interface BlueNoteCore {
  init(options?: BlueNoteCoreRootOptions): InitRootSummary
  notes: {
    list(options?: NotesListOptions): NoteSummary[]
    get(selector: string, options?: NotesGetOptions): ShowNoteSummary
    create(options: NotesCreateOptions): CreateNoteSummary
    delete(selector: string, options?: NotesDeleteOptions): DeleteNoteSummary
    archive(selector: string, options?: NotesArchiveOptions): ArchiveNoteSummary
    rename(selector: string, options: NotesRenameOptions): RenameNoteSummary
    move(selector: string, options: NotesMoveOptions): MoveNoteSummary
    promoteDraft(selector: string, options: NotesPromoteDraftOptions): PromoteDraftSummary
  }
  search: {
    search(query: string, options?: SearchOptions): SearchNoteMatch[]
  }
  rebuild(options?: RebuildOptions): RebuildIndexesSummary
}

function applyRoot(config: BlueNoteCoreConfig, options: RootedOptions = {}): ResolveBlueNoteRootOptions {
  const { rootPath, override, env, cwd, homeDir } = options
  return {
    env: env ?? config.env,
    cwd: cwd ?? config.cwd,
    homeDir: homeDir ?? config.homeDir,
    override: override ?? rootPath ?? config.rootPath,
  }
}

function withRoot<TOptions extends RootedOptions>(config: BlueNoteCoreConfig, options: TOptions): Omit<TOptions, "rootPath"> & ResolveBlueNoteRootOptions {
  const { rootPath, override, env, cwd, homeDir, ...rest } = options
  return {
    ...rest,
    ...applyRoot(config, { rootPath, override, env, cwd, homeDir }),
  } as Omit<TOptions, "rootPath"> & ResolveBlueNoteRootOptions
}

export function createBlueNoteCore(config: BlueNoteCoreConfig = {}): BlueNoteCore {
  return {
    init(options = {}) {
      return initRoot(applyRoot(config, options))
    },
    notes: {
      list(options = {}) {
        return listNotes(withRoot(config, options))
      },
      get(selector, options = {}) {
        return showNote({ ...withRoot(config, options), selector })
      },
      create(options) {
        return createNote(withRoot(config, options))
      },
      delete(selector, options = {}) {
        return deleteNote({ ...withRoot(config, options), selector })
      },
      archive(selector, options = {}) {
        return archiveNote({ ...withRoot(config, options), selector })
      },
      rename(selector, options) {
        return renameNote({ ...withRoot(config, options), selector })
      },
      move(selector, options) {
        return moveNote({ ...withRoot(config, options), selector })
      },
      promoteDraft(selector, options) {
        return promoteDraft({ ...withRoot(config, options), selector })
      },
    },
    search: {
      search(query, options = {}) {
        return searchNotes(query, withRoot(config, options))
      },
    },
    rebuild(options = {}) {
      return rebuildIndexes(withRoot(config, options))
    },
  }
}
