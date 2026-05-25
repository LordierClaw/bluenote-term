import { test } from "bun:test"
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import path from "node:path"

import { createManagedRootHarness } from "../helpers/cli"

const workspaceRoot = path.resolve(import.meta.dir, "../..")

async function waitForOutput(
  getOutput: () => string,
  predicate: (output: string) => boolean,
  timeoutMs = 3_000,
): Promise<void> {
  const startedAt = Date.now()

  while (!predicate(getOutput())) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Timed out waiting for output. Current output:\n${getOutput()}`)
    }

    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

test("bn tui keeps a live shell session running until quit while still showing missing-root guidance", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-tui-missing-root-")
  let child: ReturnType<typeof spawn> | null = null

  try {
    child = spawn("script", ["-qfec", "bun run ./bin/bn.ts tui", "/dev/null"], {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        BLUENOTE_ROOT: harness.rootPath,
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
      (output) => /=== SIDEBAR ===/u.test(output) && /BlueNote root missing/u.test(output),
    )

    assert.equal(child.exitCode, null)

    child.stdin!.write("q")

    const [exitCode, signal] = await once(child, "exit")

    assert.equal(exitCode, 0)
    assert.equal(signal, null)
    assert.equal(stderr, "")
    assert.match(stdout, /=== SIDEBAR ===/u)
    assert.match(stdout, /=== MAIN ===/u)
    assert.match(stdout, /=== STATUS ===/u)
    assert.match(stdout, /BlueNote root missing/u)
    assert.match(stdout, /BlueNote root is not initialized\./u)
    assert.match(stdout, /Run 'bn init' first\./u)
    assert.doesNotMatch(stdout, /Unknown command: tui|TypeError|ReferenceError/u)
  } finally {
    if (child !== null && child.exitCode === null) {
      child.kill("SIGTERM")
      await once(child, "exit")
    }

    await harness.cleanup()
  }
})