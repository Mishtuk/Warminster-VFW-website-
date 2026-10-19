// One admin account (username + password), signed session cookie, rate limits. No third-party login.
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const COOKIE = 'vfw_admin';
export const SESSION_DAYS = 7;

const b64u = (b) => Buffer.from(b).toString('base64url');
const mac = (secret, data) => createHmac('sha256', secret).update(data).digest();

/** Cookie value: base64url("name.exp.version") + "." + base64url(HMAC). The version is admin.session_v: a new password ends every session. */
export const signSession = (name, exp, secret, version = 0) => {
  const data = b64u(`${name}.${exp}.${version}`);
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
  const version = Number(parts.pop());
  const exp = Number(parts.pop());
  const name = parts.join('.');
  return exp > now && name === known.name && version === known.version ? name : null;
}

export const cookieHeader = (value, { secure, maxAge = SESSION_DAYS * 86400 }) =>
  `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
export const readCookie = (header) => header?.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) ?? null;

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

// Lockout: 5 failed sign-ins for an IP or a username, then 15 minutes of refusals.
export const LOCK = { max: 5, ms: 15 * 60e3 };
const fails = new Map();
export const locked = (key, now = Date.now()) => (fails.get(key)?.until ?? 0) > now;
export function recordFailure(key, now = Date.now()) {
  const f = fails.get(key) ?? { n: 0, first: now, until: 0 };
  if (now - f.first > LOCK.ms) Object.assign(f, { n: 0, first: now });
  if (++f.n >= LOCK.max) f.until = now + LOCK.ms;
  fails.set(key, f);
}
export const clearFailures = (key) => fails.delete(key);

/** Client address: the last X-Forwarded-For entry (the one the host's proxy adds), without a port. */
export function clientIp(req) {
  const last = String(req.headers.get('x-forwarded-for') ?? 'local').split(',').pop().trim();
  return last.replace(/^(\d+\.\d+\.\d+\.\d+):\d+$/, '$1').replace(/^\[(.+)\]:\d+$/, '$1');
}

// ---------- the admin account ----------
const SCRYPT = { N: 16384, r: 8, p: 1 };
export const hashPassword = (pw, salt = randomBytes(16)) => ({ salt: salt.toString('hex'), hash: scryptSync(String(pw), salt, 64, SCRYPT).toString('hex') });
export function verifyPassword(pw, salt, hash) {
  const got = scryptSync(String(pw), Buffer.from(salt, 'hex'), 64, SCRYPT);
  const want = Buffer.from(hash, 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}
const DUMMY = hashPassword('no-such-account-placeholder');

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
export function checkLogin(db, username, pw) {
  const row = adminRow(db);
  const ok = verifyPassword(String(pw ?? ''), row?.salt ?? DUMMY.salt, row?.hash ?? DUMMY.hash);
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
