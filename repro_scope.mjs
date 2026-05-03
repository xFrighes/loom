import { compile } from './packages/compiler/dist/index.js'

const src = `
- state
  count: number = 0

- pug
  button
    @click
      const count = 10
      console.log(count)
`

try {
  const result = compile(src, { componentName: 'Repro', target: 'react' })
  console.log(result.code)
} catch (e) {
  console.error(e)
}
