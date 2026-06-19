import { readFileSync } from "node:fs"

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))

function formatTuiHelp() {
  return [
    "Usage: bluenote tui [options]",
    "",
    "Launch the BlueNote terminal UI workspace.",
    "",
    "Options:",
    "  --daemon-url <url>     BlueNote daemon URL (default: BLUENOTE_DAEMON_URL)",
    "  --daemon-token <token> BlueNote daemon token (default: BLUENOTE_DAEMON_TOKEN)",
    "  --check-daemon         Check daemon health/capabilities without launching the TUI",
    "  --help, -h             Show this help",
    "  --version, -v          Show the version",
  ].join("\n") + "\n"
}

function bunRequiredResult(surface) {
  return {
    exitCode: 1,
    stdout: "",
    stderr: `The default bluenote-term ${surface} runner requires Bun. Pass ${surface === "CLI" ? "cliRunner" : "tuiRunner"} when using run${surface === "CLI" ? "Command" : "TuiCommand"} from Node.\n`,
  }
}

async function runDefaultCli(args, version) {
  if (!("Bun" in globalThis)) {
    return bunRequiredResult("CLI")
  }

  const module = await import("./cli/entry.ts")
  return module.runCliAsync(args, version)
}

async function runDefaultTui() {
  if (!("Bun" in globalThis)) {
    return bunRequiredResult("TUI")
  }

  const module = await import("./tui/app.ts")
  return module.runTuiCliInteractive()
}

function writeCliResult(result, io) {
  if (result.stdout) {
    io.stdout.write(result.stdout)
  }

  if (result.stderr) {
    io.stderr.write(result.stderr)
  }
}

async function runAndWrite(resultPromise, io) {
  const result = await resultPromise
  writeCliResult(result, io)
  return result.exitCode
}

function readDaemonCommandOptions(args, env) {
  let checkDaemon = false
  let daemonUrl = env.BLUENOTE_DAEMON_URL
  let daemonToken = env.BLUENOTE_DAEMON_TOKEN

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if (arg === "--check-daemon") {
      checkDaemon = true
      continue
    }

    if (arg === "--daemon-url") {
      daemonUrl = args[index + 1] ?? daemonUrl
      index += 1
      continue
    }

    if (arg.startsWith("--daemon-url=")) {
      daemonUrl = arg.slice("--daemon-url=".length)
      continue
    }

    if (arg === "--daemon-token") {
      daemonToken = args[index + 1] ?? daemonToken
      index += 1
      continue
    }

    if (arg.startsWith("--daemon-token=")) {
      daemonToken = arg.slice("--daemon-token=".length)
    }
  }

  return { checkDaemon, daemonUrl, daemonToken }
}

function daemonEndpoint(baseUrl, pathname) {
  const url = new URL(baseUrl)
  url.pathname = pathname
  url.search = ""
  url.hash = ""
  return url.toString()
}

async function fetchDaemonEndpoint(baseUrl, pathname, token) {
  const response = await fetch(daemonEndpoint(baseUrl, pathname), {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  })

  if (!response.ok) {
    throw new Error(`${pathname} returned HTTP ${response.status}`)
  }

  await response.arrayBuffer()
}

async function performDaemonCheck(options) {
  if (!options.daemonUrl) {
    return { ok: false, error: "missing daemon URL. Pass --daemon-url or set BLUENOTE_DAEMON_URL." }
  }

  try {
    await fetchDaemonEndpoint(options.daemonUrl, "/health", options.daemonToken)
    await fetchDaemonEndpoint(options.daemonUrl, "/capabilities", options.daemonToken)

    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error"

    return { ok: false, error: message }
  }
}

function formatDaemonCheckResult(result) {
  if (result.ok) {
    return {
      exitCode: 0,
      stdout: "BlueNote daemon check passed.\n",
      stderr: "",
    }
  }

  return {
    exitCode: 1,
    stdout: "",
    stderr: `BlueNote daemon check failed: ${result.error ?? "unknown error"}\n`,
  }
}

export async function runTuiCommand(args = [], options = {}) {
  const io = options.io ?? process
  if (args.includes("--help") || args.includes("-h")) {
    io.stdout.write(formatTuiHelp())
    return 0
  }

  if (args.includes("--version") || args.includes("-v")) {
    io.stdout.write(`${options.version ?? pkg.version}\n`)
    return 0
  }

  const daemonOptions = readDaemonCommandOptions(args, options.env ?? process.env)

  if (daemonOptions.checkDaemon || daemonOptions.daemonUrl) {
    const daemonCheckResult = await performDaemonCheck(daemonOptions)

    if (daemonOptions.checkDaemon || !daemonCheckResult.ok) {
      writeCliResult(formatDaemonCheckResult(daemonCheckResult), io)
      return daemonCheckResult.ok ? 0 : 1
    }
  }

  return runAndWrite((options.tuiRunner ?? runDefaultTui)(), io)
}

export async function runCommand(args, options = {}) {
  const io = options.io ?? process
  const version = options.version ?? pkg.version
  const result = args[0] === "tui"
    ? (options.tuiRunner ?? runDefaultTui)()
    : (options.cliRunner ?? runDefaultCli)(args, version)

  return runAndWrite(result, io)
}
