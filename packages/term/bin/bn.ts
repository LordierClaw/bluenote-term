#!/usr/bin/env bun
import { runInternalCommand } from "../src/internal-command"

const args = process.argv.slice(2)
const exitCode = await runInternalCommand(args)

process.exit(exitCode)
