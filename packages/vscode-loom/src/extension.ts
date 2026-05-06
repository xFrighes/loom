import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import * as vscode from 'vscode'
import { LanguageClient } from 'vscode-languageclient/node'
import { isSupportedPreviewTarget, resolveLoomTools } from './config.js'

const execFileAsync = promisify(execFile)
let client: LanguageClient | undefined

export async function activate(context: vscode.ExtensionContext) {
  client = createLanguageClient()
  context.subscriptions.push(client)
  await client.start()

  context.subscriptions.push(vscode.commands.registerCommand('loom.restartLanguageServer', async () => {
    await client?.stop()
    client = createLanguageClient()
    context.subscriptions.push(client)
    await client.start()
  }))

  context.subscriptions.push(vscode.languages.registerDocumentFormattingEditProvider('loom', {
    async provideDocumentFormattingEdits(document) {
      const tools = currentTools()
      const { stdout } = await execFileAsync(tools.compilerPath, ['format', document.uri.fsPath])
      const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(document.getText().length),
      )
      return [vscode.TextEdit.replace(fullRange, stdout)]
    },
  }))

  context.subscriptions.push(vscode.commands.registerCommand('loom.preview', async () => {
    const editor = vscode.window.activeTextEditor
    if (!editor || editor.document.languageId !== 'loom') return

    const tools = currentTools()
    const { stdout } = await execFileAsync(tools.compilerPath, [
      'compile',
      editor.document.uri.fsPath,
      '--target',
      tools.previewTarget,
    ])
    const panel = vscode.window.createWebviewPanel(
      'loomPreview',
      `Loom Preview: ${tools.previewTarget}`,
      vscode.ViewColumn.Beside,
      { enableScripts: false },
    )
    panel.webview.html = renderPreview(stdout, tools.previewTarget)
  }))
}

export async function deactivate() {
  await client?.stop()
}

function createLanguageClient(): LanguageClient {
  const tools = currentTools()
  return new LanguageClient(
    'loomLanguageServer',
    'Loom Language Server',
    {
      command: tools.languageServerPath,
      args: [],
    },
    {
      documentSelector: [{ scheme: 'file', language: 'loom' }],
      synchronize: {
        fileEvents: vscode.workspace.createFileSystemWatcher('**/*.loom'),
      },
    },
  )
}

function currentTools() {
  const config = vscode.workspace.getConfiguration('loom')
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  const previewTarget = String(config.get('preview.target', 'react'))
  return resolveLoomTools({
    languageServerPath: config.get('languageServer.path', 'loom-language-server'),
    compilerPath: config.get('compiler.path', 'loomc'),
    previewTarget: isSupportedPreviewTarget(previewTarget) ? previewTarget : 'react',
  }, workspaceRoot)
}

function renderPreview(code: string, target: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      body { margin: 0; background: #0b0f19; color: #d8dee9; font: 13px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; }
      header { padding: 12px 16px; border-bottom: 1px solid #273244; color: #facc15; text-transform: uppercase; letter-spacing: .08em; font-size: 11px; }
      pre { margin: 0; padding: 16px; overflow: auto; white-space: pre-wrap; }
    </style>
  </head>
  <body>
    <header>${escapeHtml(target)} output</header>
    <pre>${escapeHtml(code)}</pre>
  </body>
</html>`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
