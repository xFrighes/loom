import { describe, it, expect } from 'vitest'
import { compile } from '../src/index.js'

describe('reactivity model lowering', () => {
  const src = `- state
  count: number = 0

- computed
  double = count * 2

- pug
  button
    @click
      count++
    {count} x 2 = {double}
`

  it('lowers to React', () => {
    const out = compile(src, { componentName: 'Test', target: 'react' }).code
    expect(out).toContain('const [count, setCount] = useState<number>(0)')
    expect(out).toContain('const double = useMemo(() => count * 2, [count])')
    expect(out).toContain('setCount(prev => prev + 1)')
  })

  it('lowers to Vue', () => {
    const out = compile(src, { componentName: 'Test', target: 'vue' }).code
    expect(out).toContain('const count = ref<number>(0)')
    expect(out).toContain('const double = computed(() => count.value * 2)')
    expect(out).toContain('count.value++')
  })

  it('lowers to Svelte', () => {
    const out = compile(src, { componentName: 'Test', target: 'svelte' }).code
    expect(out).toContain('let count: number = 0')
    expect(out).toContain('$: double = count * 2')
    expect(out).toContain('count++')
  })
})
