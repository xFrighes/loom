import { describe, expect, it } from 'vitest'
import {
  generateBenchmarkReport,
  renderBenchmarkJson,
  renderBenchmarkMarkdown,
} from '../src/benchmark-dashboard.js'

describe('benchmark dashboard', () => {
  it('generates speed, size, and rebuild metrics for all targets', () => {
    let tick = 0
    const report = generateBenchmarkReport({
      iterations: 2,
      now: () => new Date('2026-05-06T00:00:00.000Z'),
      clock: () => tick++,
    })

    expect(report.generatedAt).toBe('2026-05-06T00:00:00.000Z')
    expect(report.metrics.map((metric) => metric.target)).toEqual(['react', 'vue', 'svelte'])
    for (const metric of report.metrics) {
      expect(metric.loomCompileMs).toBeGreaterThan(0)
      expect(metric.handwrittenEmitMs).toBeGreaterThan(0)
      expect(metric.outputBytes).toBeGreaterThan(0)
      expect(metric.handwrittenBytes).toBeGreaterThan(0)
      expect(metric.rebuildMs).toBeGreaterThan(0)
    }
  })

  it('renders markdown and json dashboard outputs', () => {
    let tick = 0
    const report = generateBenchmarkReport({
      iterations: 1,
      now: () => new Date('2026-05-06T00:00:00.000Z'),
      clock: () => tick++,
    })

    expect(renderBenchmarkMarkdown(report)).toContain('target|compile_ms|handwritten_emit_ms|output_bytes|handwritten_bytes|rebuild_ms')
    expect(JSON.parse(renderBenchmarkJson(report)).metrics).toHaveLength(3)
  })
})
