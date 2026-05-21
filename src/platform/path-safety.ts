import path from "node:path"

import { UsageError } from "../core/errors"

function assertNonEmptyPathInput(pathValue: string, label: "root" | "target"): void {
  if (pathValue.trim() === "") {
    throw new UsageError(`${label} path must not be empty.`)
  }
}

export function assertPathInsideRoot(rootPath: string, targetPath: string): string {
  assertNonEmptyPathInput(rootPath, "root")
  assertNonEmptyPathInput(targetPath, "target")

  const normalizedRootPath = path.resolve(rootPath)
  const normalizedTargetPath = path.resolve(targetPath)
  const relativePath = path.relative(normalizedRootPath, normalizedTargetPath)

  if (relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))) {
    return normalizedTargetPath
  }

  throw new UsageError(`Target path '${normalizedTargetPath}' is outside the managed root '${normalizedRootPath}'.`)
}

export function toRootRelativePath(rootPath: string, targetPath: string): string {
  const normalizedTargetPath = assertPathInsideRoot(rootPath, targetPath)

  return path.relative(path.resolve(rootPath), normalizedTargetPath)
}
