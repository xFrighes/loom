#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import * as readline from 'node:readline'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import {
  addonCatalog,
  addonIds,
  scaffoldProject,
  starterTemplates,
  templateCatalog,
} from './index.js'
import type { LoomAddon, PackageManager, StarterTemplate } from './index.js'

type CliIo = {
  stdout(value: string): void
  stderr(value: string): void
  exit(code: number): void
}

type ParsedCli = {
  name?: string
  directory?: string
  template?: StarterTemplate
  packageManager?: PackageManager
  addons: LoomAddon[]
  addonsProvided: boolean
  force: boolean
  dryRun: boolean
  install: boolean
  git: boolean
  help: boolean
  list: boolean
  wizard: boolean
  yes: boolean
}

type RunCommandResult = {
  status: number
  error?: Error
}

type PromptSession = {
  question(prompt: string): Promise<string>
  close(): void
}

type Choice<T extends string> = {
  id: T
  label: string
  description: string
}

const ansi = {
  bold: '\x1B[1m',
  reset: '\x1B[0m',
  violet: '\x1B[38;5;141m',
}

export async function runCli(argv = process.argv, io: CliIo = processIo): Promise<number> {
  try {
    let parsed = parseArgs(argv.slice(2))

    if (parsed.help) {
      io.stdout(helpText())
      return 0
    }

    if (parsed.list) {
      io.stdout(templateList())
      return 0
    }

    if (shouldPrompt(parsed)) {
      parsed = await promptForMissingOptions(parsed, io)
    }

    if (!parsed.name) {
      io.stderr(`${helpText()}\n`)
      io.exit(1)
      return 1
    }

    const template = parsed.template ?? 'react'
    const packageManager = parsed.packageManager ?? 'bun'

    if (parsed.dryRun) {
      io.stdout(dryRunText({ ...parsed, template, packageManager }))
      return 0
    }

    const result = scaffoldProject({
      name: parsed.name,
      directory: parsed.directory ?? parsed.name,
      template,
      packageManager,
      addons: parsed.addons,
      force: parsed.force,
    })

    io.stdout(successText(result.projectName, result.directory, result.summary, result.nextSteps))

    if (parsed.git) {
      const gitResult = runCommand('git', ['init'], result.directory)
      if (gitResult.status !== 0) return reportCommandFailure(io, 'git init', gitResult)
      io.stdout('\n🌱 Initialized a git repository.\n')
    }

    if (parsed.install) {
      const install = installInvocation(packageManager)
      const installResult = runCommand(install.command, install.args, result.directory)
      if (installResult.status !== 0) return reportCommandFailure(io, install.label, installResult)
      io.stdout('\n📦 Dependencies installed.\n')
    }

    return 0
  } catch (error) {
    io.stderr(`❌ ${error instanceof Error ? error.message : String(error)}\n`)
    io.exit(1)
    return 1
  }
}

