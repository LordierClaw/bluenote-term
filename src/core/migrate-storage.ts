import { resolveBlueNoteRoot, type ResolveBlueNoteRootOptions } from "../config/root"
import { systemClock, type Clock } from "../platform/clock"
import { migrateLegacyAppStateToData } from "../storage/app-state-migration"
import { migrateLegacyStorage, type MigrateLegacyStorageResult } from "../storage/migration"

export interface MigrateStorageOptions extends ResolveBlueNoteRootOptions {
  clock?: Clock
  randomSource?: () => number
}

export function migrateStorage(options: MigrateStorageOptions = {}): MigrateLegacyStorageResult {
  const rootPath = resolveBlueNoteRoot(options)
  const clock = options.clock ?? systemClock

  migrateLegacyAppStateToData(rootPath)

  return migrateLegacyStorage({
    rootPath,
    migratedAt: clock.now().toISOString(),
    randomSource: options.randomSource,
  })
}
