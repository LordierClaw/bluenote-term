import { test } from "bun:test"
import assert from "node:assert/strict"
import path from "node:path"
import { rm } from "node:fs/promises"

import { createManagedRootHarness, runCli } from "../helpers/cli"

function extractCreatedKey(stdout: string): string {
  const match = stdout.match(/^Key: (.+)$/m)

  assert.ok(match)
  return match[1]
}

for (const shell of ["bash", "zsh", "fish"] as const) {
  test(`bn completion ${shell} prints a ${shell} completion script with commands and flags`, () => {
    const result = runCli(["completion", shell])

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.match(result.stdout, /\bcompletion\b/)
    assert.match(result.stdout, /\bnew\b/)
    assert.match(result.stdout, /\blist\b/)
    assert.match(result.stdout, /\bshow\b/)
    if (shell === "fish") {
      assert.match(result.stdout, /-l title/)
      assert.match(result.stdout, /-l force/)
    } else {
      assert.match(result.stdout, /--title/)
      assert.match(result.stdout, /--force/)
    }

    if (shell === "bash") {
      assert.match(result.stdout, /complete -F _bn bn/)
      assert.match(result.stdout, /complete -F _bn bluenote/)
    }

    if (shell === "zsh") {
      assert.match(result.stdout, /#compdef bn bluenote/)
      assert.match(result.stdout, /compdef _bn bn bluenote/)
    }

    if (shell === "fish") {
      assert.match(result.stdout, /complete -c bn/)
      assert.match(result.stdout, /complete -c bluenote/)
    }
  })
}

test("bn complete selectors prints one candidate key per line", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-completion-selectors-")

  try {
    const first = harness.run(["new", "--title", "Mission Log"], {
      BLUENOTE_TEST_NOW: "2026-05-24T12:00:00.000Z",
      BLUENOTE_TEST_RANDOM_SEQUENCE: "0x12345678",
    })
    const second = harness.run(["new", "--title", "Mission Brief"], {
      BLUENOTE_TEST_NOW: "2026-05-24T12:01:00.000Z",
      BLUENOTE_TEST_RANDOM_SEQUENCE: "0x76543210",
    })

    assert.equal(first.exitCode, 0)
    assert.equal(second.exitCode, 0)

    const result = harness.run(["complete", "selectors", "show", "mission-"])

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.equal(
      result.stdout,
      `${[extractCreatedKey(second.stdout), extractCreatedKey(first.stdout)].sort().join("\n")}\n`,
    )
  } finally {
    await harness.cleanup()
  }
})

test("bn complete selectors includes archived keys for show and delete only", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-completion-archived-")

  try {
    const created = harness.run(["new", "--title", "Archived Mission"], {
      BLUENOTE_TEST_NOW: "2026-05-24T12:00:00.000Z",
      BLUENOTE_TEST_RANDOM_SEQUENCE: "0x12345678",
    })
    assert.equal(created.exitCode, 0)

    const key = extractCreatedKey(created.stdout)
    const archived = harness.run(["archive", key])
    assert.equal(archived.exitCode, 0)

    const showResult = harness.run(["complete", "selectors", "show", key.slice(0, 12)])
    assert.equal(showResult.exitCode, 0)
    assert.equal(showResult.stderr, "")
    assert.equal(showResult.stdout, `${key}\n`)

    const deleteResult = harness.run(["complete", "selectors", "delete", key.slice(0, 12)])
    assert.equal(deleteResult.exitCode, 0)
    assert.equal(deleteResult.stderr, "")
    assert.equal(deleteResult.stdout, `${key}\n`)

    const editResult = harness.run(["complete", "selectors", "edit", key.slice(0, 12)])
    assert.equal(editResult.exitCode, 0)
    assert.equal(editResult.stderr, "")
    assert.equal(editResult.stdout, "")
  } finally {
    await harness.cleanup()
  }
})

test("bn complete selectors stays quiet when the root or indexes are missing", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-completion-quiet-")

  try {
    const missingRootResult = runCli(["complete", "selectors", "show", "mission-"])
    assert.equal(missingRootResult.exitCode, 0)
    assert.equal(missingRootResult.stdout, "")
    assert.equal(missingRootResult.stderr, "")

    const created = harness.run(["new", "--title", "Mission Log"], {
      BLUENOTE_TEST_NOW: "2026-05-24T12:00:00.000Z",
      BLUENOTE_TEST_RANDOM_SEQUENCE: "0x12345678",
    })
    assert.equal(created.exitCode, 0)

    await rm(path.join(harness.rootPath, ".state", "metadata.sqlite"), { force: true })
    await rm(path.join(harness.rootPath, ".state", "search-index.json"), { force: true })

    const missingIndexesResult = harness.run(["complete", "selectors", "show", "mission-"])
    assert.equal(missingIndexesResult.exitCode, 0)
    assert.equal(missingIndexesResult.stdout, "")
    assert.equal(missingIndexesResult.stderr, "")
  } finally {
    await harness.cleanup()
  }
})
