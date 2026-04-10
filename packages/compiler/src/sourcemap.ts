/**
 * Minimal VLQ source-map builder.
 *
 * Generates a v3 source map that maps each generated line back to the
 * corresponding Loom source position. Character-level precision within a line
 * is provided for the first mapped segment on each line; the rest of the line
 * inherits that mapping in most editors.
 *
 * The implementation intentionally avoids external dependencies. It covers the
 * common case (single-source file) and does not support multi-source maps or
 * the `names` array.
 */

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Encode a single signed VLQ integer. */
function encodeVlqInt(n: number): string {
  // Transform to VLQ signed representation: positive n → 2n, negative n → (-2n-1) = 2|n|+1
  let v = n < 0 ? (-n << 1) | 1 : n << 1
  let out = ''
  do {
    let digit = v & 0x1f
    v >>>= 5
    if (v > 0) digit |= 0x20 // set continuation bit
    out += BASE64[digit]
  } while (v > 0)
  return out
}

export type Mapping = {
  /** 0-based line number in the generated output */
  genLine: number
  /** 0-based column in the generated output */
  genCol: number
  /** 0-based line number in the original source */
  srcLine: number
  /** 0-based column in the original source */
  srcCol: number
}

/** Build a v3 source map JSON string from a list of mappings. */
export function buildSourceMap(
  sourceFile: string,
  sourceContent: string,
  mappings: Mapping[],
): string {
  if (mappings.length === 0) {
    return JSON.stringify({
      version: 3,
      sources: [sourceFile],
      sourcesContent: [sourceContent],
      names: [],
      mappings: '',
    })
  }

  // Group mappings by generated line, sorted by genLine/genCol
  const sorted = [...mappings].sort((a, b) =>
    a.genLine !== b.genLine ? a.genLine - b.genLine : a.genCol - b.genCol,
  )

  const maxLine = sorted[sorted.length - 1].genLine
  const byLine: Mapping[][] = Array.from({ length: maxLine + 1 }, () => [])
  for (const m of sorted) byLine[m.genLine].push(m)

  let prevSrcLine = 0
  let prevSrcCol = 0

  const lineMappings: string[] = []
  for (let line = 0; line <= maxLine; line++) {
    const segs = byLine[line]
    if (!segs || segs.length === 0) {
      lineMappings.push('')
      continue
    }

    let prevGenCol = 0
    const segStrs: string[] = []

    for (const m of segs) {
      const genColDelta = m.genCol - prevGenCol
      const srcLineDelta = m.srcLine - prevSrcLine
      const srcColDelta = m.srcCol - prevSrcCol

      segStrs.push(
        encodeVlqInt(genColDelta) +
          encodeVlqInt(0) + // source file index delta (always 0, single source)
          encodeVlqInt(srcLineDelta) +
          encodeVlqInt(srcColDelta),
      )

      prevGenCol = m.genCol
      prevSrcLine = m.srcLine
      prevSrcCol = m.srcCol
    }

    lineMappings.push(segStrs.join(','))
  }

  return JSON.stringify({
    version: 3,
    sources: [sourceFile],
    sourcesContent: [sourceContent],
    names: [],
    mappings: lineMappings.join(';'),
  })
}

/**
 * Tracks the current output position while a codegen target emits lines.
 * Call `addLine(node)` for each line emitted to record its source origin.
 */
export class SourceMapTracker {
  private mappings: Mapping[] = []
  private currentLine = 0

  /** Record that the next emitted line originates from the given 1-based source position. */
  map(srcLine1Based: number, srcCol1Based: number, genCol = 0): void {
    this.mappings.push({
      genLine: this.currentLine,
      genCol,
      srcLine: srcLine1Based - 1,
      srcCol: srcCol1Based - 1,
    })
  }

  /** Advance the tracker by `n` lines (call after emitting code). */
  advance(n: number): void {
    this.currentLine += n
  }

  /** Build the final source map from accumulated mappings. */
  build(sourceFile: string, sourceContent: string): string {
    return buildSourceMap(sourceFile, sourceContent, this.mappings)
  }
}

/** Count newlines in a string. */
export function lineCount(s: string): number {
  let count = 0
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\n') count++
  }
  return count
}
