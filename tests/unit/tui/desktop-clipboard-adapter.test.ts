import { describe, test } from "bun:test"
import assert from "node:assert/strict"

import { createDesktopClipboardModel, type ClipboardCommandRun } from "../../../src/tui/adapters/desktop-clipboard-adapter"

describe("desktop clipboard adapter", () => {
  test("prefers a verified cross-platform clipboard library before command providers", () => {
    const runs: ClipboardCommandRun[] = []
    let libraryText = "from library"
    const model = createDesktopClipboardModel({
      platform: "linux",
      env: { WAYLAND_DISPLAY: "wayland-0" },
      commandExists: (command) => command === "wl-copy" || command === "wl-paste",
      run: (run) => {
        runs.push(run)
        return { ok: true, stdout: "from command" }
      },
      library: {
        name: "clipboardy",
        available: () => true,
        writeText: (text) => {
          libraryText = text
        },
        readText: () => libraryText,
      },
      stdout: { write: () => true },
    })

    const write = model.writeText("to library")
    const read = model.readTextWithResult()

    assert.equal(write.providerName, "clipboardy")
    assert.equal(write.category, "desktop")
    assert.equal(read.providerName, "clipboardy")
    assert.equal(read.text, "to library")
    assert.deepEqual(runs, [])
  })

  test("falls back to command providers when the cross-platform library fails", () => {
    let commandText = ""
    const model = createDesktopClipboardModel({
      platform: "linux",
      env: { WAYLAND_DISPLAY: "wayland-0" },
      commandExists: (command) => command === "wl-copy" || command === "wl-paste",
      run: (run) => {
        if (run.command === "wl-copy") commandText = run.input ?? ""
        return { ok: true, stdout: commandText }
      },
      library: {
        name: "clipboardy",
        available: () => true,
        writeText: () => {
          throw new Error("library write failed")
        },
        readText: () => {
          throw new Error("library read failed")
        },
      },
      stdout: { write: () => true },
    })

    const write = model.writeText("to command")
    const read = model.readTextWithResult()

    assert.equal(write.providerName, "wl-clipboard")
    assert.equal(write.category, "desktop")
    assert.equal(read.providerName, "wl-clipboard")
    assert.equal(read.text, "to command")
  })

  test("uses OSC52 when a discovered desktop command fails at write time", () => {
    const writes: string[] = []
    const model = createDesktopClipboardModel({
      platform: "linux",
      env: { WAYLAND_DISPLAY: "wayland-0", TERM: "xterm-256color" },
      commandExists: (command) => command === "wl-copy" || command === "wl-paste",
      run: () => ({ ok: false, stdout: "" }),
      enableOsc52: true,
      stdout: { write: (chunk: string) => {
        writes.push(chunk)
        return true
      }, isTTY: true },
    })

    const result = model.writeText("terminal fallback")

    assert.equal(result.providerName, "terminal OSC52 clipboard")
    assert.equal(result.category, "terminal")
    assert.equal(writes.length, 1)
    assert.match(writes[0] ?? "", /\u001b\]52;c;/)
  })

  test("writes internal clipboard first and truthfully reports unavailable desktop providers", () => {
    const model = createDesktopClipboardModel({
      platform: "linux",
      env: { WAYLAND_DISPLAY: "wayland-0" },
      commandExists: () => false,
      stdout: { write: () => true },
    })

    const result = model.writeText("internal only")

    assert.equal(result.category, "internal")
    assert.equal(result.ok, true)
    assert.equal(result.providerName, "BlueNote internal clipboard")
    assert.equal(model.readText(), "internal only")
    assert.equal(model.clipboardStatus().desktopWriteAvailable, false)
    assert.equal(model.clipboardStatus().desktopReadAvailable, false)
  })

  test("uses available desktop provider for copy and paste while retaining internal fallback", () => {
    const runs: ClipboardCommandRun[] = []
    let desktopText = "desktop paste"
    const model = createDesktopClipboardModel({
      platform: "darwin",
      commandExists: (command) => command === "pbcopy" || command === "pbpaste",
      run: (run) => {
        runs.push(run)
        if (run.command === "pbcopy") desktopText = run.input ?? ""
        return { ok: true, stdout: run.command === "pbpaste" ? desktopText : "" }
      },
      stdout: { write: () => true },
    })

    const write = model.writeText("copied")
    const read = model.readTextWithResult()

    assert.deepEqual(runs.map((run) => run.command), ["pbcopy", "pbpaste"])
    assert.equal(write.category, "desktop")
    assert.equal(write.providerName, "pbcopy/pbpaste")
    assert.equal(read.category, "desktop")
    assert.equal(read.text, "copied")
  })

  test("falls back to internal paste when a readable desktop provider fails", () => {
    const model = createDesktopClipboardModel({
      platform: "linux",
      env: { DISPLAY: ":1" },
      commandExists: (command) => command === "xclip",
      run: (run) => ({ ok: run.args.includes("-o") ? false : true, stdout: "" }),
      stdout: { write: () => true },
    })

    model.writeText("fallback")
    const read = model.readTextWithResult()

    assert.equal(read.category, "internal")
    assert.equal(read.text, "fallback")
    assert.match(read.message ?? "", /desktop clipboard read failed/i)
  })

  test("probes platform command chains without executing unavailable commands", () => {
    const checked: string[] = []
    const executed: string[] = []
    createDesktopClipboardModel({
      platform: "linux",
      env: { WAYLAND_DISPLAY: "wayland-0", DISPLAY: ":1" },
      commandExists: (command) => {
        checked.push(command)
        return command === "xsel"
      },
      run: (run) => {
        executed.push(run.command)
        return { ok: true, stdout: "" }
      },
      stdout: { write: () => true },
    })

    assert.deepEqual(checked, ["wl-copy", "xclip", "xsel", "wl-paste", "xclip", "xsel"])
    assert.deepEqual(executed, [])
  })

  test("skips Linux desktop command providers when no Wayland or X11 display is advertised", () => {
    const checked: string[] = []
    const model = createDesktopClipboardModel({
      platform: "linux",
      env: {},
      commandExists: (command) => {
        checked.push(command)
        return true
      },
      stdout: { write: () => true, isTTY: false },
      enableOsc52: false,
    })

    assert.deepEqual(checked, [])
    assert.equal(model.clipboardStatus().copyCategory, "internal")
    assert.equal(model.clipboardStatus().desktopWriteAvailable, false)
  })

  test("models Windows PowerShell copy and paste", () => {
    const runs: ClipboardCommandRun[] = []
    const model = createDesktopClipboardModel({
      platform: "win32",
      commandExists: (command) => command === "powershell.exe",
      run: (run) => {
        runs.push(run)
        return { ok: true, stdout: run.command === "powershell.exe" && run.args.includes("Get-Clipboard") ? "from windows" : "" }
      },
      stdout: { write: () => true },
    })

    const write = model.writeText("to windows")
    const read = model.readTextWithResult?.()

    assert.equal(write?.category, "desktop")
    assert.equal(read?.text, "from windows")
    assert.deepEqual(runs.map((run) => run.command), ["powershell.exe", "powershell.exe"])
  })

  test("models WSL clip.exe copy plus PowerShell readback when both are available", () => {
    const model = createDesktopClipboardModel({
      platform: "linux",
      env: { WSL_DISTRO_NAME: "Ubuntu" },
      commandExists: (command) => command === "clip.exe" || command === "powershell.exe",
      run: (run) => ({ ok: true, stdout: run.command === "powershell.exe" ? "from windows" : "" }),
      stdout: { write: () => true },
    })

    assert.equal(model.writeText("to windows").providerName, "WSL clipboard")
    assert.equal(model.readTextWithResult().text, "from windows")
    assert.equal(model.readTextWithResult().category, "desktop")
  })
})