function parseArgs(args: string[]): ParsedCli {
  const parsed: ParsedCli = {
    addons: [],
    addonsProvided: false,
    force: false,
    dryRun: false,
    install: false,
    git: false,
    help: false,
    list: false,
    wizard: false,
    yes: false,
  }

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index]

    if (value === '--help' || value === '-h') parsed.help = true
    else if (value === '--list') parsed.list = true
    else if (value === '--wizard' || value === '-i') parsed.wizard = true
    else if (value === '--yes' || value === '-y') parsed.yes = true
    else if (value === '--force' || value === '-f') parsed.force = true
    else if (value === '--dry-run') parsed.dryRun = true
    else if (value === '--install') parsed.install = true
    else if (value === '--git') parsed.git = true
    else if (value === '--all-addons') {
      parsed.addons = [...addonIds]
      parsed.addonsProvided = true
    } else if (value === '--no-addons') {
      parsed.addons = []
      parsed.addonsProvided = true
    } else if (value === '--react' || value === '--vue' || value === '--svelte' || value === '--loomkit') {
      parsed.template = value.slice(2) as StarterTemplate
    } else if (value === '--template' || value === '-t' || value === '--target') {
      parsed.template = readTemplate(readRequiredValue(args, index, value))
      index += 1
    } else if (value.startsWith('--template=')) {
      parsed.template = readTemplate(value.slice('--template='.length))
    } else if (value.startsWith('--target=')) {
      parsed.template = readTemplate(value.slice('--target='.length))
    } else if (value === '--pm' || value === '--package-manager') {
      parsed.packageManager = readPackageManager(readRequiredValue(args, index, value))
      index += 1
    } else if (value.startsWith('--pm=')) {
      parsed.packageManager = readPackageManager(value.slice('--pm='.length))
    } else if (value.startsWith('--package-manager=')) {
      parsed.packageManager = readPackageManager(value.slice('--package-manager='.length))
    } else if (value === '--addons' || value === '--with') {
      parsed.addons = readAddons(readRequiredValue(args, index, value))
      parsed.addonsProvided = true
      index += 1
    } else if (value.startsWith('--addons=')) {
      parsed.addons = readAddons(value.slice('--addons='.length))
      parsed.addonsProvided = true
    } else if (value.startsWith('--with=')) {
      parsed.addons = readAddons(value.slice('--with='.length))
      parsed.addonsProvided = true
    } else if (value === '--dir' || value === '--directory') {
      parsed.directory = readRequiredValue(args, index, value)
      index += 1
    } else if (value.startsWith('--dir=')) {
      parsed.directory = value.slice('--dir='.length)
    } else if (value.startsWith('--directory=')) {
      parsed.directory = value.slice('--directory='.length)
    } else if (value.startsWith('-')) {
      throw new Error(`Unknown option "${value}". Run create-loom-app --help for usage.`)
    } else if (!parsed.name) {
      parsed.name = value
    } else {
      throw new Error(`Unexpected argument "${value}". Only one project name is supported.`)
    }
  }

  return parsed
}

function shouldPrompt(parsed: ParsedCli): boolean {
  if (parsed.yes || parsed.dryRun) return false
  if (!isInteractiveTerminal()) return false
  return parsed.wizard || !parsed.name || !parsed.template || !parsed.packageManager || !parsed.addonsProvided
}

async function promptForMissingOptions(parsed: ParsedCli, io: CliIo): Promise<ParsedCli> {
  io.stdout(`${strongViolet('🧵 create-loom-app wizard')}\n\n`)
  const name = parsed.name ?? await askText('🏷️  Project name', 'my-loom-app')
  const template = parsed.template ?? await askChoice('🎯 Framework target', templateCatalog.map((entry) => ({
      id: entry.id,
      label: `${entry.emoji} ${entry.label}`,
      description: entry.description,
    })))
  const packageManager = parsed.packageManager ?? await askChoice('📦 Package manager', [
      { id: 'bun', label: '⚡ Bun', description: 'Fast install and scripts.' },
      { id: 'pnpm', label: '📦 pnpm', description: 'Strict, workspace-friendly installs.' },
      { id: 'npm', label: '🧰 npm', description: 'Default Node package manager.' },
      { id: 'yarn', label: '🧶 Yarn', description: 'Classic Yarn commands.' },
    ])
  const addons = parsed.addonsProvided ? parsed.addons : await askMultiChoice('✨ Loom add-ons', addonCatalog.map((entry) => ({
      id: entry.id,
      label: `${entry.emoji} ${entry.label}`,
      description: entry.description,
    })))
  const git = parsed.git || await askYesNo('🌱 Initialize git?', true)
  const install = parsed.install || await askYesNo('📦 Install dependencies now?', false)

  return {
    ...parsed,
    name,
    template,
    packageManager,
    addons,
    addonsProvided: true,
    git,
    install,
  }
}

function createPrompt(): PromptSession {
  return createInterface({
    input: process.stdin,
    output: process.stdout,
  })
}

