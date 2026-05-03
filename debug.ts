import { compile } from './packages/compiler/dist/index.js'

const src = `
- state
  count: number = 0

- pug
  button
    @click
      const count = 5
      console.log(count)
      count = 10
`

const result = compile(src, { componentName: 'Repro', target: 'react' })
console.log(result.code)