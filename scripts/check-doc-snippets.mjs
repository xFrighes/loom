import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const compiler = await importCompiler()
const { CompileError, compile } = compiler

const docsRoot = path.join(process.cwd(), 'docs', 'migration')
const supportedTsLanguages = new Set(['typescript', 'ts', 'tsx'])

const failures = []
let checked = 0

for (const filePath of listMarkdownFiles(docsRoot)) {
  const source = readFileSync(filePath, 'utf8')
  const snippets = extractFencedBlocks(source)

  for (const snippet of snippets) {
    if (snippet.language === 'loom') {
      checkLoomSnippet(filePath, snippet)
    } else if (supportedTsLanguages.has(snippet.language) && snippet.code.includes('// @loom-doc-snippet')) {
      checkTypeScriptSnippet(filePath, snippet)
    }
  }
}

if (failures.length > 0) {
  console.error(`Doc snippet check failed with ${failures.length} issue(s):`)
  for (const failure of failures) {
    console.error(`\n${failure.location}\n${failure.message}`)
  }
  process.exit(1)
}

console.log(`Checked ${checked} migration doc snippet(s).`)

function listMarkdownFiles(directory) {
  const entries = readdirSync(directory)
  const files = []

  for (const entry of entries) {
    const fullPath = path.join(directory, entry)
    const stats = statSync(fullPath)

    if (stats.isDirectory()) {
      files.push(...listMarkdownFiles(fullPath))
    } else if (entry.endsWith('.md')) {
      files.push(fullPath)
    }
  }

  return files.sort()
}

function extractFencedBlocks(source) {
  const blocks = []
  const fencePattern = /^```([^\s`]*)[^\n]*\n([\s\S]*?)^```/gm
  let match

  while ((match = fencePattern.exec(source)) !== null) {
    const language = (match[1] ?? '').trim().toLowerCase()
    const code = match[2] ?? ''
    const line = source.slice(0, match.index).split('\n').length
    blocks.push({ language, code, line })
  }

  return blocks
}

function checkLoomSnippet(filePath, snippet) {
  checked++
  const target = targetForFile(filePath)

  try {
    compile(snippet.code, {
      componentName: componentNameForSnippet(filePath, snippet.line),
      target,
    })
  } catch (error) {
    failures.push({
      location: `${relative(filePath)}:${snippet.line}`,
      message: formatCompileError(error),
    })
  }
}

function checkTypeScriptSnippet(filePath, snippet) {
  checked++
  const isTsx = snippet.language === 'tsx'
  const result = ts.transpileModule(snippet.code, {
    compilerOptions: {
      jsx: isTsx ? ts.JsxEmit.ReactJSX : ts.JsxEmit.Preserve,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
      strict: true,
    },
    fileName: `snippet.${isTsx ? 'tsx' : 'ts'}`,
    reportDiagnostics: true,
  })

  const errors = (result.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  )

  if (errors.length > 0) {
    failures.push({
      location: `${relative(filePath)}:${snippet.line}`,
      message: errors.map(formatTsDiagnostic).join('\n'),
    })
  }
}

function targetForFile(filePath) {
  const basename = path.basename(filePath, '.md')
  if (basename === 'vue') return 'vue'
  if (basename === 'svelte') return 'svelte'
  return 'react'
}

function componentNameForSnippet(filePath, line) {
  const rawName = `${path.basename(filePath, '.md')}_${line}`
  return rawName.replace(/(^|_)([a-z])/g, (_match, prefix, char) => `${prefix}${char.toUpperCase()}`).replace(/[^A-Za-z0-9_]/g, '')
}

function formatCompileError(error) {
  if (error instanceof CompileError) {
    return error.diagnostics.map((diagnostic) => {
      const span = diagnostic.span
      const location = span ? `line ${span.start.line}, column ${span.start.column}` : 'unknown location'
      return `${diagnostic.code} at ${location}: ${diagnostic.message}`
    }).join('\n')
  }

  return error instanceof Error ? error.message : String(error)
}

function formatTsDiagnostic(diagnostic) {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
  if (!diagnostic.file || diagnostic.start === undefined) return `TS${diagnostic.code}: ${message}`

  const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
  return `TS${diagnostic.code} at line ${position.line + 1}, column ${position.character + 1}: ${message}`
}

function relative(filePath) {
  return path.relative(process.cwd(), filePath)
}

async function importCompiler() {
  try {
    return await import('@loom-kit/compiler')
  } catch (error) {
    if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error
    try {
      return await import('@loom-lang/compiler')
    } catch (fallbackError) {
      if (fallbackError?.code !== 'ERR_MODULE_NOT_FOUND') throw fallbackError
      return import(pathToFileURL(path.join(process.cwd(), 'packages', 'compiler', 'dist', 'index.js')).href)
    }
  }
}
