#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { analyze, compile, CompileError, formatDiagnostic } from './index.js'
import { formatLoom } from './formatter.js'
import type { CompilerDiagnostic } from './index.js'

export const runCli = (argv: string[], io = defaultIo()) => {
  const args = argv.slice(2)
  const command = args[0] ?? 'check'
  const input = args[1]

  // --target takes precedence over --framework (legacy alias)
  const framework = (
    readFlag(args, '--target') ??
    readFlag(args, '--framework') ??
    'react'
  ) as 'react' | 'vue' | 'svelte'

  const outputPath = readFlag(args, '--output')
  const jsonMode = args.includes('--json')

  const fail = (message: string) => {
    if (jsonMode) {
      io.stderr(JSON.stringify({ error: message }) + '\n')
    } else {
      io.stderr(`${message}\n`)
    }
    if (io.exit) io.exit(1)
    return 1
  }

  if (!input) {
    return fail(
      'Usage: loomc <compile|check|format> <file.loom> [--target react|vue|svelte] [--output <file>] [--json]',
    )
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

      if (jsonMode) {
        io.stdout(
          JSON.stringify({
            code: result.code,
            css: result.css || null,
            map: result.map ?? null,
            warnings: result.warnings ?? [],
          }) + '\n',
        )
      } else if (outputPath) {
        const resolved = resolve(process.cwd(), outputPath)
        writeFileSync(resolved, result.code, 'utf8')
        if (result.css) {
          const cssPath = resolved.replace(/\.[^.]+$/, '.module.css')
          writeFileSync(cssPath, result.css, 'utf8')
        }
        io.stdout(`Written to ${resolved}\n`)
      } else {
        io.stdout(`${result.code}\n`)
        if (result.css) {
          io.stdout(`\n/* Loom CSS */\n${result.css}\n`)
        }
        if (result.warnings && result.warnings.length > 0) {
          for (const w of result.warnings) {
            io.stderr(`${formatDiagnostic(w)}\n`)
          }
        }
      }
    } else if (command === 'format') {
      const formatted = formatLoom(source)
      if (outputPath) {
        const resolved = resolve(process.cwd(), outputPath)
        writeFileSync(resolved, formatted, 'utf8')
        io.stdout(`Written to ${resolved}\n`)
      } else {
        io.stdout(formatted)
      }
    } else if (command === 'check') {
      const { diagnostics } = analyze(source)

      if (jsonMode) {
        io.stdout(JSON.stringify({ diagnostics: diagnostics.map(serializeDiagnostic) }) + '\n')
        if (diagnostics.some((d) => d.severity === 'error')) {
          if (io.exit) io.exit(1)
          return 1
        }
      } else {
        if (diagnostics.length > 0) {
          diagnostics.forEach((d) => io.stderr(`${formatDiagnostic(d)}\n`))
          if (diagnostics.some((d) => d.severity === 'error')) {
            if (io.exit) io.exit(1)
            return 1
          }
        } else {
          io.stdout('OK\n')
        }
      }
    } else {
      return fail(`Unknown command: ${command}`)
    }
  } catch (error: any) {
    if (error instanceof CompileError) {
      if (jsonMode) {
        io.stderr(
          JSON.stringify({ diagnostics: error.diagnostics.map(serializeDiagnostic) }) + '\n',
        )
      } else {
        error.diagnostics.forEach((d) => io.stderr(`${formatDiagnostic(d)}\n`))
      }
      return 1
    }
    return fail(error instanceof Error ? error.message : String(error))
  }

  return 0
}

function serializeDiagnostic(d: CompilerDiagnostic) {
  return {
    code: d.code,
    severity: d.severity,
    message: d.message,
    line: d.span.start.line,
    column: d.span.start.column,
    endLine: d.span.end.line,
    endColumn: d.span.end.column,
  }
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
