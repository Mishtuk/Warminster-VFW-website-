// Rebuilds the static site after staff save content in the admin (see src/lib/content.js). One build at a time; saves made during
// a build queue exactly one more. Each build goes to its own folder in DATA_DIR/site and only goes live once it has finished
// cleanly, so a failed or interrupted build never takes the site down: the pages from before keep being served.
// ponytail: each build copies all of public/ (about 95 MB), a few seconds; serve public/ from dist/ directly if that gets slow.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DONE = '.built'; // written last; dotfiles are never served

/** cmd: the build command without --outDir (tests pass a stand-in). getContent: everything the staff saved, as { key: value }. */
export function createSiteBuilder({ root, data, dist, log = () => {}, getContent, cmd, keep = 2 }) {
  const SITE = join(data, 'site');
  const build = cmd ?? [process.execPath, join(root, 'node_modules', 'astro', 'bin', 'astro.mjs'), 'build', '--silent'];
  const mtime = (f) => { try { return statSync(f).mtimeMs; } catch { return 0; } };
  const builds = () => { try { return readdirSync(SITE).filter((d) => /^\d+$/.test(d)).sort((a, b) => b - a); } catch { return []; } };
  let live = dist, running = null, again = false, last = null;

  /** Keeps the live build and the newest `keep` finished ones; removes the rest, and any build that never finished. Never runs mid-build. */
  function prune() {
    const finished = builds().filter((d) => existsSync(join(SITE, d, DONE))).slice(0, keep);
    for (const d of builds()) {
      if (join(SITE, d) === live || finished.includes(d)) continue;
      try { rmSync(join(SITE, d), { recursive: true, force: true }); } catch (e) { log('rebuild: could not remove an old build', e.code); } // in use on Windows: next time
    }
    try { for (const f of readdirSync(SITE)) if (/^content-\d+\.json$/.test(f)) rmSync(join(SITE, f), { force: true }); } catch {}
  }

  const once = () => new Promise((resolve) => {
    mkdirSync(SITE, { recursive: true });
    const id = String(Math.max(Date.now(), +(builds()[0] ?? 0) + 1)), out = join(SITE, id), file = join(SITE, `content-${id}.json`);
    writeFileSync(file, JSON.stringify(getContent()));
    const started = Date.now();
    let err = '', ended = false;
    const child = spawn(build[0], [...build.slice(1), '--outDir', out], { cwd: root, env: { ...process.env, VFW_CONTENT: file }, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    child.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
    const timer = setTimeout(() => child.kill(), 10 * 60e3);
    const end = (code) => {
      if (ended) return;
      ended = true; clearTimeout(timer);
      rmSync(file, { force: true });
      if (code === 0 && existsSync(join(out, 'index.html'))) {
        writeFileSync(join(out, DONE), '');
        live = out; last = { ok: true, at: Date.now() };
        log(`rebuild: live in ${Math.round((Date.now() - started) / 1000)} s`);
      } else {
        rmSync(out, { recursive: true, force: true });
        last = { ok: false, at: Date.now() };
        log('rebuild failed, still serving the last good build', code, err.trim());
      }
      prune();
      resolve();
    };
    child.on('error', (e) => { err += e.message; end(-1); });
    child.on('close', end);
  });

  /** Queues a rebuild and resolves when the site shows everything saved so far. */
  function rebuild() {
    if (running) { again = true; return running; }
    running = (async () => { do { again = false; await once(); } while (again); })().finally(() => { running = null; });
    return running;
  }

  /** At start: the newest finished build, unless dist/ is newer (a deploy since), and then a fresh build on top of the new code. */
  function start() {
    const done = builds().filter((d) => existsSync(join(SITE, d, DONE)));
    if (done[0] && mtime(join(SITE, done[0], DONE)) >= mtime(join(dist, 'index.html'))) live = join(SITE, done[0]);
    prune();
    if (live === dist && Object.keys(getContent()).length) rebuild();
  }

  return { start, rebuild, live: () => live, status: () => ({ building: !!running, last }) };
}
