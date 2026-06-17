import { readFileSync } from "node:fs"
import path from "node:path"
import { test } from "bun:test"
import assert from "node:assert/strict"

import rootPackage from "../../package.json"
import termPackage from "../../packages/term/package.json"

const releaseScript = readFileSync(path.resolve("scripts", "package-release.ts"), "utf8")
const readme = readFileSync(path.resolve("README.md"), "utf8")
const developmentGuide = readFileSync(path.resolve("DEVELOPMENT.md"), "utf8")

test("terminal package uses the approved public package name and stable bin", () => {
  assert.equal(termPackage.name, "@lordierclaw/bluenote-term")
  assert.equal(termPackage.version, "0.1.0")
  assert.equal(termPackage.license, "Apache-2.0")
  assert.equal(rootPackage.version, termPackage.version)
  assert.equal(termPackage.bin["bluenote-term"], "./bin/bluenote-term.ts")
})

test("terminal docs use the approved scoped package name for install and imports", () => {
  assert.match(readme, /npm install -g @lordierclaw\/bluenote-term/)
  assert.doesNotMatch(readme, /npm install -g bluenote-term\b/)
  assert.match(developmentGuide, /from "@lordierclaw\/bluenote-term"/)
  assert.match(developmentGuide, /`@lordierclaw\/bluenote-term` and `@lordierclaw\/bluenote-term\/command`/)
  assert.doesNotMatch(developmentGuide, /from "bluenote-term"/)
})

test("terminal package artifact is restricted to runtime package contents", () => {
  assert.deepEqual(termPackage.files, ["bin", "src"])
  assert.equal(termPackage.exports["."].import, "./src/command.js")
  assert.equal(termPackage.exports["./command"].import, "./src/command.js")
})

test("release packaging keeps built no-Bun runtime artifacts for non-technical installs", () => {
  assert.equal(rootPackage.scripts["build:release"], "bun run ./scripts/package-release.ts")
  assert.match(releaseScript, /platformId: "windows-x64" \| "linux-x64"/)
  assert.match(releaseScript, /executableName: "bn\.exe" \| "bn"/)
  assert.match(releaseScript, /bun", \["build", "\.\/bin\/bn\.ts", "--compile"/)
  assert.match(releaseScript, /Expected a semver tag like v0\.1\.0\./)
  assert.match(releaseScript, /No network install is required after extraction\./)
})
