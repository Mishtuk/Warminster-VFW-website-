// One SQLite file (node:sqlite, no dependency) in DATA_DIR.
// Site content (events, specials, menu, news) is one JSON document under kv key "state"; the rest are small tables.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export function openDb(dir) {
  if (dir !== ':memory:') mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(dir === ':memory:' ? ':memory:' : join(dir, 'vfw.db'));
  db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
  db.exec(`CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS admin (id INTEGER PRIMARY KEY CHECK (id = 1), username TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL,
      default_pw INTEGER NOT NULL DEFAULT 0, session_v INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS inquiries (id INTEGER PRIMARY KEY, at INTEGER NOT NULL, day TEXT NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '', event_date TEXT NOT NULL DEFAULT '', event_type TEXT NOT NULL DEFAULT '', guests INTEGER, message TEXT NOT NULL DEFAULT '',
      handled INTEGER NOT NULL DEFAULT 0, emailed INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS stats_daily (day TEXT NOT NULL, metric TEXT NOT NULL, item TEXT NOT NULL DEFAULT '', n INTEGER NOT NULL,
      PRIMARY KEY (day, metric, item)) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS security_events (id INTEGER PRIMARY KEY, at INTEGER NOT NULL, type TEXT NOT NULL, who TEXT NOT NULL DEFAULT '',
      ip TEXT NOT NULL DEFAULT '', detail TEXT NOT NULL DEFAULT '');`);
  return db;
}

/** Days to keep hall inquiries (INQUIRY_RETENTION_DAYS, default 365). Anything that is not a positive whole number means the default. */
export const retentionDays = (v) => (/^[1-9][0-9]{0,4}$/.test(String(v ?? '')) ? Number(v) : 365);
/** Deletes inquiries older than `days`. Returns how many. Daily backups can hold an older copy for up to 7 more days. */
export const purgeInquiries = (db, days, now = Date.now()) => Number(db.prepare('DELETE FROM inquiries WHERE at < ?').run(now - days * 864e5).changes);

export const getState = (db) => JSON.parse(db.prepare("SELECT value FROM kv WHERE key = 'state'").get()?.value ?? '{}');
export const setState = (db, state) => db.prepare("INSERT INTO kv (key, value) VALUES ('state', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(state));

/** Daily copy to DATA_DIR/backup/vfw-YYYY-MM-DD.db, keeping the newest 7. Safe while the app runs. */
export function backup(db, dir, now = new Date()) {
  const folder = join(dir, 'backup');
  mkdirSync(folder, { recursive: true });
  const name = `vfw-${now.toISOString().slice(0, 10)}.db`;
  const files = readdirSync(folder).filter((f) => /^vfw-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
  if (!files.includes(name)) { db.exec(`VACUUM INTO '${join(folder, name).replace(/'/g, "''")}'`); files.push(name); }
  for (const f of files.slice(0, -7)) rmSync(join(folder, f), { force: true });
}
