import type { ShowNoteOptions } from "../../core/show-note"
import type { AppErrorCode } from "../../core/types"
import { AppError, UsageError } from "../../core/errors"
import * as showNoteModule from "../../core/show-note"

export interface TuiNoteDetail {
  key: string
  selector: string
  title: string
  description: string
  relativePath: string
  body: string
}

export interface TuiAdapterError {
  code: AppErrorCode
  message: string
  hint?: string
}

export type NoteDetailAdapterResult =
  | {
      ok: true
      note: TuiNoteDetail
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

export function loadNoteDetail(options: ShowNoteOptions): NoteDetailAdapterResult {
  if (options.selector.trim().length === 0) {
    return {
      ok: false,
      error: toTuiAdapterError(
        new UsageError("No note is currently selected.", {
          hint: "Select a note from the sidebar before opening it.",
        }),
      ),
    }
  }

  try {
    const note = showNoteModule.showNote(options)

    return {
      ok: true,
      note: {
        key: note.key,
        selector: note.relativePath,
        title: note.title,
        description: note.description,
        relativePath: note.relativePath,
        body: note.body,
      },
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
