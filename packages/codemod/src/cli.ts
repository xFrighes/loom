import { analyzeMigration, convertToLoom, formatMigrationReport } from './index.js'
import { writeFile } from 'fs/promises'
import { basename, extname, join } from 'path'

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 0 || args.includes('--help')) {
    console.error('Usage: loom-codemod <file.tsx> [--report] [--json] [--output <file>]')
    process.exit(1)
  }

  const sourcePath = args[0]
  try {
    if (args.includes('--report')) {
      const report = await analyzeMigration({ sourcePath })
      const output = args.includes('--json') ? JSON.stringify(report, null, 2) + '\n' : formatMigrationReport(report)
      const explicitOutput = readFlag(args, '--output')
      if (explicitOutput) {
        await writeFile(explicitOutput, output)
      } else {
        console.log(output)
      }
      process.exit(report.findings.some((finding) => finding.severity === 'error') ? 1 : 0)
    } else {
      const loomSource = await convertToLoom({ sourcePath })
      const outputFileName = basename(sourcePath, extname(sourcePath)) + '.loom'
      const outputPath = readFlag(args, '--output') ?? join(process.cwd(), outputFileName)

      await writeFile(outputPath, loomSource)
      console.log(`Successfully converted ${sourcePath} to ${outputPath}`)
    }
  } catch (error) {
    console.error(`Error converting ${sourcePath}:`, error)
    process.exit(1)
  }
}

main()

function readFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag)
  if (index === -1) return undefined
  return args[index + 1]
}
