import { compile } from './packages/compiler/dist/index.js'

const src = `
- state
  count: number = 0

- pug
  button
    @click
      if (true) {
        console.log("nested")
      }
    text
`

try {
  const result = compile(src, { componentName: 'Repro', target: 'react' })
  console.log(result.code)
} catch (e) {
  if (e.diagnostics) {
    console.error("Diagnostics:", e.diagnostics)
  } else {
    console.error(e)
  }
}
