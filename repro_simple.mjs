import { compile } from './packages/compiler/dist/index.js'

const src = `
- state
  count: number = 0

- pug
  button
    @click
      count = count + 1
    text
`

try {
  const result = compile(src, { componentName: 'Repro', target: 'react' })
  console.log(result.code)
} catch (e) {
  console.error(e)
}
