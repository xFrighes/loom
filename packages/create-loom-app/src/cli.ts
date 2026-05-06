#!/usr/bin/env node
import { scaffoldProject, starterTemplates } from './index.js'
import type { PackageManager, StarterTemplate } from './index.js'

type CliIo = {
  stdout(value: string): void
  stderr(value: string): void
  exit(code: number): void
}

export function runCli(argv = process.argv, io: CliIo = processIo): number {
  const args = argv.slice(2)

  if (args.includes('--help') || args.includes('-h')) {
    io.stdout(helpText())
    return 0
  }

  const name = readPositional(args)
  if (!name) {
    io.stderr(`${helpText()}\n`)
    io.exit(1)
    return 1
  }

  try {
    const result = scaffoldProject({
      name,
      directory: readOption(args, '--dir') ?? name,
      template: readTemplate(args),
      packageManager: readPackageManager(args),
      force: args.includes('--force'),
    })

    io.stdout(`Created ${result.projectName} in ${result.directory}\n\n`)
    io.stdout('Next steps:\n')
    for (const step of result.nextSteps) {
      io.stdout(`  ${step}\n`)
    }
    return 0
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n`)
    io.exit(1)
    return 1
  }
}

function readTemplate(args: string[]): StarterTemplate {
  const value = readOption(args, '--template') ?? 'react'
  if (!starterTemplates.includes(value as StarterTemplate)) {
    throw new Error(`Unknown template "${value}". Expected one of: ${starterTemplates.join(', ')}`)
  }
  return value as StarterTemplate
}

function readPackageManager(args: string[]): PackageManager {
  const value = readOption(args, '--pm') ?? 'bun'
  if (value !== 'bun' && value !== 'npm' && value !== 'pnpm' && value !== 'yarn') {
    throw new Error(`Unknown package manager "${value}"`)
  }
  return value
}

function readPositional(args: string[]): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index]
    if (value.startsWith('-')) {
      if (value === '--template' || value === '--pm' || value === '--dir') index += 1
      continue
    }
    return value
  }
  return undefined
}

function readOption(args: string[], name: string): string | undefined {
  const equalsPrefix = `${name}=`
  const inline = args.find((arg) => arg.startsWith(equalsPrefix))
  if (inline) return inline.slice(equalsPrefix.length)

  const index = args.indexOf(name)
  if (index === -1) return undefined
  return args[index + 1]
}

function helpText(): string {
  return `create-loom-app <project-name> [options]

Options:
  --template <react|vue|svelte|loomkit>  Starter template. Default: react
  --pm <bun|npm|pnpm|yarn>               Package manager for next steps. Default: bun
  --dir <path>                           Output directory. Default: project name
  --force                                Write into a non-empty directory
  -h, --help                             Show help
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

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli()
}
