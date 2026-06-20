import { test } from "bun:test"
import assert from "node:assert/strict"

import { escapeRegExp } from "../helpers/regexp"

test("escapeRegExp escapes backslashes and regex metacharacters", () => {
  const literal = String.raw`0.4.7\\portable?(beta)+`
  const matcher = new RegExp(`^${escapeRegExp(literal)}$`)

  assert.match(literal, matcher)
  assert.doesNotMatch(`${literal}!`, matcher)
})