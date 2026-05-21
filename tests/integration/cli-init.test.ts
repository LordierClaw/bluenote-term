import test from "node:test"
import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import { mkdtemp, rm } from "node:fs/promises"

const workspaceRoot = path.resolve(import.meta.dir, "../..")
const cliPath = path.join(workspaceRoot, "bin", "bn.ts")

test("bn init exits 0 and reports the initialized root", async () => {
  const managedRoot = await mkdtemp(path.join(os.tmpdir(), "bluenote-cli-init-"))

  try {
    const result = Bun.spawnSync(["bun", "run", cliPath, "init"], {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        BLUENOTE_ROOT: managedRoot,
      },
      stdout: "pipe",
      stderr: "pipe",
    })

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr.toString(), "")
    assert.match(result.stdout.toString(), new RegExp(`Initialized BlueNote root: ${managedRoot.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}`))
  } finally {
    await rm(managedRoot, { recursive: true, force: true })
  }
})

test("bn init is idempotent on subsequent runs", async () => {
  const managedRoot = await mkdtemp(path.join(os.tmpdir(), "bluenote-cli-init-idempotent-"))

  try {
    const firstResult = Bun.spawnSync(["bun", "run", cliPath, "init"], {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        BLUENOTE_ROOT: managedRoot,
      },
      stdout: "pipe",
      stderr: "pipe",
    })
    const secondResult = Bun.spawnSync(["bun", "run", cliPath, "init"], {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        BLUENOTE_ROOT: managedRoot,
      },
      stdout: "pipe",
      stderr: "pipe",
    })

    assert.equal(firstResult.exitCode, 0)
    assert.equal(secondResult.exitCode, 0)
    assert.equal(secondResult.stderr.toString(), "")
    assert.match(secondResult.stdout.toString(), new RegExp(`Initialized BlueNote root: ${managedRoot.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}`))
  } finally {
    await rm(managedRoot, { recursive: true, force: true })
  }
})
