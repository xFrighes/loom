#!/usr/bin/env node
import { getFoldRanges } from './folds.js'
import { analyze } from './index.js'

const documents = new Map<string, string>()
let buffer = ''

const readMessages = (chunk: string) => {
  buffer += chunk
  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n')
    if (headerEnd === -1) return

    const header = buffer.slice(0, headerEnd)
    const match = header.match(/Content-Length: (\d+)/i)
    if (!match) {
      buffer = buffer.slice(headerEnd + 4)
      continue
    }

    const length = Number(match[1])
    const messageStart = headerEnd + 4
    if (buffer.length < messageStart + length) return

    const payload = buffer.slice(messageStart, messageStart + length)
    buffer = buffer.slice(messageStart + length)
    handleMessage(JSON.parse(payload))
  }
}

const send = (message: any) => {
  const payload = JSON.stringify(message)
  process.stdout.write(`Content-Length: ${Buffer.byteLength(payload, 'utf8')}\r\n\r\n${payload}`)
}

const sendResponse = (id: any, result: any) => send({ jsonrpc: '2.0', id, result })

const sendDiagnostics = (uri: string, diagnostics: any[] = []) =>
  send({
    jsonrpc: '2.0',
    method: 'textDocument/publishDiagnostics',
    params: { uri, diagnostics },
  })

const handleMessage = (message: any) => {
  const { id, method, params } = message

  if (method === 'initialize') {
    sendResponse(id, {
      capabilities: {
        textDocumentSync: 1, // Full
        foldingRangeProvider: true,
        hoverProvider: true,
      },
      serverInfo: {
        name: 'loom-language-server',
        version: '0.1.0',
      },
    })
    return
  }

  if (method === 'initialized') return

  if (method === 'shutdown') {
    sendResponse(id, null)
    return
  }

  if (method === 'exit') {
    process.exit(0)
  }

  if (method === 'textDocument/didOpen') {
    const { uri, text } = params.textDocument
    documents.set(uri, text)
    sendDiagnostics(uri, toLspDiagnostics(text))
    return
  }

  if (method === 'textDocument/didChange') {
    const { uri } = params.textDocument
    const latest = params.contentChanges.at(-1)?.text ?? ''
    documents.set(uri, latest)
    sendDiagnostics(uri, toLspDiagnostics(latest))
    return
  }

  if (method === 'textDocument/foldingRange') {
    const text = documents.get(params.textDocument.uri) ?? ''
    const result = getFoldRanges(text).map((range) => ({
      startLine: range.startLine - 1,
      endLine: Math.max(range.endLine - 1, range.startLine - 1),
      kind: 'region',
    }))
    sendResponse(id, result)
    return
  }

  if (method === 'textDocument/hover') {
    const text = documents.get(params.textDocument.uri) ?? ''
    const lines = text.split('\n')
    const targetLine = params.position.line + 1
    const fold = getFoldRanges(text).find((range) => range.startLine === targetLine)
    if (!fold) {
      sendResponse(id, null)
      return
    }

    const preview = lines
      .slice(fold.startLine - 1, fold.endLine)
      .join('\n')
      .trim()

    sendResponse(id, {
      contents: {
        kind: 'markdown',
        value: ['```loom\n' + preview + '\n```'],
      },
    })
  }
}

process.stdin.setEncoding('utf8')
process.stdin.on('data', readMessages)

function toLspDiagnostics(text: string) {
  const { diagnostics } = analyze(text)
  return diagnostics.map((diagnostic) => ({
    severity: diagnostic.severity === 'error' ? 1 : 2,
    message: diagnostic.message,
    code: diagnostic.code,
    range: {
      start: {
        line: diagnostic.span.start.line - 1,
        character: diagnostic.span.start.column - 1,
      },
      end: {
        line: diagnostic.span.end.line - 1,
        character: Math.max(diagnostic.span.end.column - 1, diagnostic.span.start.column - 1),
      },
    },
  }))
}
