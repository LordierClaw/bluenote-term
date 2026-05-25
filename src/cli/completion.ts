import { IndexUnavailableError, UsageError } from "../core/errors"
import {
  listCompletionSelectorCandidates as listSelectorCandidates,
  listCompletionSelectors,
} from "../core/list-completion-selectors"
import type { CliResult } from "../core/types"

export const COMMAND_NAMES = [
  "init",
  "new",
  "list",
  "show",
  "search",
  "edit",
  "archive",
  "delete",
  "rebuild",
  "migrate",
  "completion",
  "tui",
] as const

export const FLAG_NAMES = ["--help", "--version", "--title", "--force"] as const

const SHELL_NAMES = ["bash", "zsh", "fish"] as const

type ShellName = (typeof SHELL_NAMES)[number]

function commandWords(): string {
  return COMMAND_NAMES.join(" ")
}

function flagWords(): string {
  return FLAG_NAMES.join(" ")
}

function generateBashCompletionScript(): string {
  return `#!/usr/bin/env bash
_bn() {
  local cur prev command
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  command="\${COMP_WORDS[1]}"

  if [[ \${COMP_CWORD} -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "${commandWords()}" -- "\${cur}") )
    return 0
  fi

  case "\${command}" in
    completion)
      COMPREPLY=( $(compgen -W "${SHELL_NAMES.join(" ")}" -- "\${cur}") )
      return 0
      ;;
    new)
      [[ "\${prev}" == "--title" ]] && return 0
      COMPREPLY=( $(compgen -W "--title" -- "\${cur}") )
      return 0
      ;;
    delete)
      COMPREPLY=( $(compgen -W "--force $("\${COMP_WORDS[0]}" complete selectors delete "\${cur}")" -- "\${cur}") )
      return 0
      ;;
    show|edit|archive)
      COMPREPLY=( $(compgen -W "$("\${COMP_WORDS[0]}" complete selectors \${command} "\${cur}")" -- "\${cur}") )
      return 0
      ;;
  esac

  COMPREPLY=( $(compgen -W "${commandWords()} ${flagWords()}" -- "\${cur}") )
}
complete -F _bn bn
complete -F _bn bluenote
`
}

function generateZshCompletionScript(): string {
  return `#compdef bn bluenote

_bn() {
  local -a commands
  local -a flags
  commands=(${COMMAND_NAMES.map((command) => `'${command}'`).join(" ")})
  flags=(${FLAG_NAMES.map((flag) => `'${flag}'`).join(" ")})

  if (( CURRENT == 2 )); then
    _describe 'command' commands
    return 0
  fi

  case "$words[2]" in
    completion)
      _describe 'shell' 'bash' 'zsh' 'fish'
      return 0
      ;;
    new)
      _describe 'flag' '--title'
      return 0
      ;;
    delete)
      _values 'selector or flag' ${FLAG_NAMES.map((flag) => `'${flag}'`).join(" ")} $(\${words[1]} complete selectors delete "$words[CURRENT]")
      return 0
      ;;
    show|edit|archive)
      _values 'selector' $(\${words[1]} complete selectors "$words[2]" "$words[CURRENT]")
      return 0
      ;;
  esac

  _describe 'value' commands
  _describe 'flag' flags
}
compdef _bn bn bluenote
`
}

function generateFishCompletionScript(): string {
  const commandLines = COMMAND_NAMES.flatMap((command) => [
    `complete -c bn -n '__fish_use_subcommand' -a '${command}'`,
    `complete -c bluenote -n '__fish_use_subcommand' -a '${command}'`,
  ])

  return `${commandLines.join("\n")}
complete -c bn -n '__fish_seen_subcommand_from completion' -a 'bash zsh fish'
complete -c bluenote -n '__fish_seen_subcommand_from completion' -a 'bash zsh fish'
complete -c bn -l help
complete -c bluenote -l help
complete -c bn -l version
complete -c bluenote -l version
complete -c bn -n '__fish_seen_subcommand_from new' -l title
complete -c bluenote -n '__fish_seen_subcommand_from new' -l title
complete -c bn -n '__fish_seen_subcommand_from delete' -l force
complete -c bluenote -n '__fish_seen_subcommand_from delete' -l force
complete -c bn -n '__fish_seen_subcommand_from show edit archive delete' -a '(bn complete selectors (commandline -opc)[2] (commandline -ct))'
complete -c bluenote -n '__fish_seen_subcommand_from show edit archive delete' -a '(bluenote complete selectors (commandline -opc)[2] (commandline -ct))'
`
}

export function generateCompletionScript(shell: ShellName): string {
  if (shell === "bash") {
    return generateBashCompletionScript()
  }

  if (shell === "zsh") {
    return generateZshCompletionScript()
  }

  return generateFishCompletionScript()
}

export { listSelectorCandidates as listCompletionSelectorCandidates }

export function runCompletionCli(args: string[]): CliResult {
  const [subcommand, ...rest] = args

  if (!subcommand) {
    throw new UsageError("Missing shell for completion.", {
      hint: "Run bn completion <bash|zsh|fish>.",
    })
  }

  if ((SHELL_NAMES as readonly string[]).includes(subcommand)) {
    return {
      exitCode: 0,
      stdout: `${generateCompletionScript(subcommand as ShellName)}\n`,
      stderr: "",
    }
  }

  throw new UsageError(`Unsupported completion shell: ${subcommand}.`, {
    hint: "Run bn completion <bash|zsh|fish>.",
  })
}

export function runCompletionBackendCli(args: string[]): CliResult {
  const [backend, command = "", partial = ""] = args

  if (backend !== "selectors") {
    return { exitCode: 0, stdout: "", stderr: "" }
  }

  try {
    const selectors = listCompletionSelectors({ command, partial })

    return {
      exitCode: 0,
      stdout: selectors.length === 0 ? "" : `${selectors.join("\n")}\n`,
      stderr: "",
    }
  } catch (error) {
    if (error instanceof IndexUnavailableError) {
      return { exitCode: 0, stdout: "", stderr: "" }
    }

    throw error
  }
}
