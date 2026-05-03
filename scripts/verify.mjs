import { spawnSync } from 'node:child_process'

const isFast = process.argv.includes('--fast')

// Only include packages that were originally part of the verification
const filterArgs = [
  '--filter', '@loom-lang/compiler',
  '--filter', '@loom-lang/testing',
  '--filter', '@loom-lang/tailwind',
  '--filter', 'eslint-plugin-loom',
  '--filter', '@loom-lang/loom-llm',
  '--filter', 'vite-plugin-loom'
]

const steps = [
  ['Source lint', ['npx', 'pnpm', 'run', '--if-present', 'lint']],
  ['Workspace typecheck', ['npx', 'pnpm', '-r', ...filterArgs, 'run', '--if-present', 'typecheck']],
  ['Workspace test', ['npx', 'pnpm', '-r', ...filterArgs, 'run', '--if-present', 'test']],
  [
    'Workspace build',
    [
      'npx',
      'pnpm',
      '-r',
      ...(isFast ? ['--filter', '!*-demo'] : []),
      'run',
      '--if-present',
      'build',
    ],
  ],
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
