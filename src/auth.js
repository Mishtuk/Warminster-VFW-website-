// One admin account (username + password), signed session cookie, rate limits. No third-party login.
import { createHmac, randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { resolve, sep } from 'node:path';

export const COOKIE = 'vfw_admin';
export const SECURE_COOKIE = '__Host-vfw_admin'; // over https the cookie is host-locked: a sibling subdomain can't plant or overwrite it
const cookieName = (secure) => (secure ? SECURE_COOKIE : COOKIE);
export const SESSION_DAYS = 7;

const b64u = (b) => Buffer.from(b).toString('base64url');
const mac = (secret, data) => createHmac('sha256', secret).update(data).digest();

/** Cookie value: base64url("name.exp.version.nonce") + "." + base64url(HMAC-SHA256). The nonce is 128 random bits from crypto.randomBytes, so every
 *  session value is unique. The version is admin.session_v: a new password or a sign-out ends every session. */
export const signSession = (name, exp, secret, version = 0) => {
  const data = b64u(`${name}.${exp}.${version}.${randomBytes(16).toString('hex')}`);
  return `${data}.${b64u(mac(secret, data))}`;
};

/** The signed-in username, or null if missing, forged, expired, or from an older session version. known = { name, version }. */
export function verifySession(value, secret, known, now = Date.now()) {
  const [data, sig, extra] = String(value ?? '').split('.');
  if (!data || !sig || extra !== undefined) return null;
  const want = mac(secret, data);
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  const parts = Buffer.from(data, 'base64url').toString().split('.');
  if (!/^[0-9a-f]{32}$/.test(parts.pop() ?? '')) return null; // nonce
  const version = Number(parts.pop());
  const exp = Number(parts.pop());
  const name = parts.join('.');
  return exp > now && name === known.name && version === known.version ? name : null;
}

export const cookieHeader = (value, { secure, maxAge = SESSION_DAYS * 86400 }) =>
  `${cookieName(secure)}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
export const readCookie = (header, secure = false) => { const n = `${cookieName(secure)}=`; return header?.split(/;\s*/).find((c) => c.startsWith(n))?.slice(n.length) ?? null; };

/** Writes must come from our own pages: the Origin header must equal this site's origin (or PUBLIC_URL's). */
export const sameOrigin = (req, ...origins) => origins.includes(req.headers.get('origin'));

// ponytail: in-memory limiter, resets on restart; fine for one instance.
const hits = new Map();
/** True if `key` has used fewer than `max` tries in the last hour (and records this try). */
export function allow(key, max, now = Date.now()) {
  const recent = (hits.get(key) ?? []).filter((t) => t > now - 3600e3);
  if (recent.length >= max) { hits.set(key, recent); return false; }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

// Lockout with backoff: 5 failures lock a key for 1 minute, the next lock 2, then 4 ... up to 15 minutes. Forgotten after an hour without failures.
// Keys are the client address and username+address, so a stranger can't lock the real admin out from their own address.
export const LOCK = { max: 5, base: 60e3, cap: 15 * 60e3, forget: 3600e3 };
const fails = new Map();
export const locked = (key, now = Date.now()) => (fails.get(key)?.until ?? 0) > now;
export function recordFailure(key, now = Date.now()) {
  if (fails.size > 10000) for (const [k, v] of fails) if (now - v.last > LOCK.forget) fails.delete(k);
  const f = fails.get(key) ?? { n: 0, strikes: 0, last: now, until: 0 };
  if (now - f.last > LOCK.forget) Object.assign(f, { n: 0, strikes: 0 });
  f.last = now;
  if (++f.n >= LOCK.max) { f.until = now + Math.min(LOCK.cap, LOCK.base * 2 ** f.strikes); f.strikes++; f.n = 0; }
  fails.set(key, f);
}
export const clearFailures = (key) => fails.delete(key);

/** The address to rate-limit on. Behind a proxy that appends to X-Forwarded-For, set TRUST_PROXY=1 and the last entry is used.
 *  Otherwise the header is ignored (anyone can forge it) and the socket address is used. peer = the socket address. */
export function pickIp(xff, peer) {
  if (process.env.TRUST_PROXY === '1') {
    const last = String(xff ?? '').split(',').pop().trim().replace(/^(\d+\.\d+\.\d+\.\d+):\d+$/, '$1').replace(/^\[(.+)\]:\d+$/, '$1');
    if (last) return last;
  }
  return peer || 'unknown';
}
/** For a Web Request built by server.js, which copies the socket address into x-vfw-peer. */
export const clientIp = (req) => pickIp(req.headers.get('x-forwarded-for'), req.headers.get('x-vfw-peer'));

// ---------- the admin account ----------
const SCRYPT = { N: 16384, r: 8, p: 1 };
export const hashPassword = (pw, salt = randomBytes(16)) => ({ salt: salt.toString('hex'), hash: scryptSync(String(pw), salt, 64, SCRYPT).toString('hex') });
export function verifyPassword(pw, salt, hash) {
  const got = scryptSync(String(pw), Buffer.from(salt, 'hex'), 64, SCRYPT);
  const want = Buffer.from(hash, 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}
const DUMMY = hashPassword('no-such-account-placeholder');
const scryptAsync = promisify(scrypt);
/** Same as verifyPassword but off the event loop, so a flood of sign-in tries can't stall the site. */
async function verifyPasswordAsync(pw, salt, hash) {
  const got = await scryptAsync(String(pw), Buffer.from(salt, 'hex'), 64, SCRYPT);
  const want = Buffer.from(hash, 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}

export const MIN_PASSWORD = 10;
/** null if acceptable, else a short reason. */
export function passwordProblem(pw, username = 'admin') {
  if (typeof pw !== 'string' || pw.length < MIN_PASSWORD) return 'too_short';
  if (pw.length > 200) return 'too_long';
  const l = pw.trim().toLowerCase();
  if (l === 'admin' || l === 'password' || l === String(username).toLowerCase()) return 'too_easy';
  return null;
}

export const adminRow = (db) => db.prepare('SELECT * FROM admin WHERE id = 1').get() ?? null;
export const defaultInUse = (db) => Boolean(adminRow(db)?.default_pw);

/** First boot only. admin/admin when allowDefault (testing), else ADMIN_PASSWORD, else a random password the caller prints once.
 *  Returns null if an account exists, else { username, password, generated }. */
export function seedAdmin(db, { allowDefault = false, password = '', now = Date.now() } = {}) {
  if (adminRow(db)) return null;
  const generated = !allowDefault && !password;
  const pw = allowDefault ? 'admin' : password || randomBytes(9).toString('base64url');
  const { salt, hash } = hashPassword(pw);
  db.prepare('INSERT INTO admin (id, username, salt, hash, default_pw, updated_at) VALUES (1, ?, ?, ?, ?, ?)').run('admin', salt, hash, allowDefault ? 1 : 0, now);
  return { username: 'admin', password: pw, generated };
}

/** The account if username and password match, else null. Same work either way, so timing doesn't reveal the username. */
export async function checkLogin(db, username, pw) {
  const row = adminRow(db);
  const ok = await verifyPasswordAsync(String(pw ?? ''), row?.salt ?? DUMMY.salt, row?.hash ?? DUMMY.hash);
  return row && ok && String(username ?? '').trim().toLowerCase() === row.username ? row : null;
}

/** Change the password (caller has already checked the current one). Ends every other session (session_v + 1). */
export function setPassword(db, pw, now = Date.now()) {
  const row = adminRow(db);
  const problem = passwordProblem(pw, row.username);
  if (problem) return { error: problem };
  if (verifyPassword(pw, row.salt, row.hash)) return { error: 'same' };
  const { salt, hash } = hashPassword(pw);
  db.prepare('UPDATE admin SET salt = ?, hash = ?, default_pw = 0, session_v = session_v + 1, updated_at = ? WHERE id = 1').run(salt, hash, now);
  return { value: row.username };
}

/** Reasons to refuse to start (checked before the server opens), or null. */
export function startupProblem(env, prod) {
  if (prod && env.SESSION_SECRET && env.SESSION_SECRET.length < 32) return 'SESSION_SECRET must be at least 32 characters (use 32 random bytes as hex), or leave it unset.';
  if (prod && env.ALLOW_DEFAULT_ADMIN === '1') return 'ALLOW_DEFAULT_ADMIN is for testing only; remove it in production.';
  if (env.ADMIN_PASSWORD && (prod ? env.ADMIN_PASSWORD.length < 12 : passwordProblem(env.ADMIN_PASSWORD))) return 'ADMIN_PASSWORD is too weak (production needs at least 12 characters).';
  return null;
}

/** The data folder (database, backups, outbox) and .env must never be inside the folder the web server serves. Returns a reason or null. */
export function dataDirProblem(dataDir, distDir, envFile) {
  const inside = (child, parent) => child === parent || child.startsWith(parent + sep);
  const d = resolve(dataDir), w = resolve(distDir);
  if (inside(d, w)) return `DATA_DIR (${d}) is inside the web root (${w}).`;
  if (envFile && inside(resolve(envFile), w)) return `.env is inside the web root (${w}).`;
  return null;
}
