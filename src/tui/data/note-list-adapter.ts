import type { ResolveBlueNoteRootOptions } from "../../config/root"
import type { AppErrorCode } from "../../core/types"
import { AppError } from "../../core/errors"
import * as listNotesModule from "../../core/list-notes"

export interface TuiNoteListItem {
  key: string
  selector: string
  title: string
  description: string
  relativePath: string
}

export interface TuiAdapterError {
  code: AppErrorCode
  message: string
  hint?: string
}

export type NoteListAdapterResult =
  | {
      ok: true
      notes: TuiNoteListItem[]
    }
  | {
      ok: false
      error: TuiAdapterError
    }

function toTuiAdapterError(error: AppError): TuiAdapterError {
  return {
    code: error.code,
    message: error.message,
    ...(error.hint ? { hint: error.hint } : {}),
  }
}

export function loadNoteList(options: ResolveBlueNoteRootOptions = {}): NoteListAdapterResult {
  try {
    return {
      ok: true,
      notes: listNotesModule.listNotes(options).map((note) => ({
        key: note.key,
        selector: note.key,
        title: note.title,
        description: note.description,
        relativePath: note.relativePath,
      })),
    }
  } catch (error) {
    if (error instanceof AppError) {
      return {
        ok: false,
        error: toTuiAdapterError(error),
      }
    }

    throw error
  }
}
