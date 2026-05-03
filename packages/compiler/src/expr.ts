function scanLogic(str: string, onTopLevel?: (char: string, index: number) => boolean): { depth: number, index: number } {
  let depthParen = 0
  let depthBracket = 0
  let depthBrace = 0
  const quoteStack: Array<'"' | "'" | '`' | '${'> = []
  let escaped = false

  for (let i = 0; i < str.length; i++) {
    const char = str[i]
    const quote = quoteStack[quoteStack.length - 1]

    if (quote === '"' || quote === "'" || quote === '`') {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === '\\') {
        escaped = true
        continue
      }
      if (char === quote) {
        quoteStack.pop()
      } else if (quote === '`' && char === '$' && str[i + 1] === '{') {
        quoteStack.push('${')
        i++
      }
      continue
    }

    if (char === '"' || char === "'" || char === '`') {
      quoteStack.push(char)
      continue
    }

    if (char === '(') depthParen++
    else if (char === ')') depthParen = Math.max(0, depthParen - 1)
    else if (char === '[') depthBracket++
    else if (char === ']') depthBracket = Math.max(0, depthBracket - 1)
    else if (char === '{') {
      depthBrace++
    } else if (char === '}') {
      if (depthBrace === 0 && quote === '${') {
        quoteStack.pop()
      } else {
        depthBrace = Math.max(0, depthBrace - 1)
      }
    }

    if (
      onTopLevel &&
      depthParen === 0 &&
      depthBracket === 0 &&
      depthBrace === 0 &&
      quoteStack.length === 0 &&
      onTopLevel(char, i)
    ) {
      return { depth: 0, index: i }
    }
  }

  return { depth: depthBrace + depthParen + depthBracket + quoteStack.length, index: -1 }
}

export function scanTopLevel(str: string, onTopLevel: (char: string, index: number) => boolean): number {
  return scanLogic(str, onTopLevel).index
}

export function findTopLevelWhitespace(str: string): number {
  return scanTopLevel(str, (char) => /\s/.test(char))
}

export function findTopLevelColon(str: string): number {
  return scanTopLevel(str, (char) => char === ':')
}

export function findTopLevelEquals(str: string): number {
  return scanTopLevel(
    str,
    (char, index) =>
      char === '=' &&
      str[index + 1] !== '=' &&
      str[index + 1] !== '>' && // Skip arrow functions (=>)
      str[index - 1] !== '=' && // Skip compound (+=, -=, etc)
      str[index - 1] !== '!' &&
      str[index - 1] !== '<' &&
      str[index - 1] !== '>',
  )
}

export function unwrapBalancedBraces(str: string): string | null {
  const trimmed = str.trim()
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null

  // We want to see if the first '{' is closed exactly at the end.
  // We can't use scanLogic directly because it treats the first '{' as depth 1.
  
  let depthBrace = 0
  const quoteStack: Array<'"' | "'" | '`' | '${'> = []
  let escaped = false

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i]
    const quote = quoteStack[quoteStack.length - 1]

    if (quote === '"' || quote === "'" || quote === '`') {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === '\\') {
        escaped = true
        continue
      }
      if (char === quote) {
        quoteStack.pop()
      } else if (quote === '`' && char === '$' && trimmed[i + 1] === '{') {
        quoteStack.push('${')
        i++
      }
      continue
    }

    if (char === '"' || char === "'" || char === '`') {
      quoteStack.push(char)
      continue
    }

    if (char === '{') {
      depthBrace++
    } else if (char === '}') {
      if (depthBrace === 0 && quote === '${') {
        quoteStack.pop()
      } else {
        depthBrace--
      }
    }

    if (depthBrace === 0 && i < trimmed.length - 1) {
      return null
    }
  }

  return depthBrace === 0 ? trimmed.slice(1, -1).trim() : null
}
