import test from "node:test"
import assert from "node:assert/strict"

import {
  createNoteKey,
  createShortNoteSuffix,
  slugifyNoteTitle,
} from "../../../src/domain/note-key"

test("slugifyNoteTitle normalizes titles into lowercase dash-separated slugs", () => {
  assert.equal(slugifyNoteTitle("  Hello, BlueNote CLI!  "), "hello-bluenote-cli")
  assert.equal(slugifyNoteTitle("Roadmap: Phase 2 / Storage & UX"), "roadmap-phase-2-storage-ux")
})

test("createShortNoteSuffix formats injected random bytes as a short lowercase base36 token", () => {
  const suffix = createShortNoteSuffix({
    length: 6,
    randomSource: () => 0x12345678,
  })

  assert.equal(suffix, "51u7i0")
  assert.match(suffix, /^[a-z0-9]{6}$/)
})

test("createNoteKey appends a short suffix to the normalized slug", () => {
  const key = createNoteKey("Ship It", {
    suffixLength: 6,
    randomSource: () => 0x12345678,
  })

  assert.equal(key, "ship-it-51u7i0")
})

test("createNoteKey retries collisions until a unique candidate is available", () => {
  const emitted: string[] = []
  const draws = [0x12345678, 0x76543210]

  const key = createNoteKey("Collision Course", {
    suffixLength: 6,
    randomSource: () => draws.shift() ?? 0,
    isUnique: (candidate: string) => {
      emitted.push(candidate)
      return candidate.endsWith("wtycr4")
    },
    onCollision: (candidate: string) => {
      emitted.push(`collision:${candidate}`)
    },
  })

  assert.equal(key, "collision-course-wtycr4")
  assert.deepEqual(emitted, [
    "collision-course-51u7i0",
    "collision:collision-course-51u7i0",
    "collision-course-wtycr4",
  ])
})
