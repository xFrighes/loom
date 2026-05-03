import { compile } from './packages/compiler/dist/index.js'

const src = `
- state
  count: number = 0

- pug
  button
    @click
      function foo(count) {
        count = 10
      }
      foo(5)
      count = count + 1
`

try {
  const result = compile(src, { componentName: 'Repro', target: 'react' })
  console.log(result.code)
} catch (e) {
  console.error(e)
}
