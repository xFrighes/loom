import { performance } from 'perf_hooks';
import { tokenize, parse, compile } from '../src/index.js';

function generateComponent(index: number): string {
  return `
- ts
  import { useState } from 'react'

  const [count, setCount] = useState(${index})
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const items = ['React ${index}', 'Vue ${index}', 'Svelte ${index}']

- pug
  div.app
    ::
      font-family sans-serif
      max-width 800px
      margin 0 auto
      padding 2rem
      background {theme === 'light' ? '#fff' : '#1a1a1a'}
      color {theme === 'light' ? '#000' : '#fff'}
      min-height 100vh

    h1 Loom Demo ${index}

    // Theme toggle
    button
      :
        type button
      @click
        setTheme(theme === 'light' ? 'dark' : 'light')
      Toggle theme ({theme})

    // Counter
    div.counter
      ::
        margin-top 2rem
        display flex
        gap 1rem
        align-items center

      button
        @click
          setCount(count - 1)
        -

      span Count: {count}

      button
        @click
          setCount(count + 1)
        +

    // Framework list
    div.list
      ::
        margin-top 2rem

      h2 Supported frameworks:
      each item in items
        p.item
          ::
            padding 0.5rem
            border-left 3px solid #0066cc
            margin 0.5rem 0
          {item}

    // Conditional
    if count > 5
      p.big
        ::
          color green
          font-size 1.5rem
        Count is greater than 5!
    else if count < 0
      p.negative
        ::
          color red
        Count is negative
    else
      p Keep clicking...
`;
}

async function runBenchmark() {
  const NUM_COMPONENTS = 1000;
  console.log(`Generating ${NUM_COMPONENTS} components in memory...`);
  const components: string[] = [];
  for (let i = 0; i < NUM_COMPONENTS; i++) {
    components.push(generateComponent(i));
  }

  console.log('Starting benchmark...');

  // 1. Lexical Analysis
  const lexerStart = performance.now();
  const tokensList = [];
  for (let i = 0; i < NUM_COMPONENTS; i++) {
    tokensList.push(tokenize(components[i]));
  }
  const lexerEnd = performance.now();
  const lexerTime = lexerEnd - lexerStart;

  // 2. Parsing
  const parserStart = performance.now();
  const astList = [];
  for (let i = 0; i < NUM_COMPONENTS; i++) {
    // parse() takes the source string directly in the current TS compiler api
    astList.push(parse(components[i]));
  }
  const parserEnd = performance.now();
  const parserTime = parserEnd - parserStart;

  // 3. Codegen (compile)
  const codegenStart = performance.now();
  for (let i = 0; i < NUM_COMPONENTS; i++) {
    compile(components[i], { componentName: `Component${i}`, target: 'react' });
  }
  const codegenEnd = performance.now();
  const codegenTime = codegenEnd - codegenStart;

  console.log('\n--- Benchmark Results ---');
  console.log(`Lexical Analysis: ${lexerTime.toFixed(2)} ms`);
  console.log(`Parsing:          ${parserTime.toFixed(2)} ms`);
  console.log(`Codegen (React):  ${codegenTime.toFixed(2)} ms`);
  console.log(`Total Time:       ${(lexerTime + parserTime + codegenTime).toFixed(2)} ms`);
  console.log('-------------------------');
}

runBenchmark().catch(console.error);
