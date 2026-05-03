import { convertToLoom } from './index.js'
import { writeFile } from 'fs/promises'
import { basename, extname, join } from 'path'

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.error('Usage: loom-codemod <file.tsx>')
    process.exit(1)
  }

  const sourcePath = args[0]
  try {
    const loomSource = await convertToLoom({ sourcePath })
    const outputFileName = basename(sourcePath, extname(sourcePath)) + '.loom'
    const outputPath = join(process.cwd(), outputFileName)

    await writeFile(outputPath, loomSource)
    console.log(`Successfully converted ${sourcePath} to ${outputFileName}`)
  } catch (error) {
    console.error(`Error converting ${sourcePath}:`, error)
    process.exit(1)
  }
}

main()
