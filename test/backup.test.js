import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { openDb, getState, setState } from '../src/db.js';

const BASE = join(import.meta.dirname, '..', '.claude', 'work', 'tmp');
const run = (s, env, ...a) => spawnSync(process.execPath, [join(import.meta.dirname, '..', 'scripts', s), ...a], { env: { ...process.env, ...env }, encoding: 'utf8' });

test('backup then wipe then restore brings back rows and photos; refuses non-empty without --force', () => {
  mkdirSync(BASE, { recursive: true });
  const root = mkdtempSync(join(BASE, 'bk-'));
  try {
    const data = join(root, 'data'), bdir = join(root, 'backups');
    const db = openDb(data);
    setState(db, { news: [{ id: 'a', title: 'Hello' }] });
    db.prepare("INSERT INTO hall_bookings (date, status, note, updated_at) VALUES ('2030-01-02','booked','x',1)").run();
    mkdirSync(join(data, 'photos'));
    writeFileSync(join(data, 'photos', 'news-20300101-abcdef.webp'), 'IMG');
    const b = run('backup.mjs', { DATA_DIR: data, BACKUP_DIR: bdir, BACKUP_KEEP: '2' }); // db still open: backup must be consistent
    assert.equal(b.status, 0, b.stderr); assert.match(b.stdout, /backup ok/);
    db.close();
    run('backup.mjs', { DATA_DIR: data, BACKUP_DIR: bdir, BACKUP_KEEP: '2' }); run('backup.mjs', { DATA_DIR: data, BACKUP_DIR: bdir, BACKUP_KEEP: '2' });
    const archives = readdirSync(bdir); assert.equal(archives.length, 2, 'pruned to 2');
    rmSync(data, { recursive: true });
    const arch = join(bdir, archives.sort().at(-1));
    const r = run('restore.mjs', {}, arch, data); assert.equal(r.status, 0, r.stderr);
    const back = openDb(data);
    assert.equal(getState(back).news[0].title, 'Hello');
    assert.equal(back.prepare('SELECT status FROM hall_bookings').get().status, 'booked');
    back.close();
    assert.equal(readFileSync(join(data, 'photos', 'news-20300101-abcdef.webp'), 'utf8'), 'IMG');
    assert.notEqual(run('restore.mjs', {}, arch, data).status, 0, 'non-empty refused');
    assert.equal(run('restore.mjs', {}, arch, data, '--force').status, 0);
    assert.notEqual(run('backup.mjs', { DATA_DIR: join(root, 'nope'), BACKUP_DIR: bdir }).status, 0, 'fails loudly');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
