#!/usr/bin/env bun
import pkg from "../../package.json"
import { runCliAsync, type CliRuntimeOptions } from "../../src/cli/entry"

function readTestClock() {
  const value = process.env.BLUENOTE_TEST_NOW

  if (!value) {
    return undefined
  }

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid BLUENOTE_TEST_NOW value: ${value}`)
  }

  return {
    now() {
      return new Date(parsed)
    },
  }
}

function readTestRandomSource(): (() => number) | undefined {
  const sequence = process.env.BLUENOTE_TEST_RANDOM_SEQUENCE

  if (!sequence) {
    return undefined
  }

  const draws = sequence
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .map((value) => {
      const parsed = Number(value)

      if (!Number.isFinite(parsed)) {
        throw new Error(`Invalid BLUENOTE_TEST_RANDOM_SEQUENCE value: ${value}`)
      }

      return parsed
    })

  return () => draws.shift() ?? 0
}

function readRebuildIndexesTestHooks(): CliRuntimeOptions["rebuildIndexesOptions"] | undefined {
  if (process.env.BLUENOTE_TEST_REBUILD_FAIL_SIDECAR_SCAN !== "1") {
    return undefined
  }

  return {
    testHooks: {
      listSidecarKeys() {
        throw new Error("")
      },
    },
  }
}

const clock = readTestClock()
const randomSource = readTestRandomSource()
const rebuildIndexesOptions = readRebuildIndexesTestHooks()
const args = process.argv.slice(2)
const result = await runCliAsync(args, pkg.version, {
  createNoteOptions: {
    ...(clock ? { clock } : {}),
    ...(randomSource ? { randomSource } : {}),
  },
  ...(rebuildIndexesOptions ? { rebuildIndexesOptions } : {}),
})

if (result.stdout) {
  process.stdout.write(result.stdout)
}

if (result.stderr) {
  process.stderr.write(result.stderr)
}

process.exit(result.exitCode)
