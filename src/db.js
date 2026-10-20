// One SQLite file (node:sqlite, no dependency) in DATA_DIR.
// Site content (events, specials, menu, news) is one JSON document under kv key "state"; the rest are small tables.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_SETTINGS } from './lib/state.js';

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
      ip TEXT NOT NULL DEFAULT '', detail TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS shifts (id TEXT PRIMARY KEY, title TEXT NOT NULL, date TEXT NOT NULL, start_time TEXT NOT NULL DEFAULT '', end_time TEXT NOT NULL DEFAULT '',
      slots INTEGER NOT NULL, notes TEXT NOT NULL DEFAULT '', enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS shift_signups (id INTEGER PRIMARY KEY, shift_id TEXT NOT NULL, at INTEGER NOT NULL, name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '');
    CREATE INDEX IF NOT EXISTS shift_signups_shift ON shift_signups (shift_id);
    CREATE TABLE IF NOT EXISTS help_requests (id INTEGER PRIMARY KEY, at INTEGER NOT NULL, day TEXT NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL, best_time TEXT NOT NULL DEFAULT '', message TEXT NOT NULL DEFAULT '',
      handled INTEGER NOT NULL DEFAULT 0, emailed INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS shop_orders (id INTEGER PRIMARY KEY, at INTEGER NOT NULL, day TEXT NOT NULL, product_id TEXT NOT NULL, product TEXT NOT NULL, option TEXT NOT NULL DEFAULT '',
      price TEXT NOT NULL DEFAULT '', qty INTEGER NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
      handled INTEGER NOT NULL DEFAULT 0, emailed INTEGER NOT NULL DEFAULT 0);`);
  return db;
}

/** Days to keep hall inquiries (INQUIRY_RETENTION_DAYS, default 365). Anything that is not a positive whole number means the default. */
export const retentionDays = (v) => (/^[1-9][0-9]{0,4}$/.test(String(v ?? '')) ? Number(v) : 365);
/** Deletes inquiries older than `days`. Returns how many. Daily backups can hold an older copy for up to 7 more days. */
export const purgeInquiries = (db, days, now = Date.now()) => Number(db.prepare('DELETE FROM inquiries WHERE at < ?').run(now - days * 864e5).changes);

/** Deletes shop orders older than `days` (SHOP_RETENTION_DAYS, default 365). Returns how many. */
export const purgeOrders = (db, days, now = Date.now()) => Number(db.prepare('DELETE FROM shop_orders WHERE at < ?').run(now - days * 864e5).changes);

export const getState = (db) => JSON.parse(db.prepare("SELECT value FROM kv WHERE key = 'state'").get()?.value ?? '{}');
export const setState = (db, state) => db.prepare("INSERT INTO kv (key, value) VALUES ('state', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(state));

/** Help requests are kept 90 days. Returns how many were deleted. */
export const HELP_DAYS = 90;
export const purgeHelp = (db, now = Date.now()) => Number(db.prepare('DELETE FROM help_requests WHERE at < ?').run(now - HELP_DAYS * 864e5).changes);
/** Deletes shifts (and their sign-ups) dated before `cutoff` (YYYY-MM-DD; the caller passes ET today minus 7 days). Returns how many shifts. */
export function purgeShifts(db, cutoff) {
  db.prepare('DELETE FROM shift_signups WHERE shift_id IN (SELECT id FROM shifts WHERE date < ?)').run(cutoff);
  return Number(db.prepare('DELETE FROM shifts WHERE date < ?').run(cutoff).changes);
}

// Site settings: kv key "settings". Not part of "state", so the public data script can never include them.
export const getSettings = (db) => ({ ...DEFAULT_SETTINGS, ...JSON.parse(db.prepare("SELECT value FROM kv WHERE key = 'settings'").get()?.value ?? '{}') });
export const setSettings = (db, v) => db.prepare("INSERT INTO kv (key, value) VALUES ('settings', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(v));

/** Shifts with how many people signed up. */
export const shiftsWithCounts = (db) => db.prepare('SELECT s.*, (SELECT COUNT(*) FROM shift_signups g WHERE g.shift_id = s.id) AS filled FROM shifts s ORDER BY s.date, s.start_time, s.title').all()
  .map((r) => ({ id: r.id, title: r.title, date: r.date, start: r.start_time, end: r.end_time, slots: r.slots, notes: r.notes, enabled: Boolean(r.enabled), filled: r.filled }));

/** Daily copy to DATA_DIR/backup/vfw-YYYY-MM-DD.db, keeping the newest 7. Safe while the app runs. */
export function backup(db, dir, now = new Date()) {
  const folder = join(dir, 'backup');
  mkdirSync(folder, { recursive: true });
  const name = `vfw-${now.toISOString().slice(0, 10)}.db`;
  const files = readdirSync(folder).filter((f) => /^vfw-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
  if (!files.includes(name)) { db.exec(`VACUUM INTO '${join(folder, name).replace(/'/g, "''")}'`); files.push(name); }
  for (const f of files.slice(0, -7)) rmSync(join(folder, f), { force: true });
}
