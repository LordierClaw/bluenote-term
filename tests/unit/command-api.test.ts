import { test } from "bun:test"
import assert from "node:assert/strict"

import termPackage from "../../packages/term/package.json"
import { runCommand, runTuiCommand, type RunTuiCommandOptions } from "../../packages/term/src/command"

function createBufferedIO(): { stdout: string; stderr: string; io: NonNullable<RunTuiCommandOptions["io"]> } {
  const buffer = { stdout: "", stderr: "" }

  return {
    ...buffer,
    io: {
      stdout: { write: (chunk: string) => { buffer.stdout += chunk } },
      stderr: { write: (chunk: string) => { buffer.stderr += chunk } },
    },
    get stdout() {
      return buffer.stdout
    },
    get stderr() {
      return buffer.stderr
    },
  }
}

test("bluenote-term package metadata exposes the reusable command API", () => {
  assert.deepEqual(termPackage.exports["."], {
    types: "./src/command.ts",
    import: "./src/command.ts",
  })
  assert.deepEqual(termPackage.exports["./command"], {
    types: "./src/command.ts",
    import: "./src/command.ts",
  })
  assert.equal(termPackage.bin["bluenote-term"], "./bin/bluenote-term.ts")
  assert.equal(Object.hasOwn(termPackage.bin, "bn"), false)
  assert.equal(Object.hasOwn(termPackage.bin, "bluenote"), false)
})

test("runCommand exposes the full reusable terminal command API", async () => {
  const bufferedIO = createBufferedIO()

  const exitCode = await runCommand(["--version"], {
    io: bufferedIO.io,
    version: "9.8.7-test",
  })

  assert.equal(exitCode, 0)
  assert.equal(bufferedIO.stdout, "9.8.7-test\n")
  assert.equal(bufferedIO.stderr, "")
})

test("runTuiCommand prints version without launching the full-screen TUI", async () => {
  const bufferedIO = createBufferedIO()
  let calls = 0

  const exitCode = await runTuiCommand(["--version"], {
    io: bufferedIO.io,
    version: "1.2.3-test",
    tuiRunner: async () => {
      calls += 1
      return { exitCode: 1, stdout: "", stderr: "" }
    },
  })

  assert.equal(calls, 0)
  assert.equal(exitCode, 0)
  assert.equal(bufferedIO.stdout, "1.2.3-test\n")
  assert.equal(bufferedIO.stderr, "")
})

test("runTuiCommand launches the TUI provider for distribution callers", async () => {
  const bufferedIO = createBufferedIO()
  let calls = 0

  const exitCode = await runTuiCommand([], {
    io: bufferedIO.io,
    tuiRunner: async () => {
      calls += 1

      return {
        exitCode: 1,
        stdout: "tui stdout\n",
        stderr: "tui stderr\n",
      }
    },
  })

  assert.equal(calls, 1)
  assert.equal(exitCode, 1)
  assert.equal(bufferedIO.stdout, "tui stdout\n")
  assert.equal(bufferedIO.stderr, "tui stderr\n")
})

test("runTuiCommand accepts daemon flags and checks the endpoint before launching the TUI provider", async () => {
  const requests: string[] = []
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url)
      requests.push(url.pathname)

      if (url.pathname === "/health" || url.pathname === "/capabilities") {
        return Response.json({ ok: true })
      }

      return new Response("not found", { status: 404 })
    },
  })

  try {
    const bufferedIO = createBufferedIO()
    let calls = 0

    const exitCode = await runTuiCommand(["--daemon-url", `http://127.0.0.1:${server.port}`, "--daemon-token", "secret-token"], {
      io: bufferedIO.io,
      tuiRunner: async () => {
        calls += 1

        return {
          exitCode: 0,
          stdout: "daemon args accepted\n",
          stderr: "",
        }
      },
    })

    assert.equal(calls, 1)
    assert.deepEqual(requests, ["/health", "/capabilities"])
    assert.equal(exitCode, 0)
    assert.equal(bufferedIO.stdout, "daemon args accepted\n")
    assert.equal(bufferedIO.stderr, "")
  } finally {
    server.stop(true)
  }
})

