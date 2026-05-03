import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const ignoredDirectories = new Set(['.git', '.loom-llm', 'dist', 'node_modules', 'coverage'])
const checkedExtensions = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.json',
  '.md',
  '.loom',
  '.yml',
  '.yaml',
])
const failures = []

for (const file of walk(root)) {
  const relative = path.relative(root, file).split(path.sep).join('/')
  if (relative === 'TODO2.md') continue
  if (/timestamp-\d+-[a-f0-9]+\.mjs$/.test(relative)) {
    failures.push(`${relative}: generated timestamp artifact must not be committed`)
    continue
  }

  if (!checkedExtensions.has(path.extname(file))) continue
  const text = readFileSync(file, 'utf8')
  const lines = text.split('\n')

  lines.forEach((line, index) => {
    if (/[ \t]+$/.test(line)) {
      failures.push(`${relative}:${index + 1}: trailing whitespace`)
    }
  })

  if (text.length > 0 && !text.endsWith('\n')) {
    failures.push(`${relative}: missing final newline`)
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exit(1)
}

function walk(directory) {
  const files = []

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name)) continue
      files.push(...walk(path.join(directory, entry.name)))
      continue
    }

    if (entry.isFile()) {
      files.push(path.join(directory, entry.name))
    }
  }

  return files
}
