import { spawnSync } from 'node:child_process'

const isFast = process.argv.includes('--fast')

const steps = [
  ['Workspace typecheck', ['bun', 'run', '--filter', '*', 'typecheck']],
  ['Workspace test', ['bun', 'run', '--sequential', '--filter', '*', 'test']],
  ['Workspace build', ['bun', 'run', '--filter', isFast ? '!*demo' : '*', 'build']],
  ['Generate REPOMAP.md', ['node', 'scripts/generate-repomap.mjs']],
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
