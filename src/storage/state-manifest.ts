import path from "node:path"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"

import {
  STATE_DIRECTORY,
  STATE_MANIFEST_FILENAME,
  STORAGE_SCHEMA_VERSION,
} from "../config/root"
import { RootNotInitializedError } from "../core/errors"

export interface StateManifest {
  schemaVersion: number
}

export function createDefaultStateManifest(): StateManifest {
  return {
    schemaVersion: STORAGE_SCHEMA_VERSION,
  }
}

export function getStateManifestPath(rootPath: string): string {
  return path.join(path.resolve(rootPath), STATE_DIRECTORY, STATE_MANIFEST_FILENAME)
}

export function writeStateManifest(rootPath: string, manifest: StateManifest = createDefaultStateManifest()): string {
  const manifestPath = getStateManifestPath(rootPath)
  mkdirSync(path.dirname(manifestPath), { recursive: true })
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8")
  return manifestPath
}

export function readStateManifest(rootPath: string): StateManifest {
  try {
    return JSON.parse(readFileSync(getStateManifestPath(rootPath), "utf8")) as StateManifest
  } catch (error) {
    throw new RootNotInitializedError("BlueNote root is not initialized.", {
      hint: "Run 'bn init' to create a valid .state/manifest.json.",
      cause: error,
    })
  }
}
