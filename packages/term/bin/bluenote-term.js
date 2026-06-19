#!/usr/bin/env node
import { runTuiCommand } from "../dist/command.js"

const args = process.argv.slice(2)
const exitCode = await runTuiCommand(args)

process.exit(exitCode)