async function askText(label: string, fallback: string): Promise<string> {
  const prompt = createPrompt()
  try {
    const answer = (await prompt.question(`${strongViolet(label)} (${fallback}):  `)).trim()
    return answer || fallback
  } finally {
    prompt.close()
  }
}

async function askChoice<const T extends string>(
  label: string,
  choices: Array<Choice<T>>,
): Promise<T> {
  const selected = await selectWithKeys(label, choices, false)
  return choices[selected.highlighted].id
}

async function askMultiChoice<const T extends string>(
  label: string,
  choices: Array<Choice<T>>,
): Promise<T[]> {
  const selected = await selectWithKeys(label, choices, true)
  return [...selected.checked].map((index) => choices[index].id)
}

async function askYesNo(label: string, fallback: boolean): Promise<boolean> {
  const prompt = createPrompt()
  const suffix = fallback ? 'Y/n' : 'y/N'
  try {
    for (;;) {
      const answer = (await prompt.question(`${strongViolet(label)} (${suffix}):  `)).trim().toLowerCase()
      if (!answer) return fallback
      if (answer === 'y' || answer === 'yes') return true
      if (answer === 'n' || answer === 'no') return false
      process.stdout.write('❌ Answer yes or no.\n')
    }
  } finally {
    prompt.close()
  }
}

function selectWithKeys<T extends string>(
  label: string,
  choices: Array<Choice<T>>,
  multiple: boolean,
): Promise<{ highlighted: number; checked: Set<number> }> {
  if (!process.stdin.isTTY || !process.stdout.isTTY || typeof process.stdin.setRawMode !== 'function') {
    return Promise.resolve({ highlighted: 0, checked: new Set<number>() })
  }

  const input = process.stdin
  const output = process.stdout
  let highlighted = 0
  let renderedRows = 0
  const checked = new Set<number>()
  const wasRaw = input.isRaw

  return new Promise((resolve, reject) => {
    const clear = () => {
      if (renderedRows > 0) {
        readline.moveCursor(output, 0, -renderedRows)
        readline.cursorTo(output, 0)
        readline.clearScreenDown(output)
      }
    }

    const selectedSummary = () => {
      if (!multiple) return choices[highlighted].label
      if (checked.size === 0) return 'none'
      return [...checked].map((index) => choices[index].label).join(', ')
    }

    const cleanup = () => {
      input.off('keypress', onKeypress)
      input.setRawMode(wasRaw)
      input.pause()
      output.write('\x1B[?25h')
    }

    const finish = () => {
      clear()
      output.write(`${strongViolet(label)}: ${strongViolet(selectedSummary())}\n`)
      cleanup()
      resolve({ highlighted, checked })
    }

    const fail = (error: Error) => {
      clear()
      cleanup()
      reject(error)
    }

    const render = () => {
      clear()
      const hint = multiple
        ? '↑/↓ move, Space toggle, Enter confirm'
        : '↑/↓ move, Enter select'
      const lines = [
        strongViolet(label),
        `  ${hint}`,
        ...choices.map((choice, index) => {
          const pointer = index === highlighted ? '›' : ' '
          const marker = multiple ? (checked.has(index) ? '◼' : '◻') : (index === highlighted ? '●' : '○')
          const line = `${pointer} ${marker} ${choice.label}`
          return fitTerminalLine(index === highlighted ? strongViolet(line) : line, output.columns)
        }),
      ]
      output.write(`${lines.join('\n')}\n`)
      renderedRows = terminalRows(lines, output.columns)
    }

    const onKeypress = (_value: string, key: readline.Key) => {
      if (key.ctrl && key.name === 'c') {
        fail(new Error('Cancelled'))
        return
      }
      if (key.name === 'up') {
        highlighted = (highlighted - 1 + choices.length) % choices.length
        render()
        return
      }
      if (key.name === 'down') {
        highlighted = (highlighted + 1) % choices.length
        render()
        return
      }
      if (multiple && key.name === 'space') {
        if (checked.has(highlighted)) checked.delete(highlighted)
        else checked.add(highlighted)
        render()
        return
      }
      if (!multiple && key.name === 'space') {
        finish()
        return
      }
      if (key.name === 'return' || key.name === 'enter') {
        finish()
      }
    }

    readline.emitKeypressEvents(input)
    input.setRawMode(true)
    input.resume()
    input.on('keypress', onKeypress)
    output.write('\x1B[?25l')
    render()
  })
}

