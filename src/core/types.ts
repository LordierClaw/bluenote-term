export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E }

export type AsyncResult<T, E = Error> = Promise<Result<T, E>>

export type Maybe<T> = T | undefined

export interface AppErrorOptions {
  hint?: string
  cause?: unknown
}
