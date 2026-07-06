import { test } from "bun:test"
import assert from "node:assert/strict"

import termPackage from "../../packages/term/package.json"
import { runTuiCommand, type RunTuiCommandOptions } from "../../packages/term/src/command"
import { runInternalCommand } from "../../packages/term/src/internal-command"

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
    types: "./src/command.d.ts",
    import: "./dist/command.js",
  })
  assert.deepEqual(termPackage.exports["./command"], {
    types: "./src/command.d.ts",
    import: "./dist/command.js",
  })
  assert.equal(termPackage.bin["bluenote-term"], "./bin/bluenote-term.js")
  assert.equal(Object.hasOwn(termPackage.bin, "bn"), false)
  assert.equal(Object.hasOwn(termPackage.bin, "bluenote"), false)
})

test("bluenote-term command API entrypoint is importable from Node", () => {
  const script = `
    import { runTuiCommand } from "./packages/term/src/command.js";
    let stdout = "";
    const exitCode = await runTuiCommand(["--version"], {
      version: "node-loadable-test",
      io: { stdout: { write: (chunk) => { stdout += chunk; } }, stderr: { write: () => {} } },
    });
    if (exitCode !== 0 || stdout !== "node-loadable-test\\n") process.exit(1);
  `
  const result = Bun.spawnSync(["node", "--input-type=module", "--eval", script], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  })

  assert.equal(result.exitCode, 0, new TextDecoder().decode(result.stderr))
})

test("internal bin command rejects legacy note commands with migration guidance", async () => {
  const bufferedIO = createBufferedIO()

  const exitCode = await runInternalCommand(["new"], {
    io: bufferedIO.io,
  })

  assert.equal(exitCode, 1)
  assert.equal(bufferedIO.stdout, "")
  assert.equal(bufferedIO.stderr, "Use bluenote new; bluenote-term is TUI-only.\n")
})

test("internal bin probe uses the probe handler without launching the TUI", async () => {
  const bufferedIO = createBufferedIO()
  let tuiCalls = 0
  let probeCalls = 0

  const exitCode = await runInternalCommand(["--probe-tui-runtime"], {
    io: bufferedIO.io,
    tuiRunner: async () => {
      tuiCalls += 1
      return { exitCode: 1, stdout: "", stderr: "should not launch\n" }
    },
    probeTuiRuntime: async () => {
      probeCalls += 1
      return { exitCode: 0, stdout: "probe ok\n", stderr: "" }
    },
  })

  assert.equal(exitCode, 0)
  assert.equal(tuiCalls, 0)
  assert.equal(probeCalls, 1)
  assert.equal(bufferedIO.stdout, "probe ok\n")
  assert.equal(bufferedIO.stderr, "")
})

test("public command typings advertise only the TUI command API", async () => {
  const typings = await Bun.file("packages/term/src/command.d.ts").text()

  assert.match(typings, /runTuiCommand/)
  assert.doesNotMatch(typings, /runCommand/)
  assert.doesNotMatch(typings, /cliRunner/)
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

test("runTuiCommand prints help without launching the full-screen TUI", async () => {
  const bufferedIO = createBufferedIO()
  let calls = 0

  const exitCode = await runTuiCommand(["--help"], {
    io: bufferedIO.io,
    tuiRunner: async () => {
      calls += 1
      return { exitCode: 1, stdout: "", stderr: "" }
    },
  })

  assert.equal(calls, 0)
  assert.equal(exitCode, 0)
  assert.match(bufferedIO.stdout, /Usage: bluenote-term \[options\]/)
  assert.match(bufferedIO.stdout, /--check-daemon/)
  for (const command of ["new", "list", "archive", "delete", "rebuild", "ai"]) {
    assert.doesNotMatch(bufferedIO.stdout, new RegExp(`(^|\\n)\\s*${command}(\\s|$)`, "m"))
  }
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

test("bluenote-term command API entrypoint is importable from Node for TUI help", () => {
  const buildResult = Bun.spawnSync(["bun", "run", "./scripts/build-package-runtime.ts"], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  })
  assert.equal(buildResult.exitCode, 0, new TextDecoder().decode(buildResult.stderr))

  const script = `
    import { runTuiCommand } from "./packages/term/dist/command.js";
    let stdout = "";
    let stderr = "";
    const exitCode = await runTuiCommand(["--help"], {
      io: {
        stdout: { write: (chunk) => { stdout += chunk; } },
        stderr: { write: (chunk) => { stderr += chunk; } },
      },
    });
    if (exitCode !== 0) process.exit(1);
    if (!stdout.includes("Usage: bluenote-term [options]")) process.exit(1);
    if (stderr !== "") process.exit(1);
  `
  const result = Bun.spawnSync(["node", "--input-type=module", "--eval", script], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  })

  assert.equal(result.exitCode, 0, new TextDecoder().decode(result.stderr))
})

test("bluenote-term command API entrypoint reports a Bun requirement instead of crashing under Node", () => {
  const script = `
    import { runTuiCommand } from "./packages/term/src/command.js";
    let stdout = "";
    let stderr = "";
    const exitCode = await runTuiCommand([], {
      io: {
        stdout: { write: (chunk) => { stdout += chunk; } },
        stderr: { write: (chunk) => { stderr += chunk; } },
      },
    });
    if (exitCode !== 1) process.exit(1);
    if (stdout !== "") process.exit(1);
    if (!stderr.includes("requires Bun")) process.exit(1);
  `
  const result = Bun.spawnSync(["node", "--input-type=module", "--eval", script], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  })

  assert.equal(result.exitCode, 0, new TextDecoder().decode(result.stderr))
})

test("published bluenote-term bin reports actionable packaged-runtime guidance instead of a Bun requirement", () => {
  const buildResult = Bun.spawnSync(["bun", "run", "./scripts/build-package-runtime.ts"], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  })

  assert.equal(buildResult.exitCode, 0, new TextDecoder().decode(buildResult.stderr))

  const result = Bun.spawnSync(["npx", "-y", "node@24", "./packages/term/bin/bluenote-term.js", "--probe-tui-runtime"], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  })

  const stderr = new TextDecoder().decode(result.stderr)
  assert.equal(result.exitCode, 1)
  assert.equal(new TextDecoder().decode(result.stdout), "")
  assert.match(stderr, /cannot launch the full TUI on plain Node\.js/i)
  assert.doesNotMatch(stderr, /requires Bun/i)
}, 30_000)

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

test("internal bin command preserves the existing bin tui subcommand path", async () => {
  const bufferedIO = createBufferedIO()
  let calls = 0

  const exitCode = await runInternalCommand(["tui"], {
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
