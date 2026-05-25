import { test } from "bun:test"
import assert from "node:assert/strict"

import {
  COMMAND_NAMES,
  FLAG_NAMES,
  generateCompletionScript,
  listCompletionSelectorCandidates,
} from "../../../src/cli/completion"

test("generateCompletionScript returns shell-specific hooks", () => {
  const bash = generateCompletionScript("bash")
  const zsh = generateCompletionScript("zsh")
  const fish = generateCompletionScript("fish")

  assert.match(bash, /complete -F _bn bn/)
  assert.match(zsh, /#compdef bn bluenote/)
  assert.match(fish, /complete -c bn/)
})

test("generated completion scripts mention all commands and selector-related flags", () => {
  assert.ok(COMMAND_NAMES.includes("migrate"))
  assert.ok(COMMAND_NAMES.includes("tui"))

  for (const shell of ["bash", "zsh", "fish"] as const) {
    const script = generateCompletionScript(shell)

    for (const command of COMMAND_NAMES) {
      assert.match(script, new RegExp(`\\b${command}\\b`))
    }

    for (const flag of FLAG_NAMES) {
      if (shell === "fish") {
        assert.match(script, new RegExp(`-l ${flag.slice(2)}`))
        continue
      }

      assert.match(script, new RegExp(flag.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")))
    }
  }
})

test("listCompletionSelectorCandidates filters by prefix and sorts keys", () => {
  assert.deepEqual(
    listCompletionSelectorCandidates(
      [
        { key: "mission-log-51u7i0" },
        { key: "alpha-note-111111" },
        { key: "mission-brief-u0llog" },
      ],
      "mission-",
    ),
    ["mission-brief-u0llog", "mission-log-51u7i0"],
  )
})

test("listCompletionSelectorCandidates de-duplicates keys and ignores blank partials", () => {
  assert.deepEqual(
    listCompletionSelectorCandidates(
      [
        { key: "mission-log-51u7i0" },
        { key: "mission-log-51u7i0" },
        { key: "alpha-note-111111" },
      ],
      "   ",
    ),
    ["alpha-note-111111", "mission-log-51u7i0"],
  )
})
