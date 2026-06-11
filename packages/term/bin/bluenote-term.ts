#!/usr/bin/env bun
import { runTuiCommand } from "../src/command"

const args = process.argv.slice(2)
const exitCode = await runTuiCommand(args)

process.exit(exitCode)
