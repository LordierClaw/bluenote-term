import { resolveBlueNoteRoot, type ResolveBlueNoteRootOptions } from "../config/root"
import { systemClock, type Clock } from "../platform/clock"
import { migrateLegacyStorage, type MigrateLegacyStorageResult } from "../storage/migration"

export interface MigrateStorageOptions extends ResolveBlueNoteRootOptions {
  clock?: Clock
  randomSource?: () => number
}

export function migrateStorage(options: MigrateStorageOptions = {}): MigrateLegacyStorageResult {
  const rootPath = resolveBlueNoteRoot(options)
  const clock = options.clock ?? systemClock

  return migrateLegacyStorage({
    rootPath,
    migratedAt: clock.now().toISOString(),
    randomSource: options.randomSource,
  })
}
