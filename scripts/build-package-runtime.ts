import { spawnSync } from "node:child_process"
import { existsSync, rmSync } from "node:fs"
import path from "node:path"

const repoRoot = path.resolve(import.meta.dir, "..")
const packageRoot = path.join(repoRoot, "packages", "term")
const distRoot = path.join(packageRoot, "dist")
const commandEntrypoint = path.join(packageRoot, "src", "command.ts")
const builtCommandEntrypoint = path.join(distRoot, "command.js")
const publicBin = path.join(packageRoot, "bin", "bluenote-term.js")
const packageJsonPath = path.join(packageRoot, "package.json")

function run(command: string, args: string[], cwd = repoRoot): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    const stderr = result.stderr?.trim() ? `\n${result.stderr.trim()}` : ""
    const stdout = result.stdout?.trim() ? `\n${result.stdout.trim()}` : ""
    throw new Error(`Command failed (${command} ${args.join(" ")}): exit ${result.status}${stdout}${stderr}`)
  }

  return `${result.stdout ?? ""}${result.stderr ?? ""}`
}

function main(): void {
  rmSync(distRoot, { recursive: true, force: true })

  run("bun", [
    "build",
    commandEntrypoint,
    "--target=node",
    "--format=esm",
    "--splitting",
    "--outdir",
    distRoot,
  ])

  if (!existsSync(builtCommandEntrypoint)) {
    throw new Error(`Missing built command entrypoint: ${builtCommandEntrypoint}`)
  }

  const versionOutput = run("node", [publicBin, "--version"], repoRoot).trim()
  const packageVersion = run("node", ["--input-type=module", "--eval", `import pkg from ${JSON.stringify(packageJsonPath)} with { type: "json" }; console.log(pkg.version);`], repoRoot).trim()

  if (versionOutput !== packageVersion) {
    throw new Error(`Built terminal runtime version mismatch: expected ${packageVersion}, got ${versionOutput}`)
  }
}

main()
