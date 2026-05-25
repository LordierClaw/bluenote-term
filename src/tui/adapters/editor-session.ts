import type { ResolveBlueNoteRootOptions } from "../../config/root"
import type { EditNoteSummary, PersistEditedNoteOptions } from "../../core/edit-note"
import { AppError } from "../../core/errors"
import { persistEditedNote } from "../../core/edit-note"
import type { TuiAdapterError } from "../data/note-detail-adapter"
import { createEditorBuffer, getEditorText, type EditorBuffer } from "../editor/editor-buffer"

export interface EditorSession {
  selector: string
  persistedBody: string
  buffer: EditorBuffer
  saveError: TuiAdapterError | null
}

export type SaveEditorSessionResult =
  | {
      ok: true
      summary: EditNoteSummary
      session: EditorSession
    }
  | {
      ok: false
      error: TuiAdapterError
      session: EditorSession
    }

export interface SaveEditorSessionOptions extends ResolveBlueNoteRootOptions {
  clock?: PersistEditedNoteOptions["clock"]
  randomSource?: PersistEditedNoteOptions["randomSource"]
}

function toTuiAdapterError(error: AppError): TuiAdapterError {
  return {
    code: error.code,
    message: error.message,
    ...(error.hint ? { hint: error.hint } : {}),
  }
}

export function createEditorSession(selector: string, body: string): EditorSession {
  return {
    selector,
    persistedBody: body,
    buffer: createEditorBuffer(body),
    saveError: null,
  }
}

export function discardEditorSession(session: EditorSession): EditorSession {
  return {
    ...session,
    buffer: createEditorBuffer(session.persistedBody),
    saveError: null,
  }
}

export function saveEditorSession(session: EditorSession, options: SaveEditorSessionOptions = {}): SaveEditorSessionResult {
  const body = getEditorText(session.buffer)

  try {
    const summary = persistEditedNote({
      ...options,
      selector: session.selector,
      body,
    })

    return {
      ok: true,
      summary,
      session: {
        ...session,
        selector: summary.key ?? session.selector,
        persistedBody: body,
        buffer: createEditorBuffer(body),
        saveError: null,
      },
    }
  } catch (error) {
    if (error instanceof AppError) {
      const saveError = toTuiAdapterError(error)

      return {
        ok: false,
        error: saveError,
        session: {
          ...session,
          saveError,
        },
      }
    }

    throw error
  }
}
