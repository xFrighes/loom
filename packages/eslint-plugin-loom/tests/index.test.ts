import { describe, expect, it } from 'vitest'
import { ESLint } from 'eslint'
import loom, { toLintMessage } from '../src/index.js'

function createLoomEslint() {
  return new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.loom'],
        plugins: { loom: loom as any },
        processor: 'loom/loom',
        languageOptions: {
          ecmaVersion: 'latest',
          sourceType: 'module',
        },
      },
    ],
    ignore: false,
  })
}

describe('eslint-plugin-loom', () => {
  it('maps compiler diagnostics back to .loom source spans', async () => {
    const eslint = createLoomEslint()

    const [result] = await eslint.lintText('- pug\ndiv\n  :\n    type email\n    type text', {
      filePath: 'Component.loom',
    })

    expect(result?.messages).toHaveLength(1)
    expect(result?.messages[0]?.ruleId).toBe('loom/duplicate-attr')
    expect(result?.messages[0]?.line).toBe(5)
    expect(result?.messages[0]?.column).toBe(5)
  })

  it('returns no messages for valid loom files', async () => {
    const eslint = createLoomEslint()

    const [result] = await eslint.lintText('- pug\ndiv Hello', { filePath: 'Component.loom' })
    expect(result?.messages).toEqual([])
  })

  it('reports parser diagnostics instead of placeholder JavaScript errors', async () => {
    const eslint = createLoomEslint()

    const [result] = await eslint.lintText('- pug\ndiv\n  span\n p Bad indent', {
      filePath: 'Component.loom',
    })

    expect(result?.messages).toHaveLength(1)
    expect(result?.messages[0]?.ruleId).toBe('loom/parse')
    expect(result?.messages[0]?.message).toContain('Inconsistent indentation')
  })

  it('maps compiler warnings to ESLint warning severity', () => {
    const message = toLintMessage({
      code: 'loom/example-warning',
      severity: 'warning',
      message: 'Example warning.',
      span: {
        start: { line: 2, column: 3, offset: 4 },
        end: { line: 2, column: 12, offset: 13 },
      },
    })

    expect(message.severity).toBe(1)
    expect(message.line).toBe(2)
    expect(message.column).toBe(3)
  })
})
