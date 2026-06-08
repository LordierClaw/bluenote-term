import { describe, test } from "bun:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"

const repoRoot = path.resolve(import.meta.dir, "../../..")

const clientFiles = [
  "packages/term/src/cli/entry.ts",
  "packages/term/src/cli/ai.ts",
  "packages/term/src/core/edit-note.ts",
  "packages/term/src/tui/app.ts",
  "packages/term/src/tui/latest-opened-note.ts",
  "packages/term/src/tui/workspace-controller.ts",
  "packages/term/src/tui/adapters/note-manager-adapter.ts",
  "packages/term/src/tui/adapters/search-everything-adapter.ts",
  "packages/term/src/platform/editor.ts",
]

const movedBusinessImportPattern = /from\s+["'](?:\.\.\/)+(?:core|storage|config|domain|search|index|ai|platform\/path-safety)(?:\/[^"']*)?["']/g
const termOwnedCoreImports = new Set(['from "../core/edit-note"'])

describe("CLI/TUI @bluenote/core boundary", () => {
  test("client files consume moved business modules through @bluenote/core", async () => {
    const violations: string[] = []

    for (const relativePath of clientFiles) {
      const source = await readFile(path.join(repoRoot, relativePath), "utf8")
      const matches = (source.match(movedBusinessImportPattern) ?? []).filter((specifier) => !termOwnedCoreImports.has(specifier))

      if (matches.length > 0) {
        violations.push(`${relativePath}: ${matches.join(", ")}`)
      }

      if (!source.includes('from "@bluenote/core"')) {
        violations.push(`${relativePath}: missing @bluenote/core import`)
      }
    }

    assert.deepEqual(violations, [])
  })
})
