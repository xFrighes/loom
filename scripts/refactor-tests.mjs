import fs from 'node:fs'

let content = fs.readFileSync('packages/compiler/tests/codegen.test.ts', 'utf8')

// Add Vue compiler import
content = content.replace(
  "import { compile } from '../src/index.js'",
  "import { compile } from '../src/index.js'\nimport { parse as parseVue } from '@vue/compiler-sfc'"
)

// Update expectValidTsx to throw or fail properly
content = content.replace(
  "expect(errors.map((diagnostic) => diagnostic.messageText)).toEqual([])",
  "if (errors.length > 0) { throw new Error('TSX Compilation Error: ' + errors[0].messageText) }"
)

// Update Vue describe block to include expectValidVue
content = content.replace(
  "function vue(src: string) {\n    return compile(src, { componentName: 'Test', target: 'vue' }).code\n  }",
  "function vue(src: string) {\n    return compile(src, { componentName: 'Test', target: 'vue' }).code\n  }\n\n  function expectValidVue(code: string) {\n    const { errors } = parseVue(code)\n    if (errors.length > 0) { throw new Error('Vue Compilation Error: ' + errors[0].message) }\n  }"
)

// Now replace all expect(out).toContain(...) with expectValid... and toMatchSnapshot()
// But wait, some tests check specific things, if we just replace all, it might be too broad.
// A simpler way is to just do it programmatically using regex.

const reactRegex = /it\('([^']+)', \(\) => \{\s+const out = react\(([^)]+)\)\n(?:[ \t]+expect\([^)]+\)\.(?:toContain|not\.toContain)\([^)]+\)\n)+[ \t]*(?:expectValidTsx\(out\)\n)?[ \t]*\}\)/g

content = content.replace(reactRegex, (match, name, src) => {
  return `it('${name}', () => {
    const out = react(${src})
    expectValidTsx(out)
    expect(out).toMatchSnapshot()
  })`
})

const vueRegex = /it\('([^']+)', \(\) => \{\s+const out = vue\(([^)]+)\)\n(?:[ \t]+expect\([^)]+\)\.(?:toContain|not\.toContain)\([^)]+\)\n)+[ \t]*\}\)/g

content = content.replace(vueRegex, (match, name, src) => {
  return `it('${name}', () => {
    const out = vue(${src})
    expectValidVue(out)
    expect(out).toMatchSnapshot()
  })`
})

// Some vue tests are inline: expect(vue('- view\\ndiv')).toContain('<script setup lang="ts">')
const vueInlineRegex = /it\('([^']+)', \(\) => \{\s+expect\(vue\(([^)]+)\)\)\.toContain\([^)]+\)\n[ \t]*\}\)/g
content = content.replace(vueInlineRegex, (match, name, src) => {
  return `it('${name}', () => {
    const out = vue(${src})
    expectValidVue(out)
    expect(out).toMatchSnapshot()
  })`
})

fs.writeFileSync('packages/compiler/tests/codegen.test.ts', content)
