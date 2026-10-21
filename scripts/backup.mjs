// Usage: DATA_DIR=/home/data BACKUP_DIR=/home/backups node scripts/backup.mjs
// Writes BACKUP_DIR/vfw-backup-<timestamp>/ with vfw.db (consistent VACUUM INTO copy, holds settings too) and photos/. Keeps the newest BACKUP_KEEP (default 14).
import { DatabaseSync } from 'node:sqlite';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export function runBackup(dataDir, backupDir, keep = 14, now = new Date()) {
  const src = join(dataDir, 'vfw.db');
  if (!existsSync(src)) throw new Error(`no database at ${src}`);
  const name = `vfw-backup-${now.toISOString().replace(/[:.]/g, '-')}`;
  const out = join(backupDir, name), tmp = out + '.partial';
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const db = new DatabaseSync(src);
  try { db.exec('PRAGMA busy_timeout=5000'); db.exec(`VACUUM INTO '${join(tmp, 'vfw.db').replace(/'/g, "''")}'`); } finally { db.close(); }
  const photos = join(dataDir, 'photos');
  if (existsSync(photos)) cpSync(photos, join(tmp, 'photos'), { recursive: true });
  const n = existsSync(join(tmp, 'photos')) ? readdirSync(join(tmp, 'photos')).length : 0;
  writeFileSync(join(tmp, 'MANIFEST.json'), JSON.stringify({ made: now.toISOString(), photos: n }));
  cpSync(tmp, out, { recursive: true }); rmSync(tmp, { recursive: true, force: true }); // folder appears whole or not at all
  const all = readdirSync(backupDir).filter((f) => f.startsWith("vfw-backup-") && f.endsWith("Z")).sort();
  for (const f of all.slice(0, -Math.max(1, keep))) rmSync(join(backupDir, f), { recursive: true, force: true });
  return { out, photos: n };
}

if (import.meta.url === new URL(process.argv[1], 'file://').href || process.argv[1]?.endsWith('backup.mjs')) {
  try {
    if (!process.env.BACKUP_DIR) throw new Error('set BACKUP_DIR');
    const dataDir = resolve(process.env.DATA_DIR || (process.env.NODE_ENV === 'production' ? '/home/data' : '.data'));
    const r = runBackup(dataDir, resolve(process.env.BACKUP_DIR), Number(process.env.BACKUP_KEEP) || 14);
    console.log(`backup ok: ${r.out} (database + ${r.photos} photos)`);
  } catch (e) { console.error('backup FAILED:', e.message); process.exit(1); }
}
