import { compile } from './packages/compiler/dist/index.js'

const src = `
button
  @click
    count = 1
`

try {
  const result = compile(src, { componentName: 'Repro', target: 'react' })
  console.log(result.code)
} catch (e) {
  console.error(e)
}
