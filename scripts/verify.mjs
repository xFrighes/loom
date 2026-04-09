import { spawnSync } from 'node:child_process'

const steps = [
  ['Compiler typecheck', ['pnpm', '--filter', '@loom-lang/compiler', 'typecheck']],
  ['Compiler tests', ['pnpm', '--filter', '@loom-lang/compiler', 'test']],
  ['Compiler build', ['pnpm', '--filter', '@loom-lang/compiler', 'build']],
  ['Vite plugin tests', ['pnpm', '--filter', 'vite-plugin-loom', 'test']],
  ['Vite plugin build', ['pnpm', '--filter', 'vite-plugin-loom', 'build']],
  ['React demo build', ['pnpm', '--filter', 'react-demo', 'build']],
  ['Vue demo build', ['pnpm', '--filter', 'vue-demo', 'build']],
  ['Svelte demo build', ['pnpm', '--filter', 'svelte-demo', 'build']],
  ['Workspace build', ['pnpm', '-r', 'build']],
]

for (const [label, command] of steps) {
  process.stdout.write(`\n==> ${label}\n`)
  const [bin, ...args] = command
  const result = spawnSync(bin, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

process.stdout.write('\nWorkspace verification passed.\n')
