import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { test } from "bun:test"
import assert from "node:assert/strict"

import rootPackage from "../../package.json"
import termPackage from "../../packages/term/package.json"

const releaseScript = readFileSync(path.resolve("scripts", "package-release.ts"), "utf8")
const readme = readFileSync(path.resolve("README.md"), "utf8")
const developmentGuide = readFileSync(path.resolve("DEVELOPMENT.md"), "utf8")
const rootBin = readFileSync(path.resolve("bin", "bn.ts"), "utf8")

test("terminal package uses the approved public package name and stable bin", () => {
  assert.equal(termPackage.name, "@lordierclaw/bluenote-term")
  assert.match(termPackage.version, /^\d+\.\d+\.\d+$/)
  assert.equal(termPackage.license, "Apache-2.0")
  assert.deepEqual(termPackage.repository, {
    type: "git",
    url: "https://github.com/LordierClaw/bluenote-term",
  })
  assert.equal(rootPackage.version, "0.1.0")
  assert.equal(termPackage.bin["bluenote-term"], "./bin/bluenote-term.js")
  assert.equal(termPackage.dependencies["@lordierclaw/bluenote-core"], "latest")
})

test("terminal docs use the approved scoped package name for install and imports", () => {
  assert.match(readme, /built terminal artifact managed by the distribution installer/)
  assert.match(readme, /bun run \.\/packages\/term\/bin\/bn\.ts --help/)
  assert.match(readme, /bun run \.\/packages\/term\/bin\/bn\.ts --check-daemon --daemon-url http:\/\/127\.0\.0\.1:12345/)
  assert.doesNotMatch(readme, /bun run \.\/bin\/bn\.ts --check-daemon/)
  assert.doesNotMatch(readme, /npm install -g bluenote-term\b/)
  assert.match(developmentGuide, /from "@lordierclaw\/bluenote-term"/)
  assert.match(developmentGuide, /`@lordierclaw\/bluenote-term` and `@lordierclaw\/bluenote-term\/command`/)
  assert.doesNotMatch(developmentGuide, /from "bluenote-term"/)
})

test("terminal package artifact is restricted to runtime package contents", () => {
  assert.deepEqual(termPackage.files, ["bin/bluenote-term.js", "dist", "src/command.d.ts"])
  assert.equal(termPackage.exports["."].import, "./dist/command.js")
  assert.equal(termPackage.exports["./command"].import, "./dist/command.js")
})

test("published terminal bin is a Node wrapper over the built runtime package", () => {
  const publicBin = readFileSync(path.resolve("packages", "term", "bin", "bluenote-term.js"), "utf8")

  assert.match(publicBin, /^#!\/usr\/bin\/env node/m)
  assert.match(publicBin, /from "\.\.\/dist\/command\.js"/)
  assert.match(publicBin, /readdirSync/)
  assert.match(publicBin, /probeTuiRuntime: probeBuiltTuiRuntime/)
  assert.match(publicBin, /cannot launch the full TUI on plain Node\.js/)
})

test("release packaging keeps built no-Bun runtime artifacts for non-technical installs", () => {
  assert.equal(rootPackage.scripts["build:release"], "bun run ./scripts/package-release.ts")
  assert.match(rootBin, /from "\.\.\/packages\/term\/package\.json"/)
  assert.match(rootBin, /from "\.\.\/src\/cli\/entry"/)
  assert.match(rootBin, /from "\.\.\/src\/tui\/app"/)
  assert.match(rootBin, /args\[0\] === "tui"/)
  assert.match(rootBin, /await runTuiCliInteractive\(\)/)
  assert.match(releaseScript, /platformId: "windows-x64" \| "linux-x64"/)
  assert.match(releaseScript, /executableName: "bluenote-term\.exe" \| "bluenote-term"/)
  assert.match(releaseScript, /bun", \["build", "\.\/packages\/term\/bin\/bluenote-term\.ts", "--compile"/)
  assert.match(releaseScript, /Expected a semver tag like v0\.1\.0\./)
  assert.match(releaseScript, /No network install is required after extraction\./)
  assert.match(releaseScript, /bluenote-term\.exe --help/)
  assert.match(releaseScript, /\.\/bluenote-term --help/)
  assert.match(releaseScript, /Usage: bluenote-term \[options\]/)
  assert.match(releaseScript, /legacy note-management CLI/)
})

test("compiled portable launcher help stays TUI-only", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "bluenote-term-release-test-"))
  const executablePath = path.join(tempRoot, process.platform === "win32" ? "bluenote-term.exe" : "bluenote-term")

  try {
    const buildResult = Bun.spawnSync([
      "bun",
      "build",
      "./packages/term/bin/bluenote-term.ts",
      "--compile",
      "--outfile",
      executablePath,
    ], {
      cwd: process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
    })
    assert.equal(buildResult.exitCode, 0, new TextDecoder().decode(buildResult.stderr))

    const helpResult = Bun.spawnSync([executablePath, "--help"], {
      cwd: process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
    })

    const stdout = new TextDecoder().decode(helpResult.stdout)
    const stderr = new TextDecoder().decode(helpResult.stderr)
    assert.equal(helpResult.exitCode, 0, stderr)
    assert.match(stdout, /Usage: bluenote-term \[options\]/)
    assert.match(stdout, /Launch the BlueNote terminal UI workspace\./)
    assert.doesNotMatch(stdout, /Usage:\n  bn <command> \[options\]/)
    assert.doesNotMatch(stdout, /init\s+Initialize the managed BlueNote root/)

    const probeResult = Bun.spawnSync([executablePath, "--probe-tui-runtime"], {
      cwd: process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
    })
    const probeStdout = new TextDecoder().decode(probeResult.stdout)
    const probeStderr = new TextDecoder().decode(probeResult.stderr)
    assert.equal(probeResult.exitCode, 0, probeStderr)
    assert.match(probeStdout, /BlueNote TUI runtime available\./)
  } finally {
    rmSync(tempRoot, { recursive: true, force: true })
  }
})
