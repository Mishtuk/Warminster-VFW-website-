// Security-event log: sign-ins, lockouts, password changes, sign-outs, admin edits, rejected inquiries, purges.
// Stored in the security_events table (newest 500 kept, newest 50 shown in the admin) and printed to the server log.
// Never pass passwords, session tokens or whole inquiry bodies in here. Every value is cleaned first, so a visitor can't forge log lines.

const CONTROL = new RegExp('[\u0000-\u001f\u007f-\u009f' + String.fromCharCode(0x2028, 0x2029) + ']+', 'g'); // C0/C1 controls plus line/paragraph separators
/** Makes a user-supplied value safe for one log line: control characters (CR, LF, tab, escapes ...) become one space, cut to max. */
export const clean = (v, max = 80) => String(v ?? '').replace(CONTROL, ' ').trim().slice(0, max);

export const KEEP = 500;

export function createAudit({ db, log = () => {} }) {
  const insert = db.prepare('INSERT INTO security_events (at, type, who, ip, detail) VALUES (?, ?, ?, ?, ?)');
  const trim = db.prepare('DELETE FROM security_events WHERE id NOT IN (SELECT id FROM security_events ORDER BY id DESC LIMIT ?)');
  /** event('login_fail', 'admin', '203.0.113.9', 'wrong password') */
  function event(type, who = '', ip = '', detail = '', now = Date.now()) {
    const row = [clean(type, 40), clean(who, 64), clean(ip, 64), clean(detail, 200)];
    try { insert.run(now, ...row); trim.run(KEEP); } catch (e) { log('audit: could not store event', e.message); }
    log(`security: ${row[0]} who=${row[1]} ip=${row[2]} ${row[3]}`);
  }
  const recent = (n = 50) => db.prepare('SELECT at, type, who, ip, detail FROM security_events ORDER BY id DESC LIMIT ?').all(n);
  return { event, recent };
}
