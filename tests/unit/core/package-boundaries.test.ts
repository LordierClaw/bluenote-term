import { describe, test } from "bun:test"
import assert from "node:assert/strict"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

const repoRoot = path.resolve(import.meta.dir, "../../..")

async function collectTsFiles(relativeDir: string): Promise<string[]> {
  const absoluteDir = path.join(repoRoot, relativeDir)
  const entries = await readdir(absoluteDir, { recursive: true, withFileTypes: true })

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => path.relative(repoRoot, path.join(entry.parentPath, entry.name)))
    .sort()
}

async function read(relativePath: string): Promise<string> {
  return readFile(path.join(repoRoot, relativePath), "utf8")
}

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = []
  const importExportPattern = /(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g
  const dynamicImportPattern = /import\(\s*["']([^"']+)["']\s*\)/g

  for (const match of source.matchAll(importExportPattern)) {
    specifiers.push(match[1])
  }

  for (const match of source.matchAll(dynamicImportPattern)) {
    specifiers.push(match[1])
  }

  return specifiers
}

const termOwnedFiles = [
  "packages/term/bin/bn.ts",
  "packages/term/src/cli/entry.ts",
  "packages/term/src/cli/ai.ts",
  "packages/term/src/core/edit-note.ts",
  "packages/term/src/platform/clipboard.ts",
  "packages/term/src/platform/editor.ts",
  "packages/term/src/tui/app.ts",
  "packages/term/src/tui/display-width.ts",
  "packages/term/src/tui/latest-opened-note.ts",
  "packages/term/src/tui/paste.ts",
  "packages/term/src/tui/render-chrome.ts",
  "packages/term/src/tui/render-editor.ts",
  "packages/term/src/tui/render-manager.ts",
  "packages/term/src/tui/render-search-everything.ts",
  "packages/term/src/tui/state.ts",
  "packages/term/src/tui/theme.ts",
  "packages/term/src/tui/workspace-controller.ts",
  "packages/term/src/tui/adapters/desktop-clipboard-adapter.ts",
  "packages/term/src/tui/adapters/editor-buffer-adapter.ts",
  "packages/term/src/tui/adapters/note-manager-adapter.ts",
  "packages/term/src/tui/adapters/search-everything-adapter.ts",
]

const rootCompatibilityShims = [
  "bin/bn.ts",
  "src/cli/entry.ts",
  "src/cli/ai.ts",
  "src/core/edit-note.ts",
  "src/platform/clipboard.ts",
  "src/platform/editor.ts",
  "src/tui/app.ts",
  "src/tui/display-width.ts",
  "src/tui/latest-opened-note.ts",
  "src/tui/paste.ts",
  "src/tui/render-chrome.ts",
  "src/tui/render-editor.ts",
  "src/tui/render-manager.ts",
  "src/tui/render-search-everything.ts",
  "src/tui/state.ts",
  "src/tui/theme.ts",
  "src/tui/workspace-controller.ts",
  "src/tui/adapters/desktop-clipboard-adapter.ts",
  "src/tui/adapters/editor-buffer-adapter.ts",
  "src/tui/adapters/note-manager-adapter.ts",
  "src/tui/adapters/search-everything-adapter.ts",
]

const termBusinessIntegrationFiles = [
  "packages/term/src/cli/entry.ts",
  "packages/term/src/cli/ai.ts",
  "packages/term/src/core/edit-note.ts",
  "packages/term/src/tui/app.ts",
  "packages/term/src/tui/latest-opened-note.ts",
  "packages/term/src/tui/workspace-controller.ts",
  "packages/term/src/tui/adapters/note-manager-adapter.ts",
  "packages/term/src/tui/adapters/search-everything-adapter.ts",
]

describe("package boundary enforcement", () => {
  test("packages/core remains headless and does not import the terminal client", async () => {
    const files = await collectTsFiles("packages/core/src")
    const violations: string[] = []

    for (const file of files) {
      const source = await read(file)
      const specifiers = importSpecifiers(source)
      const forbidden = specifiers.filter((specifier) =>
        specifier === "@opentui/core" ||
        specifier.includes("packages/term") ||
        specifier.includes("src/tui") ||
        specifier.includes("/term/") ||
        specifier.startsWith("bluenote-term"),
      )

      if (forbidden.length > 0) {
        violations.push(`${file}: ${forbidden.join(", ")}`)
      }
    }

    assert.deepEqual(violations, [])
  })

  test("term-owned executable, CLI, TUI, platform, and editor files live in packages/term", async () => {
    const missing: string[] = []

    for (const file of termOwnedFiles) {
      try {
        await read(file)
      } catch {
        missing.push(file)
      }
    }

    assert.deepEqual(missing, [])
  })

  test("packages/term imports business logic through @bluenote/core instead of root shims", async () => {
    const files = await collectTsFiles("packages/term")
    const violations: string[] = []
    const forbiddenRootBusinessPattern = /(?:^|\/)src\/(?:core|storage|config|ai|search|index|domain)(?:\/|$)/

    for (const file of files) {
      const source = await read(file)
      const specifiers = importSpecifiers(source)
      const forbidden = specifiers.filter((specifier) => {
        if (!specifier.startsWith(".")) {
          return forbiddenRootBusinessPattern.test(specifier)
        }

        const resolved = path.normalize(path.join(path.dirname(file), specifier))
        return forbiddenRootBusinessPattern.test(resolved) && !resolved.startsWith("packages/term/src/core/edit-note")
      })

      if (forbidden.length > 0) {
        violations.push(`${file}: ${forbidden.join(", ")}`)
      }
    }

    for (const file of termBusinessIntegrationFiles) {
      const source = await read(file)
      if (!source.includes('from "@bluenote/core"') && !source.includes("from '@bluenote/core'")) {
        violations.push(`${file}: missing @bluenote/core import`)
      }
    }

    assert.deepEqual(violations, [])
  })

  test("root term paths are compatibility shims to packages/term", async () => {
    const violations: string[] = []

    for (const file of rootCompatibilityShims) {
      const source = await read(file)
      if (!source.includes("packages/term")) {
        violations.push(`${file}: does not shim to packages/term`)
      }
    }

    assert.deepEqual(violations, [])
  })
})