function terminalRows(lines: string[], columns = 80): number {
  const width = Math.max(columns || 80, 20)
  return lines.reduce((rows, line) => rows + Math.max(1, Math.ceil(visibleLength(line) / width)), 0)
}

function fitTerminalLine(line: string, columns = 80): string {
  const width = Math.max(columns || 80, 20)
  const max = Math.max(width - 1, 10)
  if (visibleLength(line) <= max) return line
  return `${line.slice(0, Math.max(max - 1, 1))}…`
}

function visibleLength(value: string): number {
  return value.replace(/\x1B\[[0-9;?]*[A-Za-z]/g, '').length
}

function strongViolet(value: string): string {
  return `${ansi.bold}${ansi.violet}${value}${ansi.reset}`
}

function isInteractiveTerminal(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY)
}

function readRequiredValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1]
  if (!value || value.startsWith('-')) {
    throw new Error(`Expected a value after ${flag}`)
  }
  return value
}

function readTemplate(value: string): StarterTemplate {
  const normalized = value.toLowerCase()
  const aliases: Record<string, StarterTemplate> = {
    kit: 'loomkit',
    loom: 'loomkit',
    loomkit: 'loomkit',
    react: 'react',
    vue: 'vue',
    svelte: 'svelte',
  }
  const template = aliases[normalized]
  if (!template || !starterTemplates.includes(template)) {
    throw new Error(`Unknown template "${value}". Expected one of: ${starterTemplates.join(', ')}`)
  }
  return template
}

function readPackageManager(value: string): PackageManager {
  const normalized = value.toLowerCase()
  if (normalized !== 'bun' && normalized !== 'npm' && normalized !== 'pnpm' && normalized !== 'yarn') {
    throw new Error(`Unknown package manager "${value}". Expected bun, npm, pnpm, or yarn.`)
  }
  return normalized
}

function readAddons(value: string): LoomAddon[] {
  const normalized = value.trim().toLowerCase()
  if (!normalized || normalized === 'none') return []
  if (normalized === 'all') return [...addonIds]
  const aliases: Record<string, LoomAddon> = {
    ai: 'loom-llm',
    llm: 'loom-llm',
    'loom-llm': 'loom-llm',
    tailwind: 'tailwind',
    css: 'tailwind',
    eslint: 'eslint',
    lint: 'eslint',
    testing: 'testing',
    test: 'testing',
    devtools: 'devtools',
    devtool: 'devtools',
    ui: 'ui',
    codemod: 'codemod',
    migrate: 'codemod',
    migration: 'codemod',
  }
  const selected = normalized.split(',').map((part) => part.trim()).filter(Boolean)
  return selected.map((entry) => {
    const addon = aliases[entry]
    if (!addon || !addonIds.includes(addon)) {
      throw new Error(`Unknown add-on "${entry}". Expected one of: ${addonIds.join(', ')}, all, or none.`)
    }
    return addon
  })
}

function installInvocation(packageManager: PackageManager): { command: string; args: string[]; label: string } {
  if (packageManager === 'yarn') return { command: 'yarn', args: [], label: 'yarn' }
  return { command: packageManager, args: ['install'], label: `${packageManager} install` }
}

function runCommand(command: string, args: string[], cwd: string): RunCommandResult {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  return {
    status: typeof result.status === 'number' ? result.status : 1,
    error: result.error,
  }
}

