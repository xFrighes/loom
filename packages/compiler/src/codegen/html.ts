const DANGEROUS_PROTOCOL = /^\s*javascript:/i

export function sanitizeStaticHtml(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(
      /\s+(href|src|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
      (match, name: string, doubleQuoted: string | undefined, singleQuoted: string | undefined, bare: string | undefined) => {
        const raw = doubleQuoted ?? singleQuoted ?? bare ?? ''
        if (!DANGEROUS_PROTOCOL.test(raw)) return match
        return ` ${name}="#"`
      },
    )
}
