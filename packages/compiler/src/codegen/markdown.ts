import type { ElementNode, MarkupNode } from '../ast.js'
import { sanitizeStaticHtml } from './html.js'

export function isMarkdownElement(node: ElementNode): boolean {
  return node.tag === 'md' || node.tag === 'markdown'
}

export function renderMarkdownElement(node: ElementNode): string {
  return sanitizeStaticHtml(markdownToHtml(markdownSourceFromChildren(node.children)))
}

function markdownSourceFromChildren(children: MarkupNode[]): string {
  return children
    .map(markdownLineFromNode)
    .filter(Boolean)
    .join('\n')
}

function markdownLineFromNode(node: MarkupNode): string {
  if (node.kind === 'text') return node.value
  if (node.kind === 'element') {
    const selector = [
      node.tag,
      ...node.classes.map((cls) => `.${cls}`),
      node.id ? `#${node.id}` : '',
    ].join('')
    const childText = node.children.map(markdownLineFromNode).filter(Boolean).join(' ')
    return childText ? `${selector} ${childText}` : selector
  }
  return ''
}

function markdownToHtml(src: string): string {
  const lines = src.split(/\r?\n/)
  const out: string[] = []
  let paragraph: string[] = []
  let list: string[] = []

  const flushParagraph = () => {
    if (paragraph.length === 0) return
    out.push(`<p>${renderInlineMarkdown(paragraph.join(' '))}</p>`)
    paragraph = []
  }

  const flushList = () => {
    if (list.length === 0) return
    out.push(`<ul>${list.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join('')}</ul>`)
    list = []
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      flushParagraph()
      flushList()
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      flushParagraph()
      flushList()
      const level = heading[1].length
      out.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`)
      continue
    }

    const item = line.match(/^[-*]\s+(.+)$/)
    if (item) {
      flushParagraph()
      list.push(item[1])
      continue
    }

    flushList()
    paragraph.push(line)
  }

  flushParagraph()
  flushList()
  return out.join('')
}

function renderInlineMarkdown(value: string): string {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text: string, href: string) => {
      const safeHref = /^javascript:/i.test(href.trim()) ? '#' : href
      return `<a href="${escapeHtmlAttr(safeHref)}">${text}</a>`
    })
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeHtmlAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, '&quot;')
}
