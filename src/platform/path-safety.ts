import path from "node:path"

export function assertPathInsideRoot(rootPath: string, targetPath: string): string {
  const normalizedRootPath = path.resolve(rootPath)
  const normalizedTargetPath = path.resolve(targetPath)
  const relativePath = path.relative(normalizedRootPath, normalizedTargetPath)

  if (relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))) {
    return normalizedTargetPath
  }

  throw new Error(`Target path '${normalizedTargetPath}' is outside the managed root '${normalizedRootPath}'.`)
}

export function toRootRelativePath(rootPath: string, targetPath: string): string {
  const normalizedTargetPath = assertPathInsideRoot(rootPath, targetPath)

  return path.relative(path.resolve(rootPath), normalizedTargetPath)
}
