import { describe, expect, it } from 'vitest'
import { compile } from '../src/index.js'

type RawSourceMap = {
  mappings: string
  sources: string[]
  sourcesContent?: string[]
}

type DecodedMapping = {
  genLine: number
  genCol: number
  srcLine: number
  srcCol: number
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const BASE64_LOOKUP = new Map(BASE64.split('').map((char, index) => [char, index]))

function decodeMappings(map: RawSourceMap): DecodedMapping[] {
  const mappings: DecodedMapping[] = []
  let prevSrcLine = 0
  let prevSrcCol = 0

  map.mappings.split(';').forEach((line, genLine) => {
    if (!line) return
    let prevGenCol = 0

    for (const segment of line.split(',')) {
      const values = decodeSegment(segment)
      if (values.length < 4) continue

      prevGenCol += values[0]!
      prevSrcLine += values[2]!
      prevSrcCol += values[3]!

      mappings.push({
        genLine,
        genCol: prevGenCol,
        srcLine: prevSrcLine,
        srcCol: prevSrcCol,
      })
    }
  })

  return mappings
}

function decodeSegment(segment: string): number[] {
  const values: number[] = []
  let index = 0

  while (index < segment.length) {
    let shift = 0
    let value = 0

    while (true) {
      const digit = BASE64_LOOKUP.get(segment[index++]!)
      if (digit === undefined) throw new Error(`Invalid source map segment: ${segment}`)

      value += (digit & 0x1f) << shift
      shift += 5
      if ((digit & 0x20) === 0) break
    }

    const negative = (value & 1) === 1
    value >>= 1
    values.push(negative ? -value : value)
  }

  return values
}

function generatedLineFor(code: string, needle: string): number {
  const index = code.split('\n').findIndex((line) => line.includes(needle))
  if (index === -1) throw new Error(`Could not find generated line containing ${needle}`)
  return index
}

function mappingForGeneratedLine(mappings: DecodedMapping[], genLine: number): DecodedMapping {
  const mapping = mappings.find((candidate) => candidate.genLine === genLine)
  if (!mapping) throw new Error(`No source map mapping for generated line ${genLine + 1}`)
  return mapping
}

describe('source maps', () => {
  it('maps React markup lines back to their original Loom source lines', () => {
    const source = `- ts
  const show = true
- pug
section
  button Save
  if show
    p Visible`

    const result = compile(source, {
      componentName: 'MapTest',
      target: 'react',
      sourceFile: 'App.loom',
    })

    const map = JSON.parse(result.map ?? '{}') as RawSourceMap
    const mappings = decodeMappings(map)

    expect(map.sources).toEqual(['App.loom'])
    expect(map.sourcesContent?.[0]).toBe(source)
    expect(
      mappingForGeneratedLine(mappings, generatedLineFor(result.code, '<section>')).srcLine,
    ).toBe(3)
    expect(
      mappingForGeneratedLine(mappings, generatedLineFor(result.code, '<button>')).srcLine,
    ).toBe(4)
    expect(
      mappingForGeneratedLine(mappings, generatedLineFor(result.code, '{show ? (')).srcLine,
    ).toBe(5)
    expect(mappingForGeneratedLine(mappings, generatedLineFor(result.code, '<p>')).srcLine).toBe(6)
  })
})
