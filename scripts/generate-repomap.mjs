import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const PACKAGES_DIR = join(ROOT, 'packages');

function getPackages() {
  return readdirSync(PACKAGES_DIR).filter(d => existsSync(join(PACKAGES_DIR, d, 'package.json')));
}

function generateMap() {
  let map = '# Loom Repository Map\n\n';
  map += 'Generated: ' + new Date().toISOString() + '\n\n';

  const packages = getPackages();

  for (const pkg of packages) {
    const pkgPath = join(PACKAGES_DIR, pkg);
    const pkgJson = JSON.parse(readFileSync(join(pkgPath, 'package.json'), 'utf8'));
    
    map += `## 📦 ${pkgJson.name}\n`;
    map += `Path: \`packages/${pkg}\`\n`;
    map += `Purpose: ${pkgJson.description || 'N/A'}\n\n`;

    // Try to find main exports or interesting files
    const srcDir = join(pkgPath, 'src');
    if (existsSync(srcDir)) {
      map += '### Key Structures:\n';
      try {
        // Use grep to find interfaces/types/classes/functions in src
        const grepCmd = `grep -rE "export (interface|type|class|function|const)" ${srcDir} --include="*.ts" --exclude="*.test.ts" | head -n 20`;
        const exports = execSync(grepCmd, { encoding: 'utf8' });
        if (exports) {
          map += '```typescript\n' + exports.split('\n').map(line => {
            const parts = line.split(':');
            const file = parts[0].replace(pkgPath + '/', '');
            const content = parts.slice(1).join(':').trim();
            return `// ${file}\n${content}`;
          }).join('\n') + '\n```\n';
        }
      } catch (e) {
        map += '_No public exports found or grep failed._\n';
      }
    }

    // Special handling for Rust core
    if (pkg === 'loom_core') {
      map += '### Rust Core (napi):\n';
      const rsSrc = join(pkgPath, 'src/lib.rs');
      if (existsSync(rsSrc)) {
         try {
           const rustExports = execSync(`grep -E "#\\[napi\\]" ${rsSrc} -A 1`, { encoding: 'utf8' });
           map += '```rust\n' + rustExports + '\n```\n';
         } catch (e) {}
      }
    }
    
    map += '\n---\n\n';
  }

  writeFileSync(join(ROOT, 'REPOMAP.md'), map);
  console.log('REPOMAP.md generated successfully.');
}

generateMap();
