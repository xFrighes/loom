#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync, watch, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { analyze, compile, CompileError, formatDiagnostic } from './index.js'
import { formatLoom } from './printer.js'
import type { CompilerDiagnostic } from './index.js'

export type CliOptions = {
  readFile?: (path: string, encoding: 'utf8') => string
  writeFile?: (path: string, data: string, encoding: 'utf8') => void
  exists?: (path: string) => boolean
  readDir?: (path: string) => string[]
  stat?: (path: string) => { mtimeMs: number; isDirectory(): boolean }
  watchFile?: (path: string, callback: () => void) => { close: () => void }
  exit?: (code: number) => void
}

export type CliIo = {
  stdout: (value: string) => void
  stderr: (value: string) => void
  exit?: (code: number) => void
}

export const runCli = (argv: string[], io: CliIo = defaultIo(), options: CliOptions = {}) => {
  const args = argv.slice(2)
  const command = args[0] ?? 'check'
  const input = args[1]

  const readFile = options.readFile ?? readFileSync
  const writeFile = options.writeFile ?? writeFileSync
  const exists = options.exists ?? existsSync
  const readDir = options.readDir ?? ((path: string) => readdirSync(path))
  const stat = options.stat ?? statSync

  const framework = (readFlag(args, '--target') ?? readFlag(args, '--framework') ?? 'react') as
    | 'react'
    | 'vue'
    | 'svelte'

  const outputPath = readFlag(args, '--output')
  const jsonMode = args.includes('--json')
  const watchMode = args.includes('--watch')

  const fail = (message: string) => {
    if (jsonMode) {
      io.stderr(JSON.stringify({ error: message }) + '\n')
    } else {
      io.stderr(`${message}\n`)
    }
    const exit = options.exit ?? io.exit
    if (exit) exit(1)
    return 1
  }

  if (!input) {
    if (command === 'doctor') {
      const report = runDoctor(process.cwd(), { readFile, exists, readDir, stat })
      if (jsonMode) {
        io.stdout(JSON.stringify(report) + '\n')
      } else {
        io.stdout(formatDoctorReport(report))
      }
      return report.summary.errors > 0 ? 1 : 0
    }
    return fail(
      'Usage: loomc <compile|check|format|doctor> <file.loom|project-root> [--target react|vue|svelte] [--output <file>] [--json] [--watch]',
    )
  }

  const filePath = resolve(process.cwd(), input)

  const execute = () => {
    if (command === 'doctor') {
      const report = runDoctor(filePath, { readFile, exists, readDir, stat })
      if (jsonMode) {
        io.stdout(JSON.stringify(report) + '\n')
      } else {
        io.stdout(formatDoctorReport(report))
      }
      return report.summary.errors > 0 ? 1 : 0
    }

    let source = ''
    try {
      source = readFile(filePath, 'utf8') as string
    } catch (e: any) {
      return fail(`Could not read file: ${e.message}`)
    }

    try {
      if (command === 'compile') {
        const rawName = input.split(/[/\\]/).pop()?.split('.')[0] || 'Component'
        const componentName = sanitizeComponentName(rawName)
        const result = compile(source, { componentName, target: framework })

        if (jsonMode) {
          io.stdout(
            JSON.stringify({
              code: result.code,
              css: result.css || null,
              cssAssets: result.cssAssets ?? [],
              assets: result.assets ?? [],
              i18n: result.i18n ?? null,
              meta: result.meta ?? null,
              schema: result.schema ?? null,
              server: result.server ?? null,
              tokens: result.tokens ?? null,
              map: result.map ?? null,
              warnings: result.warnings ?? [],
            }) + '\n',
          )
        } else if (outputPath) {
          const resolved = resolve(process.cwd(), outputPath)
          writeFile(resolved, result.code, 'utf8')
          if (result.css) {
            const cssPath = resolved.replace(/\.[^.]+$/, '.module.css')
            writeFile(cssPath, result.css, 'utf8')
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
          writeFile(resolved, formatted, 'utf8')
          io.stdout(`Written to ${resolved}\n`)
        } else {
          io.stdout(formatted)
        }
      } else if (command === 'check') {
        const { diagnostics } = analyze(source)

        if (jsonMode) {
          io.stdout(JSON.stringify({ diagnostics: diagnostics.map(serializeDiagnostic) }) + '\n')
          if (diagnostics.some((d) => d.severity === 'error')) {
            return 1
          }
        } else {
          if (diagnostics.length > 0) {
            diagnostics.forEach((d) => io.stderr(`${formatDiagnostic(d)}\n`))
            if (diagnostics.some((d) => d.severity === 'error')) {
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

  if (watchMode) {
    const watchFile = options.watchFile ?? defaultWatchFile
    io.stderr(`Watching ${filePath}\n`)
    execute()
    watchFile(filePath, () => {
      io.stderr(`File changed, recompiling...\n`)
      execute()
    })
    return 0
  }

  const result = execute()
  if (result !== 0) {
    const exit = options.exit ?? io.exit
    if (exit) exit(result)
  }
  return result
}

function sanitizeComponentName(name: string): string {
  // Ensure valid JS identifier
  let sanitized = name.replace(/[^a-zA-Z0-9_$]/g, '_')
  if (/^[0-9]/.test(sanitized)) {
    sanitized = 'Component' + sanitized
  }
  return sanitized
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

type DoctorStatus = 'pass' | 'warn' | 'fail'

type DoctorCheck = {
  code: string
  status: DoctorStatus
  message: string
  suggestion?: string
}

type DoctorReport = {
  root: string
  checks: DoctorCheck[]
  summary: {
    passed: number
    warnings: number
    errors: number
  }
}

type DoctorFs = {
  readFile: (path: string, encoding: 'utf8') => string
  exists: (path: string) => boolean
  readDir: (path: string) => string[]
  stat: (path: string) => { mtimeMs: number; isDirectory(): boolean }
}

function runDoctor(root: string, fs: DoctorFs): DoctorReport {
  const checks: DoctorCheck[] = []
  checks.push(checkPackageVersions(root, fs))
  checks.push(checkBundlerConfig(root, fs))
  checks.push(checkRustBridge(root, fs))
  checks.push(checkGeneratedArtifacts(root, fs))

  return {
    root,
    checks,
    summary: {
      passed: checks.filter((check) => check.status === 'pass').length,
      warnings: checks.filter((check) => check.status === 'warn').length,
      errors: checks.filter((check) => check.status === 'fail').length,
    },
  }
}

function checkPackageVersions(root: string, fs: DoctorFs): DoctorCheck {
  const packagePath = join(root, 'package.json')
  if (!fs.exists(packagePath)) {
    return {
      code: 'loom/doctor-package',
      status: 'fail',
      message: 'package.json not found.',
      suggestion: 'Run loom doctor from a project root.',
    }
  }

  const pkg = JSON.parse(fs.readFile(packagePath, 'utf8'))
  const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }
  const loomPackages = Object.keys(allDeps).filter((name) => name === 'vite-plugin-loom' || name.startsWith('@loom-ui/'))
  const broken = loomPackages.filter((name) => String(allDeps[name]).includes('0.0.0'))

  if (broken.length > 0) {
    return {
      code: 'loom/doctor-package',
      status: 'fail',
      message: `Broken Loom package versions: ${broken.join(', ')}.`,
      suggestion: 'Install compatible Loom packages and rerun the build.',
    }
  }

  if (loomPackages.length === 0) {
    return {
      code: 'loom/doctor-package',
      status: 'warn',
      message: 'No Loom package dependencies found.',
      suggestion: 'Install vite-plugin-loom or @loom-ui/compiler before compiling .loom files.',
    }
  }

  return {
    code: 'loom/doctor-package',
    status: 'pass',
    message: `Found Loom packages: ${loomPackages.join(', ')}.`,
  }
}

function checkBundlerConfig(root: string, fs: DoctorFs): DoctorCheck {
  const configNames = ['vite.config.ts', 'vite.config.js', 'vite.config.mts', 'vite.config.mjs']
  const configPath = configNames.map((name) => join(root, name)).find(fs.exists)

  if (!configPath) {
    return {
      code: 'loom/doctor-bundler',
      status: 'warn',
      message: 'No Vite config found.',
      suggestion: 'Add vite-plugin-loom to your bundler config.',
    }
  }

  const config = fs.readFile(configPath, 'utf8')
  if (!config.includes('vite-plugin-loom') && !config.includes('loom(')) {
    return {
      code: 'loom/doctor-bundler',
      status: 'fail',
      message: 'Vite config does not appear to register vite-plugin-loom.',
      suggestion: 'Import loom from vite-plugin-loom and add loom({ target }) to plugins.',
    }
  }

  return {
    code: 'loom/doctor-bundler',
    status: 'pass',
    message: 'Vite config registers the Loom plugin.',
  }
}

function checkRustBridge(root: string, fs: DoctorFs): DoctorCheck {
  const packagePath = join(root, 'node_modules', 'loom_core', 'package.json')
  const workspacePath = join(root, 'packages', 'loom_core', 'package.json')

  if (fs.exists(packagePath) || fs.exists(workspacePath)) {
    return {
      code: 'loom/doctor-rust-bridge',
      status: 'pass',
      message: 'loom_core package is available for NAPI/WASM fallback checks.',
    }
  }

  return {
    code: 'loom/doctor-rust-bridge',
    status: 'warn',
    message: 'loom_core package not found.',
    suggestion: 'Install loom_core or rely on the TypeScript parser fallback.',
  }
}

function checkGeneratedArtifacts(root: string, fs: DoctorFs): DoctorCheck {
  const stale = findStaleGeneratedArtifacts(root, fs)
  if (stale.length > 0) {
    return {
      code: 'loom/doctor-artifacts',
      status: 'warn',
      message: `Potential stale generated artifacts: ${stale.slice(0, 5).join(', ')}.`,
      suggestion: 'Regenerate or delete generated files before publishing.',
    }
  }

  return {
    code: 'loom/doctor-artifacts',
    status: 'pass',
    message: 'No stale generated artifacts detected.',
  }
}

function findStaleGeneratedArtifacts(root: string, fs: DoctorFs): string[] {
  const stale: string[] = []
  walk(root, fs, (file) => {
    if (!file.endsWith('.loom')) return
    const loomTime = fs.stat(file).mtimeMs
    for (const ext of ['.tsx', '.jsx', '.vue', '.svelte']) {
      const generated = file.replace(/\.loom$/, ext)
      if (fs.exists(generated) && fs.stat(generated).mtimeMs < loomTime) {
        stale.push(generated.slice(root.length + 1))
      }
    }
  })
  return stale
}

function walk(root: string, fs: DoctorFs, visit: (file: string) => void): void {
  if (!fs.exists(root)) return
  for (const entry of fs.readDir(root)) {
    if (entry === 'node_modules' || entry === '.git' || entry === 'dist' || entry === '.output') continue
    const file = join(root, entry)
    const meta = fs.stat(file)
    if (meta.isDirectory()) {
      walk(file, fs, visit)
    } else {
      visit(file)
    }
  }
}

function formatDoctorReport(report: DoctorReport): string {
  const lines = [`Loom doctor: ${report.root}`]
  for (const check of report.checks) {
    const marker = check.status === 'pass' ? 'ok' : check.status
    lines.push(`[${marker}] ${check.code}: ${check.message}`)
    if (check.suggestion) lines.push(`  fix: ${check.suggestion}`)
  }
  lines.push(`Summary: ${report.summary.passed} passed, ${report.summary.warnings} warnings, ${report.summary.errors} errors`)
  return `${lines.join('\n')}\n`
}

export function defaultWatchFile(path: string, callback: () => void) {
  return watch(path, callback)
}

function defaultIo(): CliIo {
  return {
    stdout: (value: string) => process.stdout.write(value),
    stderr: (value: string) => process.stderr.write(value),
    exit: (code: number) => process.exit(code),
  }
}

const isEntrypoint =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
if (isEntrypoint) {
  runCli(process.argv)
}
