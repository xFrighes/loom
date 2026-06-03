import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

export type CodemodConversionKind = 'html' | 'jsx'

export type CodemodExecutionResult = {
  stdout: string
  stderr: string
}

export type CodemodRunner = (
  command: string,
  args: string[],
) => Promise<CodemodExecutionResult>

export type CodemodSnippetOptions = {
  codemodPath: string
  source: string
  from: CodemodConversionKind
  runner?: CodemodRunner
}

export type EditorConversionResult =
  | { ok: true; source: string; warningSummary?: string }
  | { ok: false; error: string }

const execFileAsync = promisify(execFile)

export async function convertSnippetForEditor(options: CodemodSnippetOptions): Promise<EditorConversionResult> {
  try {
    const conversion = await convertSnippetWithCodemod(options)
    return { ok: true, ...conversion }
  } catch (error) {
    return { ok: false, error: readActionableError(error) }
  }
}

export async function convertSnippetWithCodemod(options: CodemodSnippetOptions): Promise<{ source: string; warningSummary?: string }> {
  const runner = options.runner ?? runCodemod
  const tempDir = await mkdtemp(path.join(tmpdir(), 'loom-codemod-'))
  const sourcePath = path.join(tempDir, `Snippet${options.from === 'html' ? '.html' : '.tsx'}`)

  try {
    await writeFile(sourcePath, options.source)
    const { stdout, stderr } = await runner(options.codemodPath, buildCodemodArgs(sourcePath, options.from))
    const warningSummary = summarizeCodemodWarnings(stderr)
    return {
      source: normalizeCodemodStdout(stdout),
      ...(warningSummary ? { warningSummary } : {}),
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

export function buildCodemodArgs(sourcePath: string, from: CodemodConversionKind): string[] {
  return [sourcePath, '--from', from, '--stdout']
}

export function summarizeCodemodWarnings(stderr: string): string | undefined {
  const lines = stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.toLowerCase().includes('[warning]'))

  if (lines.length === 0) return undefined
  if (lines.length === 1) return lines[0]
  return `${lines[0]} (+${lines.length - 1} more)`
}

export function readActionableError(error: unknown): string {
  const stderr = readErrorProperty(error, 'stderr')
  const firstStderrLine = stderr
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0)
  if (firstStderrLine) return firstStderrLine

  if (error instanceof Error && error.message) return error.message
  return String(error)
}

function normalizeCodemodStdout(stdout: string): string {
  if (stdout.endsWith('\r\n')) return stdout.slice(0, -2)
  if (stdout.endsWith('\n')) return stdout.slice(0, -1)
  return stdout
}

function readErrorProperty(error: unknown, key: 'stderr'): string | undefined {
  if (!error || typeof error !== 'object' || !(key in error)) return undefined
  const value = (error as Record<typeof key, unknown>)[key]
  return typeof value === 'string' ? value : undefined
}

async function runCodemod(command: string, args: string[]): Promise<CodemodExecutionResult> {
  const { stdout, stderr } = await execFileAsync(command, args, { encoding: 'utf8' })
  return {
    stdout: String(stdout),
    stderr: String(stderr),
  }
}
