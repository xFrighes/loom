#!/usr/bin/env node
import { readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createUnifiedDiff } from './diff.js'
import {
  ensureProjectionForPath,
  formatDiagnostics,
  indexWorkspace,
  verifyWorkspace,
} from './indexer.js'
import { applyPatchBundleToFile, previewApplyPatchBundle } from './patch/apply.js'
import { readPatchBundleFromFile } from './patch/ops.js'
import { renderLoomProjection } from './projector/loom.js'
import type { ProjectionFormat, ProjectionMode } from './types.js'

type CliIo = {
  stdout(value: string): void
  stderr(value: string): void
  exit?(code: number): void
}

export function runCli(argv: string[], io = defaultIo()): number {
  const args = argv.slice(2)
  const command = args[0]
  const parsed = parseArgs(args.slice(1))
  const root = flagValue(parsed.flags, '--root')
  const cacheDir = flagValue(parsed.flags, '--cache-dir')
  const jsonMode = parsed.flags.has('--json')

  const fail = (message: string) => {
    if (jsonMode) {
      io.stderr(`${JSON.stringify({ error: message })}\n`)
    } else {
      io.stderr(`${message}\n`)
    }
    io.exit?.(1)
    return 1
  }

  try {
    switch (command) {
      case 'index': {
        const result = indexWorkspace({ root, cacheDir, inputs: parsed.positionals })
        if (jsonMode) {
          io.stdout(`${JSON.stringify(result, null, 2)}\n`)
        } else {
          io.stdout(`indexed=${result.indexed} reused=${result.reused} removed=${result.removed}\n`)
        }
        return 0
      }

      case 'show': {
        const input = parsed.positionals[0]
        if (!input)
          return fail('Usage: loom-llm show <file.loom> --mode index|outline|edit [--format markdown|caveman|ultra] [--blocks id1,id2]')
        const mode = parseMode(flagValue(parsed.flags, '--mode') ?? 'outline')
        const format = parseFormat(flagValue(parsed.flags, '--format') ?? (parsed.flags.has('--ultra') ? 'ultra' : 'markdown'))
        if (!mode) return fail('Invalid --mode. Expected index, outline, or edit.')
        if (!format) return fail('Invalid --format. Expected markdown, caveman, or ultra.')
        const blocks = splitCsv(flagValue(parsed.flags, '--blocks'))
        const projection = ensureProjectionForPath({ root, cacheDir, input })
        const rendered = renderLoomProjection(projection, mode, { blocks, format })
        if (jsonMode) {
          io.stdout(`${JSON.stringify({ projection, rendered }, null, 2)}\n`)
        } else {
          io.stdout(`${rendered}\n`)
        }
        return 0
      }

      case 'apply': {
        const input = parsed.positionals[0]
        const opsPath = flagValue(parsed.flags, '--ops')
        if (!input || !opsPath)
          return fail('Usage: loom-llm apply <file.loom> --ops <patch.json> [--force]')
        const bundle = readPatchBundleFromFile(resolvePath(root, opsPath))
        if (!bundle) return fail(`Failed to read or parse patch bundle: ${opsPath}`)

        const hasExecutableLogic = bundle.ops.some((op) => {
          if (op.op === 'replace-block') return op.lang === 'ts' || op.lang === 'js' || op.blockId.startsWith('logic:') || op.blockId.startsWith('markup:')
          if (op.op === 'insert-block-after') return op.blockKind === 'logic' || op.blockKind === 'markup' || op.lang === 'ts' || op.lang === 'js'
          if (op.op === 'replace-node' || op.op === 'delete-node') return true // Nodes can have behaviors/logic
          return false
        })

        if (hasExecutableLogic) {
          io.stderr('╔══════════════════════════════════════════════════════════════════════════════╗\n')
          io.stderr('║ SECURITY WARNING: This patch contains executable logic or raw DOM nodes.      ║\n')
          io.stderr('║ It requires careful human review before execution.                           ║\n')
          io.stderr('╚══════════════════════════════════════════════════════════════════════════════╝\n')
        }

        const filePath = resolvePath(root, input)
        const result = applyPatchBundleToFile(filePath, bundle, {
          force: parsed.flags.has('--force'),
        })
        if (jsonMode) {
          io.stdout(
            `${JSON.stringify({ file: filePath, verification: result.verification }, null, 2)}\n`,
          )
        } else {
          io.stdout(`applied ${path.relative(process.cwd(), filePath)}\n`)
        }
        return 0
      }

      case 'diff': {
        const input = parsed.positionals[0]
        if (!input)
          return fail('Usage: loom-llm diff <file.loom> [--ops <patch.json> | --mode index|outline|edit --format markdown|caveman|ultra]')
        const filePath = resolvePath(root, input)
        const source = readFileSync(filePath, 'utf8')
        const opsPath = flagValue(parsed.flags, '--ops')
        let diff = ''

        if (opsPath) {
          const bundle = readPatchBundleFromFile(resolvePath(root, opsPath))
          if (!bundle) return fail(`Failed to read or parse patch bundle: ${opsPath}`)
          const preview = previewApplyPatchBundle(source, filePath, bundle, {
            force: parsed.flags.has('--force'),
          })
          diff = createUnifiedDiff(source, preview.nextSource, input, `${input} (patched)`)
        } else {
          const mode = parseMode(flagValue(parsed.flags, '--mode') ?? 'outline')
          const format = parseFormat(flagValue(parsed.flags, '--format') ?? (parsed.flags.has('--ultra') ? 'ultra' : 'markdown'))
          if (!mode) return fail('Invalid --mode. Expected index, outline, or edit.')
          if (!format) return fail('Invalid --format. Expected markdown, caveman, or ultra.')
          const blocks = splitCsv(flagValue(parsed.flags, '--blocks'))
          const projection = ensureProjectionForPath({ root, cacheDir, input })
          diff = createUnifiedDiff(
            source,
            renderLoomProjection(projection, mode, { blocks, format }),
            input,
            `${input} (${mode}:${format})`,
          )
        }

        if (jsonMode) {
          io.stdout(`${JSON.stringify({ diff }, null, 2)}\n`)
        } else {
          io.stdout(`${diff || '(no diff)'}\n`)
        }
        return 0
      }

      case 'verify': {
        const results = verifyWorkspace({ root, inputs: parsed.positionals })
        const hasFailures = results.some((result) => !result.ok)
        if (jsonMode) {
          io.stdout(`${JSON.stringify({ ok: !hasFailures, results }, null, 2)}\n`)
        } else {
          for (const result of results) {
            io.stdout(`${result.ok ? 'OK' : 'FAIL'} ${result.sourcePath}\n`)
            for (const line of formatDiagnostics(result.diagnostics)) {
              io.stderr(`  ${line}\n`)
            }
            for (const target of result.targets) {
              if (!target.ok) io.stderr(`  ${target.target}: ${target.error}\n`)
            }
          }
        }
        if (hasFailures) {
          io.exit?.(1)
          return 1
        }
        return 0
      }

      default:
        return fail('Usage: loom-llm <index|show|apply|diff|verify> [...]')
    }
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error))
  }
}

