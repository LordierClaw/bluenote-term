import path from "node:path"

import { UsageError } from "../core/errors"

export function assertPathInsideRoot(rootPath: string, targetPath: string): string {
  const normalizedRootPath = path.resolve(rootPath)
  const normalizedTargetPath = path.resolve(targetPath)
  const relativePath = path.relative(normalizedRootPath, normalizedTargetPath)

  if (relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))) {
    return normalizedTargetPath
  }

  throw new UsageError(`Target path '${normalizedTargetPath}' is outside the managed root '${normalizedRootPath}'.`)
}

export function toRootRelativePath(rootPath: string, targetPath: string): string {
  const normalizedRootPath = path.resolve(rootPath)
  const normalizedTargetPath = assertPathInsideRoot(normalizedRootPath, targetPath)

  return path.relative(normalizedRootPath, normalizedTargetPath)
}
