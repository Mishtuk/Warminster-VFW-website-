// Hall inquiry: validate, rate-limit, store, then email the post (POST_EMAIL).
// Mail goes out through nodemailer when SMTP_URL is set; otherwise each email is written as a .eml file in DATA_DIR/outbox.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import nodemailer from 'nodemailer';
import { allow } from '../auth.js';
import { etDay, validateInquiry } from '../lib/state.js';

export const HONEYPOT = 'website'; // hidden field real people leave empty

export function createMailer({ env, dataDir, log = () => {} }) {
  let seq = 0;
  const smtp = env.SMTP_URL ? nodemailer.createTransport(env.SMTP_URL, { connectionTimeout: 10000, socketTimeout: 15000 }) : null;
  const file = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
  const from = env.MAIL_FROM || env.POST_EMAIL || 'website@localhost';
  return async function send(msg) {
    const mail = { from, ...msg };
    if (smtp) return smtp.sendMail(mail);
    const info = await file.sendMail(mail);
    const dir = join(dataDir, 'outbox');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${Date.now()}-${++seq}.eml`), info.message);
    log(`email (outbox): ${mail.to} | ${mail.subject}`);
  };
}

const row = (label, v) => (v ? `${label}: ${v}\n` : '');
export const inquiryText = (v) => `New hall rental inquiry\n\n${row('Name', v.name)}${row('Phone', v.phone)}${row('Email', v.email)}${row('Event date', v.eventDate)}`
  + `${row('Event type', v.eventType)}${row('Guests', v.guests)}${v.message ? `\nMessage:\n${v.message}\n` : ''}`;

/** Returns async (fields, ip) => { status, body }. fields = parsed JSON or form values. Never throws: mail trouble is logged, the inquiry is kept. */
export function createInquiryHandler({ db, env, dataDir, log = () => {}, send = createMailer({ env, dataDir, log }), now = () => new Date() }) {
  return async function submit(fields, ip) {
    if (String(fields?.[HONEYPOT] ?? '').trim()) return { status: 200, body: { ok: true } }; // a bot filled the hidden field: look successful, store nothing
    if (!allow(`inquiry:ip:${ip}`, 5) || !allow('inquiry:all', 100)) return { status: 429, body: { error: 'rate' } };
    const v = validateInquiry(fields);
    if (v.error) return { status: 400, body: { error: v.error } };
    const q = v.value;
    const at = now();
    const r = db.prepare('INSERT INTO inquiries (at, day, name, phone, email, event_date, event_type, guests, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(+at, etDay(at), q.name, q.phone, q.email, q.eventDate, q.eventType, q.guests, q.message);
    const to = env.POST_EMAIL || (env.SMTP_URL ? '' : 'post@localhost.invalid'); // no SMTP: always write the .eml to the outbox
    if (!to) log('inquiry saved, but POST_EMAIL is not set so nothing was emailed');
    else {
      try {
        await send({ to, subject: `Hall rental inquiry from ${q.name}`, text: inquiryText(q), ...(q.email ? { replyTo: q.email } : {}) });
        db.prepare('UPDATE inquiries SET emailed = 1 WHERE id = ?').run(r.lastInsertRowid);
      } catch (e) { log('inquiry email failed:', e.message); }
    }
    return { status: 200, body: { ok: true } };
  };
}