function parseArgs(argv: string[]) {
  const positionals: string[] = []
  const flags = new Map<string, string | true>()

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!
    if (!arg.startsWith('--')) {
      positionals.push(arg)
      continue
    }

    const next = argv[index + 1]
    if (next && !next.startsWith('--')) {
      flags.set(arg, next)
      index += 1
    } else {
      flags.set(arg, true)
    }
  }

  return { positionals, flags }
}

function flagValue(flags: Map<string, string | true>, name: string): string | undefined {
  const value = flags.get(name)
  return typeof value === 'string' ? value : undefined
}

function splitCsv(value?: string): string[] | undefined {
  if (!value) return undefined
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

function parseMode(value: string): ProjectionMode | undefined {
  return value === 'index' || value === 'outline' || value === 'edit' ? value : undefined
}

function parseFormat(value: string): ProjectionFormat | undefined {
  return value === 'markdown' || value === 'caveman' || value === 'ultra' ? value : undefined
}

function resolvePath(root: string | undefined, input: string): string {
  const workspaceRoot = path.resolve(root ?? process.cwd())
  const absolute = path.resolve(workspaceRoot, input)
  const relative = path.relative(workspaceRoot, absolute)
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    return absolute
  }
  throw new Error(`Path is outside the workspace root: ${input}`)
}

function defaultIo(): CliIo {
  return {
    stdout: (value: string) => process.stdout.write(value),
    stderr: (value: string) => process.stderr.write(value),
    exit: (code: number) => process.exit(code),
  }
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
  runCli(process.argv)
}
