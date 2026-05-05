import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { defaultWatchFile, runCli } from '../src/cli.js'

function createIo() {
  let stdout = ''
  let stderr = ''
  let exitCode = 0
  return {
    io: {
      stdout(value: string) {
        stdout += value
      },
      stderr(value: string) {
        stderr += value
      },
      exit(code: number) {
        exitCode = code
      },
    },
    read() {
      return { stdout, stderr, exitCode }
    },
  }
}

describe('loomc CLI', () => {
  it('provides a default file watcher for real --watch invocations', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'loom-cli-watch-'))
    const filePath = path.join(root, 'App.loom')
    writeFileSync(filePath, '- pug\ndiv Hello', 'utf8')

    const watcher = defaultWatchFile(filePath, () => {})
    watcher.close()
  })

  it('supports --watch without exiting and reruns on file changes', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'loom-cli-'))
    const filePath = path.join(root, 'App.loom')
    writeFileSync(filePath, '- pug\ndiv Hello', 'utf8')

    const { io, read } = createIo()
    let onChange: (() => void) | undefined

    const exitCode = runCli(['node', 'loomc', 'check', filePath, '--watch'], io, {
      readFile: readFileSync,
      writeFile: writeFileSync,
      watchFile(_watchedPath, callback) {
        onChange = callback
        return { close() {} }
      },
    })

    expect(exitCode).toBe(0)
    expect(read().stdout).toContain('OK')
    expect(read().stderr).toContain(`Watching ${path.resolve(filePath)}`)

    writeFileSync(filePath, '- pug\nelse\n  div Nope', 'utf8')
    onChange?.()

    expect(read().stderr).toContain('loom/control-flow-placement')
    expect(read().exitCode).toBe(0)
  })

  it('sanitizes component names from filenames', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'loom-cli-name-'))
    const filePath = path.join(root, '404.loom')
    writeFileSync(filePath, '- pug\ndiv Error', 'utf8')

    const { io, read } = createIo()
    runCli(['node', 'loomc', 'compile', filePath], io)

    expect(read().stdout).toContain('function Component404')
    expect(read().stdout).toContain('export default Component404')
  })
})
