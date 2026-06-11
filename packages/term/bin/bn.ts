#!/usr/bin/env bun
import { runCommand } from "../src/command"

const args = process.argv.slice(2)
const exitCode = await runCommand(args)

process.exit(exitCode)