test("runTuiCommand checks a daemon endpoint without launching the full-screen TUI", async () => {
  const requests: Array<{ pathname: string; authorization: string | null }> = []
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url)
      requests.push({ pathname: url.pathname, authorization: request.headers.get("authorization") })

      if (url.pathname === "/health") {
        return Response.json({ ok: true, name: "bluenote-daemon", version: "0.0.0-test" })
      }

      if (url.pathname === "/capabilities") {
        return Response.json({ ok: true, capabilities: ["term-smoke"] })
      }

      return new Response("not found", { status: 404 })
    },
  })

  try {
    const bufferedIO = createBufferedIO()
    let calls = 0

    const exitCode = await runTuiCommand([
      "--check-daemon",
      "--daemon-url",
      `http://127.0.0.1:${server.port}`,
      "--daemon-token",
      "secret-token",
    ], {
      io: bufferedIO.io,
      tuiRunner: async () => {
        calls += 1

        return {
          exitCode: 1,
          stdout: "should not launch\n",
          stderr: "",
        }
      },
    })

    assert.equal(calls, 0)
    assert.equal(exitCode, 0)
    assert.match(bufferedIO.stdout, /BlueNote daemon check passed/)
    assert.equal(bufferedIO.stderr, "")
    assert.deepEqual(requests.map((request) => request.pathname), ["/health", "/capabilities"])
    assert.deepEqual(requests.map((request) => request.authorization), ["Bearer secret-token", "Bearer secret-token"])
  } finally {
    server.stop(true)
  }
})

test("runTuiCommand can read daemon check connection details from the environment", async () => {
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url)

      if (url.pathname === "/health" || url.pathname === "/capabilities") {
        return Response.json({ ok: true })
      }

      return new Response("not found", { status: 404 })
    },
  })

  try {
    const bufferedIO = createBufferedIO()
    const exitCode = await runTuiCommand(["--check-daemon"], {
      env: {
        BLUENOTE_DAEMON_URL: `http://127.0.0.1:${server.port}`,
        BLUENOTE_DAEMON_TOKEN: "env-secret-token",
      },
      io: bufferedIO.io,
    })

    assert.equal(exitCode, 0)
    assert.match(bufferedIO.stdout, /BlueNote daemon check passed/)
    assert.equal(bufferedIO.stderr, "")
  } finally {
    server.stop(true)
  }
})

test("runTuiCommand ignores a token-only environment for normal launches", async () => {
  const bufferedIO = createBufferedIO()
  let calls = 0

  const exitCode = await runTuiCommand([], {
    env: {
      BLUENOTE_DAEMON_TOKEN: "partial-env-token",
    },
    io: bufferedIO.io,
    tuiRunner: async () => {
      calls += 1
      return { exitCode: 0, stdout: "launched\n", stderr: "" }
    },
  })

  assert.equal(calls, 1)
  assert.equal(exitCode, 0)
  assert.equal(bufferedIO.stdout, "launched\n")
  assert.equal(bufferedIO.stderr, "")
})

test("runTuiCommand reports daemon check failures without printing the token", async () => {
  const bufferedIO = createBufferedIO()
  let calls = 0

  const exitCode = await runTuiCommand(["--check-daemon", "--daemon-url", "http://127.0.0.1:1", "--daemon-token", "secret-token"], {
    io: bufferedIO.io,
    tuiRunner: async () => {
      calls += 1

      return {
        exitCode: 1,
        stdout: "should not launch\n",
        stderr: "",
      }
    },
  })

  assert.equal(calls, 0)
  assert.equal(exitCode, 1)
  assert.equal(bufferedIO.stdout, "")
  assert.match(bufferedIO.stderr, /BlueNote daemon check failed/)
  assert.doesNotMatch(bufferedIO.stderr, /secret-token/)
})

test("runCommand preserves the existing bin tui subcommand path", async () => {
  const bufferedIO = createBufferedIO()
  let calls = 0

  const exitCode = await runCommand(["tui"], {
    io: bufferedIO.io,
    tuiRunner: async () => {
      calls += 1

      return {
        exitCode: 0,
        stdout: "bin tui stdout\n",
        stderr: "",
      }
    },
  })

  assert.equal(calls, 1)
  assert.equal(exitCode, 0)
  assert.equal(bufferedIO.stdout, "bin tui stdout\n")
  assert.equal(bufferedIO.stderr, "")
})
