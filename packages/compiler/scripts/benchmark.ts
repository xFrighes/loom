import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  generateBenchmarkReport,
  renderBenchmarkJson,
  renderBenchmarkMarkdown,
} from '../src/benchmark-dashboard.js'

const args = process.argv.slice(2)
const iterations = Number(readFlag('--iterations') ?? 100)
const format = readFlag('--format') ?? 'markdown'
const outputPath = readFlag('--output')

const report = generateBenchmarkReport({ iterations })
const output = format === 'json'
  ? renderBenchmarkJson(report)
  : renderBenchmarkMarkdown(report)

if (outputPath) {
  const resolved = resolve(process.cwd(), outputPath)
  mkdirSync(dirname(resolved), { recursive: true })
  writeFileSync(resolved, output, 'utf8')
} else {
  process.stdout.write(output)
}

function readFlag(name: string): string | undefined {
  const index = args.indexOf(name)
  if (index === -1) return undefined
  return args[index + 1]
}
