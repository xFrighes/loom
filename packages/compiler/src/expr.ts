function scanTopLevel(str: string, onTopLevel: (char: string, index: number) => boolean): number {
  let depthParen = 0
  let depthBracket = 0
  let depthBrace = 0
  let quote: '"' | "'" | '`' | null = null
  let escaped = false

  for (let i = 0; i < str.length; i++) {
    const char = str[i]

    if (quote) {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === '\\') {
        escaped = true
        continue
      }
      if (char === quote) {
        quote = null
      }
      continue
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char
      continue
    }

    if (char === '(') depthParen++
    else if (char === ')') depthParen = Math.max(0, depthParen - 1)
    else if (char === '[') depthBracket++
    else if (char === ']') depthBracket = Math.max(0, depthBracket - 1)
    else if (char === '{') depthBrace++
    else if (char === '}') depthBrace = Math.max(0, depthBrace - 1)

    if (depthParen === 0 && depthBracket === 0 && depthBrace === 0 && onTopLevel(char, i)) {
      return i
    }
  }

  return -1
}

export function findTopLevelWhitespace(str: string): number {
  return scanTopLevel(str, (char) => /\s/.test(char))
}

export function findTopLevelEquals(str: string): number {
  return scanTopLevel(
    str,
    (char, index) =>
      char === '=' &&
      str[index + 1] !== '=' &&
      str[index - 1] !== '!' &&
      str[index - 1] !== '<' &&
      str[index - 1] !== '>',
  )
}

export function unwrapBalancedBraces(str: string): string | null {
  const trimmed = str.trim()
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null

  let depth = 0
  let quote: '"' | "'" | '`' | null = null
  let escaped = false

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i]

    if (quote) {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === '\\') {
        escaped = true
        continue
      }
      if (char === quote) {
        quote = null
      }
      continue
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char
      continue
    }

    if (char === '{') depth++
    else if (char === '}') depth--

    if (depth === 0 && i < trimmed.length - 1) {
      return null
    }
  }

  return depth === 0 ? trimmed.slice(1, -1).trim() : null
}
