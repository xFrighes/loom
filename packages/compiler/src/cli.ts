#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { analyze, compile, CompileError, formatDiagnostic } from './index.js'
import { formatLoom } from './formatter.js'

export const runCli = (argv: string[], io = defaultIo()) => {
  const args = argv.slice(2)
  const command = args[0] ?? 'check'
  const input = args[1]
  const framework = (readFlag(args, '--framework') ?? 'react') as 'react' | 'vue' | 'svelte'

  const fail = (message: string) => {
    io.stderr(`${message}\n`)
    if (io.exit) io.exit(1)
    return 1
  }

  if (!input) {
    return fail('Usage: loomc <compile|check|format> <file.loom> [--framework react|vue|svelte]')
  }

  const filePath = resolve(process.cwd(), input)
  let source = ''
  try {
    source = readFileSync(filePath, 'utf8')
  } catch (e: any) {
    return fail(`Could not read file: ${e.message}`)
  }

  try {
    if (command === 'compile') {
      const componentName = input.split(/[/\\]/).pop()?.split('.')[0] || 'Component'
      const result = compile(source, { componentName, target: framework })
      io.stdout(`${result.code}\n`)
      if (result.css) {
        io.stdout(`\n/* Loom CSS */\n${result.css}\n`)
      }
    } else if (command === 'format') {
      io.stdout(formatLoom(source))
    } else if (command === 'check') {
      const { diagnostics } = analyze(source)
      if (diagnostics.length > 0) {
        diagnostics.forEach((diagnostic) => io.stderr(`${formatDiagnostic(diagnostic)}\n`))
        if (io.exit) io.exit(1)
        return 1
      }
      io.stdout('OK\n')
    } else {
      return fail(`Unknown command: ${command}`)
    }
  } catch (error: any) {
    if (error instanceof CompileError) {
      error.diagnostics.forEach((diagnostic) => io.stderr(`${formatDiagnostic(diagnostic)}\n`))
      return 1
    }
    return fail(error instanceof Error ? error.message : String(error))
  }

  return 0
}

function readFlag(argv: string[], flag: string) {
  const index = argv.indexOf(flag)
  if (index === -1) return null
  return argv[index + 1] ?? null
}

function defaultIo() {
  return {
    stdout: (value: string) => process.stdout.write(value),
    stderr: (value: string) => process.stderr.write(value),
    exit: (code: number) => process.exit(code),
  }
}

const isEntrypoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntrypoint) {
  runCli(process.argv)
}