function reportCommandFailure(io: CliIo, label: string, result: RunCommandResult): number {
  const suffix = result.error ? `: ${result.error.message}` : ''
  io.stderr(`\n❌ ${label} failed with exit code ${result.status}${suffix}\n`)
  io.exit(result.status)
  return result.status
}

function successText(projectName: string, directory: string, summary: string[], nextSteps: string[]): string {
  return [
    '',
    strongViolet(`✨ Created ${projectName}`),
    `${strongViolet('📍 Location:')} ${directory}`,
    '',
    strongViolet('🧬 Project:'),
    ...summary.map((line) => `  ${strongViolet('•')} ${line}`),
    '',
    strongViolet('🚀 Next steps:'),
    ...nextSteps.map((step) => `  ${strongViolet(step)}`),
    '',
  ].join('\n')
}

function dryRunText(parsed: ParsedCli & { template: StarterTemplate; packageManager: PackageManager }): string {
  return [
    strongViolet('🧪 create-loom-app dry run'),
    `  🏷️  name: ${parsed.name ?? '(missing)'}`,
    `  📁 directory: ${parsed.directory ?? parsed.name ?? '(missing)'}`,
    `  🎯 template: ${parsed.template}`,
    `  📦 package manager: ${parsed.packageManager}`,
    `  ✨ add-ons: ${parsed.addons.length > 0 ? parsed.addons.join(', ') : 'none'}`,
    `  🧨 force: ${parsed.force ? 'yes' : 'no'}`,
    `  🌱 git: ${parsed.git ? 'yes' : 'no'}`,
    `  📦 install: ${parsed.install ? 'yes' : 'no'}`,
    '',
  ].join('\n')
}

function templateList(): string {
  return [
    strongViolet('🧵 Available Loom starters:'),
    '',
    ...templateCatalog.map((template) => [
      `  ${template.emoji} ${template.id.padEnd(7)} ${template.label}`,
      `          ${template.description}`,
      `          ${template.nextMove}`,
    ].join('\n')),
    '',
    strongViolet('✨ Add-ons:'),
    '',
    ...addonCatalog.map((addon) => `  ${addon.emoji} ${addon.id.padEnd(9)} ${addon.label} - ${addon.description}`),
    '',
  ].join('\n')
}

function helpText(): string {
  return `🧵 create-loom-app <project-name> [options]

Examples:
  create-loom-app
  create-loom-app my-app --wizard
  create-loom-app docs-site --vue --pm pnpm --with loom-llm,tailwind,eslint
  create-loom-app app-shell --loomkit --all-addons --git --install

Options:
  -i, --wizard                               Prompt for every major choice
  -t, --template <react|vue|svelte|loomkit>  Starter template. Default: react in non-interactive mode
  --target <react|vue|svelte|loomkit>        Alias for --template
  --react | --vue | --svelte | --loomkit     Template shortcuts
  --pm <bun|npm|pnpm|yarn>                   Package manager. Default: bun in non-interactive mode
  --addons <list> | --with <list>             Add-ons: ${addonIds.join(', ')}, all, or none
  --all-addons                               Include every Loom ecosystem add-on
  --no-addons                                Skip add-ons and do not prompt for them
  --dir <path>                               Output directory. Default: project name
  --git                                      Run git init after scaffolding
  --install                                  Install dependencies after scaffolding
  --dry-run                                  Preview choices without writing files
  --list                                     Show starter and add-on descriptions
  -y, --yes                                  Use defaults for missing choices without prompting
  -f, --force                                Write into a non-empty directory
  -h, --help                                 Show help
`
}

const processIo: CliIo = {
  stdout(value) {
    process.stdout.write(value)
  },
  stderr(value) {
    process.stderr.write(value)
  },
  exit(code) {
    process.exitCode = code
  },
}

const isEntrypoint = (() => {
  if (!process.argv[1]) return false
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
})()

if (isEntrypoint) {
  await runCli()
}
