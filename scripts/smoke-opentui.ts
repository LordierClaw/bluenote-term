import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import os from "node:os"
import path from "node:path"
import { mkdtemp, rm } from "node:fs/promises"

const workspaceRoot = path.resolve(import.meta.dir, "..")

async function waitForOutput(
  getOutput: () => string,
  predicate: (output: string) => boolean,
  timeoutMs = 3_000,
): Promise<void> {
  const startedAt = Date.now()

  while (!predicate(getOutput())) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Timed out waiting for interactive TUI output. Current output:\n${getOutput()}`)
    }

    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

const moduleRef = await import("@opentui/core")

if (typeof moduleRef.createCliRenderer !== "function") {
  throw new Error("@opentui/core did not expose createCliRenderer")
}

const providedRoot = process.env.BLUENOTE_ROOT
const managedRoot = providedRoot ?? (await mkdtemp(path.join(os.tmpdir(), "bluenote-smoke-opentui-")))
const shouldCleanup = providedRoot === undefined
let child: ReturnType<typeof spawn> | null = null

try {
  if (providedRoot === undefined) {
    const initResult = Bun.spawnSync(["bun", "run", path.join(workspaceRoot, "bin", "bn.ts"), "init"], {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        BLUENOTE_ROOT: managedRoot,
      },
      stdout: "pipe",
      stderr: "pipe",
    })

    assert.equal(initResult.exitCode, 0)
    assert.equal(initResult.stderr.toString(), "")
  }

  child = spawn("script", ["-qfec", `bun run ${path.join(workspaceRoot, "bin", "bn.ts")} tui`, "/dev/null"], {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      BLUENOTE_ROOT: managedRoot,
      BLUENOTE_TUI_TEST_EMIT_FRAME: "1",
      BLUENOTE_TUI_TEST_SCREEN_MODE: "main-screen",
    },
    stdio: ["pipe", "pipe", "pipe"],
  })

  assert.ok(child.stdout)
  assert.ok(child.stderr)
  assert.ok(child.stdin)

  let stdout = ""
  let stderr = ""

  child.stdout!.setEncoding("utf8")
  child.stderr!.setEncoding("utf8")
  child.stdout!.on("data", (chunk) => {
    stdout += chunk
  })
  child.stderr!.on("data", (chunk) => {
    stderr += chunk
  })

  await waitForOutput(
    () => stdout,
    (output) => /=== SIDEBAR ===/u.test(output) && /=== MAIN ===/u.test(output) && /=== STATUS ===/u.test(output),
  )

  if (child.exitCode !== null) {
    throw new Error(`bn tui exited before smoke validation completed with exit code ${child.exitCode}`)
  }

  child.stdin!.write("q")

  const [exitCode, signal] = await once(child, "exit")

  if (exitCode !== 0 || signal !== null) {
    throw new Error(`bn tui failed during smoke check: ${stderr || `exit ${exitCode} signal ${signal}`}`)
  }

  if (stderr.trim().length > 0) {
    throw new Error(`bn tui emitted unexpected stderr during smoke check: ${stderr}`)
  }

  const frame = stdout
  const renderedShellRegions = /=== SIDEBAR ===/u.test(frame) && /=== MAIN ===/u.test(frame) && /=== STATUS ===/u.test(frame)

  if (!renderedShellRegions) {
    throw new Error("bn tui did not render the expected shell regions during smoke check")
  }

  if (/BlueNote root missing/u.test(frame)) {
    if (!/Run 'bn init' first\./u.test(frame)) {
      throw new Error("missing-root shell startup did not include the init guidance")
    }

    console.log("OpenTUI smoke check passed for BlueNote (live missing-root shell startup validated).")
  } else {
    if (!/MODE:/u.test(frame)) {
      throw new Error("ready shell startup did not render the expected status bar summary")
    }

    console.log("OpenTUI smoke check passed for BlueNote (live ready shell startup validated).")
  }
} finally {
  if (child !== null && child.exitCode === null) {
    child.kill("SIGTERM")
    await once(child, "exit")
  }

  if (shouldCleanup) {
    await rm(managedRoot, { recursive: true, force: true })
  }
}
