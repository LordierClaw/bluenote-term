import path from "node:path"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"

import MiniSearch from "minisearch"
// @ts-expect-error sql.js does not ship TypeScript declarations in this project.
import initSqlJs from "sql.js"

import { IndexUnavailableError } from "../core/errors"
import { assertPathInsideRoot } from "../platform/path-safety"
import type { ParsedNote } from "../storage/note-schema"
import { createSearchDocuments } from "./search-documents"

const SQL = await initSqlJs()

const DERIVED_DIRECTORY = ".bluenote"
const METADATA_FILENAME = "metadata.sqlite"
const SEARCH_FILENAME = "search-index.json"
const SEARCH_FIELDS = ["title", "body", "tags"] as const
const SEARCH_STORE_FIELDS = ["id", "title", "relativePath"] as const

export interface IndexedNoteSummary {
  id: string
  title: string
  relativePath: string
  mode: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface RebuildIndexStoreInput {
  rootPath: string
  notes: ParsedNote[]
}

export interface RebuildIndexStoreResult {
  noteCount: number
  metadataDatabasePath: string
  searchIndexPath: string
}

export interface SearchIndexMatch {
  id: string
  title: string
  relativePath: string
}

export interface LoadedIndexStore {
  listSummaries(): IndexedNoteSummary[]
  search(query: string): SearchIndexMatch[]
}

function getDerivedDirectory(rootPath: string): string {
  return assertPathInsideRoot(path.resolve(rootPath), path.join(path.resolve(rootPath), DERIVED_DIRECTORY))
}

function getMetadataDatabasePath(rootPath: string): string {
  return path.join(getDerivedDirectory(rootPath), METADATA_FILENAME)
}

function getSearchIndexPath(rootPath: string): string {
  return path.join(getDerivedDirectory(rootPath), SEARCH_FILENAME)
}

function createSearchEngine() {
  return new MiniSearch({
    fields: [...SEARCH_FIELDS],
    storeFields: [...SEARCH_STORE_FIELDS],
  })
}

export function rebuildIndexStore(input: RebuildIndexStoreInput): RebuildIndexStoreResult {
  const metadataDatabasePath = getMetadataDatabasePath(input.rootPath)
  const searchIndexPath = getSearchIndexPath(input.rootPath)
  mkdirSync(path.dirname(metadataDatabasePath), { recursive: true })

  const db = new SQL.Database()
  db.run(`
    CREATE TABLE notes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      relativePath TEXT NOT NULL,
      mode TEXT NOT NULL,
      tagsJson TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `)

  const insert = db.prepare(`
    INSERT INTO notes (id, title, relativePath, mode, tagsJson, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)

  const sortedNotes = [...input.notes].sort((left, right) => left.sourcePath.localeCompare(right.sourcePath))

  try {
    for (const note of sortedNotes) {
      insert.run([
        note.frontmatter.id,
        note.frontmatter.title,
        note.sourcePath,
        note.frontmatter.mode,
        JSON.stringify(note.frontmatter.tags),
        note.frontmatter.createdAt,
        note.frontmatter.updatedAt,
      ])
    }
  } finally {
    insert.free()
  }

  writeFileSync(metadataDatabasePath, db.export())
  db.close()

  const searchEngine = createSearchEngine()
  searchEngine.addAll(createSearchDocuments(sortedNotes))
  writeFileSync(searchIndexPath, JSON.stringify(searchEngine), "utf8")

  return {
    noteCount: sortedNotes.length,
    metadataDatabasePath,
    searchIndexPath,
  }
}

export function loadIndexStore(rootPath: string): LoadedIndexStore {
  const metadataDatabasePath = getMetadataDatabasePath(rootPath)
  const searchIndexPath = getSearchIndexPath(rootPath)
  const rebuildHint = "Run bn rebuild to recreate .bluenote artifacts from note files."

  let metadataBytes: Uint8Array
  let searchJson: string

  try {
    metadataBytes = readFileSync(metadataDatabasePath)
    searchJson = readFileSync(searchIndexPath, "utf8")
  } catch (error) {
    throw new IndexUnavailableError("Derived indexes are unavailable.", {
      hint: rebuildHint,
      cause: error,
    })
  }

  try {
    const db = new SQL.Database(metadataBytes)

    try {
      const result = db.exec(`
        SELECT id, title, relativePath, mode, tagsJson, createdAt, updatedAt
        FROM notes
        ORDER BY relativePath ASC
      `)

      const summaries: IndexedNoteSummary[] = []
      const values = result[0]?.values ?? []

      for (const row of values) {
        const [id, title, relativePath, mode, tagsJson, createdAt, updatedAt] = row as [
          string,
          string,
          string,
          string,
          string,
          string,
          string,
        ]

        summaries.push({
          id,
          title,
          relativePath,
          mode,
          tags: JSON.parse(tagsJson) as string[],
          createdAt,
          updatedAt,
        })
      }

      const searchEngine = MiniSearch.loadJSON<SearchIndexMatch>(searchJson, {
        fields: [...SEARCH_FIELDS],
        storeFields: [...SEARCH_STORE_FIELDS],
      })

      return {
        listSummaries() {
          return summaries.map((summary) => ({
            ...summary,
            tags: [...summary.tags],
          }))
        },

        search(query: string) {
          if (query.trim() === "") {
            return []
          }

          return searchEngine.search(query).map((match) => ({
            id: String(match.id),
            title: String(match.title),
            relativePath: String(match.relativePath),
          }))
        },
      }
    } finally {
      db.close()
    }
  } catch (error) {
    throw new IndexUnavailableError("Derived indexes are unavailable.", {
      hint: rebuildHint,
      cause: error,
    })
  }
}
