import test from "node:test"
import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises"

import { MANAGED_ROOT_LAYOUT } from "../../src/storage/root-layout"

const workspaceRoot = path.resolve(import.meta.dir, "../..")
const cliPath = path.join(workspaceRoot, "bin", "bn.ts")

async function assertManagedRootLayout(rootPath: string) {
  for (const relativePath of MANAGED_ROOT_LAYOUT) {
    const stats = await stat(path.join(rootPath, relativePath))
    assert.equal(stats.isDirectory(), true, `${relativePath} should be created by bn init`)
  }
}

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
    await assertManagedRootLayout(managedRoot)
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
    await assertManagedRootLayout(managedRoot)
  } finally {
    await rm(managedRoot, { recursive: true, force: true })
  }
})

test("bn init reports a user-facing error when BLUENOTE_ROOT points to a file", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "bluenote-cli-init-error-"))
  const blockedRoot = path.join(tempRoot, "blocked-root")

  try {
    await writeFile(blockedRoot, "not a directory")

    const result = Bun.spawnSync(["bun", "run", cliPath, "init"], {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        BLUENOTE_ROOT: blockedRoot,
      },
      stdout: "pipe",
      stderr: "pipe",
    })

    assert.equal(result.exitCode, 1)
    assert.equal(result.stdout.toString(), "")
    assert.match(result.stderr.toString(), /Could not initialize BlueNote root at/)
    assert.match(result.stderr.toString(), /Hint: Ensure BLUENOTE_ROOT points to a writable directory path\./)
    assert.doesNotMatch(result.stderr.toString(), /at runCli|Error:|stack/i)
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
})
