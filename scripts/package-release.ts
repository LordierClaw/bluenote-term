import { spawnSync } from "node:child_process"
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"

const releaseRoot = path.resolve("dist", "release")
const workRoot = path.join(releaseRoot, "work")
const verifyRoot = path.join(releaseRoot, "verify")
const packageRoot = path.join(workRoot, "bluenote")

interface PlatformRelease {
  platformId: "windows-x64" | "linux-x64"
  executableName: "bn.exe" | "bn"
  archiveName: "bluenote-windows-x64.zip" | "bluenote-linux-x64.tar.gz"
}

function getPlatformRelease(): PlatformRelease {
  const { platform, arch } = process

  if (platform === "win32" && arch === "x64") {
    return {
      platformId: "windows-x64",
      executableName: "bn.exe",
      archiveName: "bluenote-windows-x64.zip",
    }
  }

  if (platform === "linux" && arch === "x64") {
    return {
      platformId: "linux-x64",
      executableName: "bn",
      archiveName: "bluenote-linux-x64.tar.gz",
    }
  }

  throw new Error(`Unsupported release platform: ${platform}/${arch}. Supported platforms: win32/x64, linux/x64.`)
}

function run(command: string, args: string[], options: { capture?: boolean } = {}): string {
  console.log(`$ ${[command, ...args].join(" ")}`)
  const result = spawnSync(command, args, {
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

Notes are local files. No network install is required after extraction.
`,
    "utf8",
  )
}

function powershellSingleQuoted(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

function archivePackage(release: PlatformRelease): void {
  const archivePath = path.join(releaseRoot, release.archiveName)

  if (process.platform === "win32") {
    run("powershell", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `Compress-Archive -LiteralPath ${powershellSingleQuoted(packageRoot)} -DestinationPath ${powershellSingleQuoted(archivePath)} -Force`,
    ])
    return
  }

  run("tar", ["-czf", archivePath, "-C", workRoot, "bluenote"])
}

function validateArchive(release: PlatformRelease): void {
  const archivePath = path.join(releaseRoot, release.archiveName)
  const extractedRoot = path.join(verifyRoot, release.platformId)
  const extractedPackageRoot = path.join(extractedRoot, "bluenote")
  const extractedExecutable = path.join(extractedPackageRoot, release.executableName)
  const extractedReadme = path.join(extractedPackageRoot, "README.txt")

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

  const helpOutput = run(extractedExecutable, ["--help"], { capture: true })
  if (!helpOutput.includes("BlueNote v")) {
    throw new Error("Release archive validation failed: extracted executable --help output did not contain 'BlueNote v'.")
  }
}

function main(): void {
  const release = getPlatformRelease()
  const executablePath = path.join(packageRoot, release.executableName)
  const archivePath = path.join(releaseRoot, release.archiveName)

  console.log(`Packaging BlueNote for ${release.platformId}`)

  rmSync(workRoot, { recursive: true, force: true })
  mkdirSync(packageRoot, { recursive: true })

  run("bun", ["build", "./bin/bn.ts", "--compile", "--outfile", executablePath])

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

  if (!existsSync(archivePath)) {
    throw new Error(`Release archive was not created: ${archivePath}`)
  }

  validateArchive(release)

  console.log(`Created ${archivePath}`)
}

main()
