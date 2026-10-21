// Usage: node scripts/restore.mjs <archive-folder> <DATA_DIR> [--force]
// Stop the site first. Refuses a non-empty DATA_DIR unless --force (which replaces vfw.db and photos only).
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

export function runRestore(archive, dataDir, force = false) {
  if (!existsSync(join(archive, 'vfw.db'))) throw new Error(`${archive} is not a backup (no vfw.db)`);
  if (existsSync(dataDir) && readdirSync(dataDir).length && !force) throw new Error(`${dataDir} is not empty; use --force to replace its database and photos`);
  mkdirSync(dataDir, { recursive: true });
  for (const f of ['vfw.db', 'vfw.db-journal']) rmSync(join(dataDir, f), { force: true });
  rmSync(join(dataDir, 'photos'), { recursive: true, force: true });
  cpSync(join(archive, 'vfw.db'), join(dataDir, 'vfw.db'));
  if (existsSync(join(archive, 'photos'))) cpSync(join(archive, 'photos'), join(dataDir, 'photos'), { recursive: true });
}

if (process.argv[1]?.endsWith('restore.mjs')) {
  try {
    const [a, d] = process.argv.slice(2).filter((x) => x !== '--force');
    if (!a || !d) throw new Error('usage: node scripts/restore.mjs <archive-folder> <DATA_DIR> [--force]');
    runRestore(resolve(a), resolve(d), process.argv.includes('--force'));
    console.log(`restore ok: ${resolve(a)} -> ${resolve(d)}`);
  } catch (e) { console.error('restore FAILED:', e.message); process.exit(1); }
}
