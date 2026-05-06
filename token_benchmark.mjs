import { createLoomProjection } from './packages/loom-llm/src/projector/loom.js';

const sampleLoom = `- props
  name: string
  items: string[]

- state
  count: number = 0

- computed
  isBig = count > 10

- pug
  div.card
    h1 Hello {name}
    button
      @click
        count++
      + Increment
    
    if isBig
      p.big WOW BIG!
    
    ul
      each item in items
        li {item}
`;

const projection = createLoomProjection('.', 'Test.loom', sampleLoom);
console.log('--- Token Savings Benchmark ---');
console.log('Source Tokens:  ', projection.tokenEstimates.source);
console.log('Index Tokens:   ', projection.tokenEstimates.index);
console.log('Outline Tokens: ', projection.tokenEstimates.outline);
console.log('Edit Tokens:    ', projection.tokenEstimates.edit);
console.log('Caveman Index:  ', projection.tokenEstimates.cavemanIndex);
console.log('Caveman Outline:', projection.tokenEstimates.cavemanOutline);
console.log('Caveman Edit:   ', projection.tokenEstimates.cavemanEdit);
const cavemanVsOutline = ((1 - projection.tokenEstimates.cavemanOutline / projection.tokenEstimates.outline) * 100).toFixed(1);
const cavemanIndexVsOutline = ((1 - projection.tokenEstimates.cavemanIndex / projection.tokenEstimates.outline) * 100).toFixed(1);
console.log('Reduction (Caveman vs Outline):', cavemanVsOutline + '%');
console.log('Reduction (Index vs Outline):  ', cavemanIndexVsOutline + '%');
