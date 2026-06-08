import { spawnSync } from "node:child_process"
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"

const releaseRoot = path.resolve("dist", "release")
const workRoot = path.join(releaseRoot, "work")
const verifyRoot = path.join(releaseRoot, "verify")
const packageRoot = path.join(workRoot, "bluenote")
const sqlWasmFilename = "sql-wasm.wasm"
const sqlWasmSourcePath = path.resolve("node_modules", "sql.js", "dist", sqlWasmFilename)
const releaseVersionPattern = /^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/

interface PlatformRelease {
  platformId: "windows-x64" | "linux-x64"
  executableName: "bn.exe" | "bn"
  archiveNames: readonly [string, ...string[]]
}

function deriveReleaseVersion(): string {
  const packageJson = JSON.parse(readFileSync(path.resolve("package.json"), "utf8")) as { version: string }
  const packageVersion = `v${packageJson.version}`
  const explicitVersion = process.env.BLUENOTE_RELEASE_VERSION?.trim()
  if (explicitVersion) {
    return validateReleaseVersion(explicitVersion, packageVersion)
  }

  const githubRefName = process.env.GITHUB_REF_NAME?.trim()
  if (githubRefName?.startsWith("v")) {
    return validateReleaseVersion(githubRefName, packageVersion)
  }

  return validateReleaseVersion(packageVersion, packageVersion)
}

function validateReleaseVersion(version: string, packageVersion: string): string {
  if (!releaseVersionPattern.test(version)) {
    throw new Error(`Invalid release version '${version}'. Expected a semver tag like v0.4.0.`)
  }

  if (version !== packageVersion) {
    throw new Error(`Release version ${version} does not match package.json version ${packageVersion}.`)
  }

  return version
}

function getPlatformRelease(version: string): PlatformRelease {
  const { platform, arch } = process

  if (platform === "win32" && arch === "x64") {
    return {
      platformId: "windows-x64",
      executableName: "bn.exe",
      archiveNames: [`bluenote-${version}-windows-x64.zip`],
    }
  }

  if (platform === "linux" && arch === "x64") {
    return {
      platformId: "linux-x64",
      executableName: "bn",
      archiveNames: [`bluenote-${version}-linux-x64.tar.gz`],
    }
  }

  throw new Error(`Unsupported release platform: ${platform}/${arch}. Supported platforms: win32/x64, linux/x64.`)
}

function run(command: string, args: string[], options: { capture?: boolean; cwd?: string } = {}): string {
  console.log(`$ ${[command, ...args].join(" ")}`)
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    shell: false,
    stdio: options.capture ? "pipe" : "inherit",
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    const stderr = result.stderr ? `\n${result.stderr}` : ""
    throw new Error(`Command failed with exit code ${result.status}: ${command}${stderr}`)
  }

  return `${result.stdout ?? ""}${result.stderr ?? ""}`
}

function writeReleaseReadme(): void {
  writeFileSync(
    path.join(packageRoot, "README.txt"),
    `BlueNote portable release

Windows:
  bn.exe --help
  bn.exe init
  bn.exe tui

Linux:
  ./bn --help
  ./bn init
  ./bn tui

Keep ${sqlWasmFilename} next to the executable. Notes are local files.
No network install is required after extraction.
`,
    "utf8",
  )
}

function powershellSingleQuoted(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

function archivePackage(release: PlatformRelease): void {
  for (const archiveName of release.archiveNames) {
    const archivePath = path.join(releaseRoot, archiveName)

    if (process.platform === "win32") {
      run("powershell", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        `Compress-Archive -LiteralPath ${powershellSingleQuoted(packageRoot)} -DestinationPath ${powershellSingleQuoted(archivePath)} -Force`,
      ])
      continue
    }

    run("tar", ["-czf", archivePath, "-C", workRoot, "bluenote"])
  }
}

function validateArchive(release: PlatformRelease, archiveName: string): void {
  const archivePath = path.join(releaseRoot, archiveName)
  const extractedRoot = path.join(verifyRoot, release.platformId)
  const extractedPackageRoot = path.join(extractedRoot, "bluenote")
  const extractedExecutable = path.join(extractedPackageRoot, release.executableName)
  const extractedReadme = path.join(extractedPackageRoot, "README.txt")
  const extractedSqlWasm = path.join(extractedPackageRoot, sqlWasmFilename)

  rmSync(extractedRoot, { recursive: true, force: true })
  mkdirSync(extractedRoot, { recursive: true })

  if (process.platform === "win32") {
    run("powershell", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `Expand-Archive -LiteralPath ${powershellSingleQuoted(archivePath)} -DestinationPath ${powershellSingleQuoted(extractedRoot)} -Force`,
    ])
  } else {
    run("tar", ["-xzf", archivePath, "-C", extractedRoot])
  }

  if (!existsSync(extractedExecutable)) {
    throw new Error(`Release archive validation failed: missing executable ${extractedExecutable}`)
  }

  if (!existsSync(extractedReadme)) {
    throw new Error(`Release archive validation failed: missing README ${extractedReadme}`)
  }

  if (!existsSync(extractedSqlWasm)) {
    throw new Error(`Release archive validation failed: missing SQL.js WASM file ${extractedSqlWasm}`)
  }

  const helpOutput = run(extractedExecutable, ["--help"], { capture: true, cwd: extractedRoot })
  if (!helpOutput.includes("BlueNote v")) {
    throw new Error("Release archive validation failed: extracted executable --help output did not contain 'BlueNote v'.")
  }
}

function main(): void {
  const version = deriveReleaseVersion()
  const release = getPlatformRelease(version)
  const executablePath = path.join(packageRoot, release.executableName)
  const archivePaths = release.archiveNames.map((archiveName) => path.join(releaseRoot, archiveName))

  console.log(`Packaging BlueNote ${version} for ${release.platformId}`)

  rmSync(releaseRoot, { recursive: true, force: true })
  mkdirSync(packageRoot, { recursive: true })

  run("bun", ["build", "./bin/bn.ts", "--compile", "--outfile", executablePath])
  copyFileSync(sqlWasmSourcePath, path.join(packageRoot, sqlWasmFilename))

  if (process.platform !== "win32") {
    chmodSync(executablePath, 0o755)
  }

  writeReleaseReadme()

  const helpOutput = run(executablePath, ["--help"], { capture: true })
  process.stdout.write(helpOutput)
  if (!helpOutput.includes("BlueNote v")) {
    throw new Error("Packaged executable smoke check failed: --help output did not contain 'BlueNote v'.")
  }

  archivePackage(release)

  for (const archivePath of archivePaths) {
    if (!existsSync(archivePath)) {
      throw new Error(`Release archive was not created: ${archivePath}`)
    }
  }

  for (const archiveName of release.archiveNames) {
    validateArchive(release, archiveName)
  }

  console.log(`Created ${archivePaths.join(", ")}`)
}

main()
