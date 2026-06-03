import {
  analyzeMigration,
  convertSourceToLoomWithReport,
  convertToLoom,
  formatMigrationReport,
  type ConversionSource,
  type MigrationFinding,
} from './index.js'
import { readFile, writeFile } from 'fs/promises'
import { basename, extname, join } from 'path'

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 0 || args.includes('--help')) {
    console.error('Usage: loom-codemod <input> [--from jsx|html] [--report] [--json] [--stdout] [--output <file>]')
    process.exit(1)
  }

  const sourcePath = args[0]
  const from = readConversionSource(args, sourcePath)
  try {
    if (args.includes('--report')) {
      if (from === 'html') {
        const output = args.includes('--json')
          ? JSON.stringify({ sourcePath, from, findings: [] }, null, 2) + '\n'
          : `# Loom Migration Report\n\nSource: ${sourcePath}\nInput: html\n\n## Findings\n- HTML paste conversion supports static tags, attributes, text, and nesting.\n`
        const explicitOutput = readFlag(args, '--output')
        if (explicitOutput) {
          await writeFile(explicitOutput, output)
        } else {
          console.log(output)
        }
        process.exit(0)
      }

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
      const conversion = from === 'html' || args.includes('--stdout')
        ? await convertSourceToLoomWithReport({
            source: await readFile(sourcePath, 'utf8'),
            from,
            sourcePath,
          })
        : {
            source: await convertToLoom({ sourcePath }),
            findings: [],
          }

      const errorFinding = conversion.findings.find((finding) => finding.severity === 'error')
      if (errorFinding) {
        throw new Error(`${errorFinding.message} (${errorFinding.fixUrl})`)
      }

      if (args.includes('--stdout')) {
        const warningOutput = formatFindingsForStderr(conversion.findings)
        if (warningOutput) console.error(warningOutput)
        console.log(conversion.source)
        process.exit(0)
      }

      const outputFileName = basename(sourcePath, extname(sourcePath)) + '.loom'
      const outputPath = readFlag(args, '--output') ?? join(process.cwd(), outputFileName)

      await writeFile(outputPath, conversion.source)
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

function readConversionSource(args: string[], sourcePath: string): ConversionSource {
  const explicit = readFlag(args, '--from')
  if (explicit === 'jsx' || explicit === 'html') return explicit
  if (explicit) throw new Error(`Unsupported --from value "${explicit}". Use "jsx" or "html".`)
  return /\.html?$/i.test(sourcePath) ? 'html' : 'jsx'
}

function formatFindingsForStderr(findings: MigrationFinding[]): string {
  const actionable = findings.filter((finding) => finding.severity !== 'info')
  if (actionable.length === 0) return ''
  return actionable
    .map((finding) => `[${finding.severity}] ${finding.code}: ${finding.message} (${finding.fixUrl})`)
    .join('\n')
}
