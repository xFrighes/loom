import { compile } from './packages/compiler/src/index.js'
function react(src) {
  return compile(src, { componentName: 'Test', target: 'react' }).code
}
console.log('--- IF/ELSE ---')
console.log(react('- pug\nif x\n  p A\nelse\n  p B'))
console.log('--- EACH ---')
console.log(react('- pug\neach user in users\n  p x'))
