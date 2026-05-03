type RawSourceMap = {
  version: number
  sources: string[]
  sourcesContent?: string[]
  names: string[]
  mappings: string
}

type MappingSegment = {
  genLine: number
  genCol: number
  srcLine: number
  srcCol: number
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const BASE64_LOOKUP = new Map(BASE64.split('').map((char, index) => [char, index]))

export function normalizeSourceMap(
  map: string | RawSourceMap | null | undefined,
): RawSourceMap | null {
  if (!map) return null
  if (typeof map === 'string') return JSON.parse(map) as RawSourceMap
  return map
}

export function composeSourceMaps(
  generatedMap: string | RawSourceMap | null | undefined,
  originalMap: string | RawSourceMap | null | undefined,
): RawSourceMap | null {
  const outer = normalizeSourceMap(generatedMap)
  const inner = normalizeSourceMap(originalMap)

  if (!outer && !inner) return null
  if (!outer) return inner
  if (!inner) return outer

  const outerSegments = decodeMappings(outer)
  const innerByLine = groupMappingsByLine(decodeMappings(inner))
  const composed: MappingSegment[] = []

  for (const segment of outerSegments) {
    const innerMatch = findBestInnerMapping(innerByLine.get(segment.srcLine) ?? [], segment.srcCol)
    if (!innerMatch) continue

    const columnDelta = Math.max(segment.srcCol - innerMatch.genCol, 0)
    composed.push({
      genLine: segment.genLine,
      genCol: segment.genCol,
      srcLine: innerMatch.srcLine,
      srcCol: innerMatch.srcCol + columnDelta,
    })
  }

  return {
    version: 3,
    sources: inner.sources,
    sourcesContent: inner.sourcesContent,
    names: inner.names ?? [],
    mappings: encodeMappings(composed),
  }
}

function groupMappingsByLine(segments: MappingSegment[]): Map<number, MappingSegment[]> {
  const byLine = new Map<number, MappingSegment[]>()
  for (const segment of segments) {
    const line = byLine.get(segment.genLine)
    if (line) {
      line.push(segment)
    } else {
      byLine.set(segment.genLine, [segment])
    }
  }
  return byLine
}

function findBestInnerMapping(line: MappingSegment[], srcCol: number): MappingSegment | null {
  if (line.length === 0) return null
  let best = line[0]!
  for (const segment of line) {
    if (segment.genCol > srcCol) break
    best = segment
  }
  return best
}

function decodeMappings(map: RawSourceMap): MappingSegment[] {
  const lines = map.mappings.split(';')
  const decoded: MappingSegment[] = []

  let prevSrcLine = 0
  let prevSrcCol = 0

  for (let genLine = 0; genLine < lines.length; genLine += 1) {
    const line = lines[genLine]!
    if (!line) continue

    let prevGenCol = 0
    const segments = line.split(',')
    for (const segment of segments) {
      if (!segment) continue
      const values = decodeSegment(segment)
      if (values.length < 4) continue

      prevGenCol += values[0]!
      prevSrcLine += values[2]!
      prevSrcCol += values[3]!

      decoded.push({
        genLine,
        genCol: prevGenCol,
        srcLine: prevSrcLine,
        srcCol: prevSrcCol,
      })
    }
  }

  return decoded
}

function decodeSegment(segment: string): number[] {
  const values: number[] = []
  let index = 0

  while (index < segment.length) {
    let shift = 0
    let value = 0

    while (true) {
      const char = segment[index]
      if (!char) throw new Error(`Invalid source map segment: ${segment}`)
      index += 1

      const digit = BASE64_LOOKUP.get(char)
      if (digit === undefined) throw new Error(`Invalid VLQ digit: ${char}`)

      const continuation = (digit & 0x20) !== 0
      value += (digit & 0x1f) << shift
      shift += 5

      if (!continuation) break
    }

    const negative = (value & 1) === 1
    value >>= 1
    values.push(negative ? -value : value)
  }

  return values
}

function encodeMappings(segments: MappingSegment[]): string {
  if (segments.length === 0) return ''

  const sorted = [...segments].sort((a, b) =>
    a.genLine !== b.genLine ? a.genLine - b.genLine : a.genCol - b.genCol,
  )

  const maxLine = sorted[sorted.length - 1]!.genLine
  const byLine: MappingSegment[][] = Array.from({ length: maxLine + 1 }, () => [])
  for (const segment of sorted) {
    byLine[segment.genLine]!.push(segment)
  }

  let prevSrcLine = 0
  let prevSrcCol = 0
  const lineMappings: string[] = []

  for (let genLine = 0; genLine <= maxLine; genLine += 1) {
    const line = byLine[genLine]!
    if (line.length === 0) {
      lineMappings.push('')
      continue
    }

    let prevGenCol = 0
    const encodedLine: string[] = []

    for (const segment of line) {
      encodedLine.push(
        encodeVlqInt(segment.genCol - prevGenCol) +
          encodeVlqInt(0) +
          encodeVlqInt(segment.srcLine - prevSrcLine) +
          encodeVlqInt(segment.srcCol - prevSrcCol),
      )

      prevGenCol = segment.genCol
      prevSrcLine = segment.srcLine
      prevSrcCol = segment.srcCol
    }

    lineMappings.push(encodedLine.join(','))
  }

  return lineMappings.join(';')
}

function encodeVlqInt(value: number): string {
  let current = value < 0 ? (-value << 1) | 1 : value << 1
  let encoded = ''

  do {
    let digit = current & 0x1f
    current >>>= 5
    if (current > 0) digit |= 0x20
    encoded += BASE64[digit]
  } while (current > 0)

  return encoded
}
