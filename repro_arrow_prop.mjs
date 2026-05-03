import { compile } from './packages/compiler/dist/index.js'

const src = `
- props
  onSelect: (v: number) => void = (v) => console.log(v)

- pug
  div
`

try {
  const result = compile(src, { componentName: 'Repro', target: 'react' })
  console.log(result.code)
} catch (e) {
  console.error(e)
}
