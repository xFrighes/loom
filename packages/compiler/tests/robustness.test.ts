import { describe, expect, it } from 'vitest'
import { analyze, compile } from '../src/index.js'

describe('security and robustness diagnostics', () => {
  it('emits strict a11y diagnostics for unlabeled controls and missing keyboard paths', () => {
    const result = analyze(`- pug
button
div
  :
    role "button"
  @click
    submit()
`, { strictA11y: true })

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain('loom/a11y-label')
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain('loom/a11y-keyboard')
  })

  it('scans unsafe HTML, URLs, and event expressions before codegen', () => {
    const result = analyze(`- pug
a
  :
    href "javascript:alert(1)"
div
  :
    innerHTML {html}
button
  @click
    eval(source)
`, { security: true })

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(expect.arrayContaining([
      'loom/security-url',
      'loom/security-unsafe-html',
      'loom/security-expression',
    ]))
  })

  it('reports bundle budget warnings from target codegen', () => {
    const result = compile('- pug\ndiv Hello', {
      componentName: 'Budget',
      target: 'react',
      bundleBudgetBytes: 1,
    })

    expect(result.warnings?.map((warning) => warning.code)).toContain('loom/bundle-budget')
  })
})
