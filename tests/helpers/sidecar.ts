import { readFile } from "node:fs/promises"
import path from "node:path"

import { createSidecarRepository } from "../../src/storage/sidecar-repository"

export async function readSidecarByKey(rootPath: string, key: string): Promise<Record<string, any>> {
  const sidecar = createSidecarRepository(rootPath).read(key)
  return sidecar as unknown as Record<string, any>
}

export async function readSidecarJsonByKey(rootPath: string, key: string): Promise<Record<string, any>> {
  return JSON.parse(await readFile(createSidecarRepository(rootPath).getSidecarPath(key), "utf8"))
}

export function getSidecarPathByKey(rootPath: string, key: string): string {
  const sidecar = createSidecarRepository(rootPath).read(key) as unknown as { noteId?: string }
  return path.join(rootPath, ".data", "notes", `${sidecar.noteId ?? key}.json`)
}
