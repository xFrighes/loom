import { performance } from 'node:perf_hooks'
import { compile } from './index.js'
import type { CompileOptions } from './index.js'

export type BenchmarkTarget = CompileOptions['target']

export type BenchmarkMetric = {
  target: BenchmarkTarget
  loomCompileMs: number
  handwrittenEmitMs: number
  outputBytes: number
  handwrittenBytes: number
  rebuildMs: number
}

export type BenchmarkReport = {
  generatedAt: string
  iterations: number
  metrics: BenchmarkMetric[]
}

export type BenchmarkOptions = {
  iterations?: number
  now?: () => Date
  clock?: () => number
}

const source = `- props
  title: string = "Revenue"
  value: string = "$42.8k"
  trend: string = "+12%"

- pug
section.card
  ::
    border 1px solid #d0d7de
    border-radius 8px
    padding 24px
  header
    h1 {title}
    span {trend}
  strong {value}
  p Updated from workspace analytics.
`

const handwritten: Record<BenchmarkTarget, string> = {
  react: `export function Card({ title = "Revenue", value = "$42.8k", trend = "+12%" }) {
  return <section className="card"><header><h1>{title}</h1><span>{trend}</span></header><strong>{value}</strong><p>Updated from workspace analytics.</p></section>
}`,
  vue: `<template>
  <section class="card"><header><h1>{{ title || 'Revenue' }}</h1><span>{{ trend || '+12%' }}</span></header><strong>{{ value || '$42.8k' }}</strong><p>Updated from workspace analytics.</p></section>
</template>`,
  svelte: `<section class="card"><header><h1>{title}</h1><span>{trend}</span></header><strong>{value}</strong><p>Updated from workspace analytics.</p></section>`,
}

export function generateBenchmarkReport(options: BenchmarkOptions = {}): BenchmarkReport {
  const iterations = options.iterations ?? 100
  const clock = options.clock ?? (() => performance.now())
  const now = options.now ?? (() => new Date())

  return {
    generatedAt: now().toISOString(),
    iterations,
    metrics: (['react', 'vue', 'svelte'] as BenchmarkTarget[]).map((target) => {
      const loomCompileMs = measure(clock, iterations, (index) => {
        compile(source, { componentName: `Bench${index}`, target })
      })
      const handwrittenEmitMs = measure(clock, iterations, () => {
        String(handwritten[target])
      })
      const output = compile(source, { componentName: 'Bench', target })
      const rebuildMs = measure(clock, iterations, (index) => {
        compile(source.replace('$42.8k', `$${42 + index}.8k`), { componentName: 'Bench', target })
      })

      return {
        target,
        loomCompileMs,
        handwrittenEmitMs,
        outputBytes: byteSize(output.code + (output.css ?? '')),
        handwrittenBytes: byteSize(handwritten[target]),
        rebuildMs,
      }
    }),
  }
}

export function renderBenchmarkMarkdown(report: BenchmarkReport): string {
  const rows = report.metrics.map((metric) => [
    metric.target,
    metric.loomCompileMs.toFixed(2),
    metric.handwrittenEmitMs.toFixed(2),
    String(metric.outputBytes),
    String(metric.handwrittenBytes),
    metric.rebuildMs.toFixed(2),
  ].join('|'))

  return [
    '# Loom Benchmark Dashboard',
    '',
    `Generated: ${report.generatedAt}`,
    `Iterations: ${report.iterations}`,
    '',
    'target|compile_ms|handwritten_emit_ms|output_bytes|handwritten_bytes|rebuild_ms',
    '---|---:|---:|---:|---:|---:',
    ...rows,
    '',
  ].join('\n')
}

export function renderBenchmarkJson(report: BenchmarkReport): string {
  return `${JSON.stringify(report, null, 2)}\n`
}

function measure(clock: () => number, iterations: number, run: (index: number) => void): number {
  const start = clock()
  for (let index = 0; index < iterations; index += 1) {
    run(index)
  }
  return clock() - start
}

function byteSize(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}
