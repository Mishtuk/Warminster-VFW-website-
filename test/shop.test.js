// Post shop: product and order validators, the shop marker, admin product CRUD and order, pickup orders, privacy and retention.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, purgeOrders } from '../src/db.js';
import { httpsUrl, injectMarkers, shopHtml, validateOrder, validateProduct } from '../src/lib/state.js';

const code = (v) => v.error;

// ---------- validators and the marker ----------
test('httpsUrl and validateProduct: one assert per error code', () => {
  assert.equal(httpsUrl(''), '');
  assert.equal(httpsUrl(' https://pay.example/x?a=1 '), 'https://pay.example/x?a=1');
  for (const u of ['http://pay.example/', 'javascript:alert(1)', 'https://u:p@pay.example/', 'pay.example', 'https://a.example/"x']) assert.equal(httpsUrl(u), null, u);
  const ok = { name: 'Post T-shirt', price: '$20', description: 'Cotton.', options: ['S', 'M', 'L'], checkoutUrl: '' };
  assert.deepEqual(validateProduct(ok).value.options, ['S', 'M', 'L']);
  assert.equal(code(validateProduct({ ...ok, name: ' ' })), 'name');
  assert.equal(code(validateProduct({ ...ok, photo: '../x.webp' })), 'photo');
  for (const u of ['http://pay.example/', 'javascript:alert(1)', 'https://u:p@x.example/']) assert.equal(code(validateProduct({ ...ok, checkoutUrl: u })), 'checkoutUrl', u);
  assert.equal(validateProduct({ ...ok, checkoutUrl: 'https://pay.example/buy' }).value.checkoutUrl, 'https://pay.example/buy');
  assert.equal(code(validateProduct({ ...ok, options: Array.from({ length: 13 }, (_, i) => 'o' + i) })), 'options');
  assert.equal(code(validateProduct({ ...ok, options: ['x'.repeat(31)] })), 'options');
  assert.deepEqual(validateProduct({ ...ok, options: 'S\n M \n\nS\nL' }).value.options, ['S', 'M', 'L']); // one per line, empties and repeats dropped
  assert.equal(validateProduct({ ...ok, description: 'x'.repeat(500) }).value.description.length, 300);
  assert.equal(validateProduct({ ...ok, enabled: false }).value.enabled, false);
});
test('validateOrder: one assert per error code, link and hidden products refused', () => {
  const P = [{ id: 'tee1', name: 'Tee', price: '$20', options: ['S', 'M'], checkoutUrl: '', enabled: true }, { id: 'mug1', name: 'Mug', price: '', options: [], checkoutUrl: '', enabled: true },
    { id: 'link1', name: 'Hat', options: [], checkoutUrl: 'https://pay.example/h', enabled: true }, { id: 'off11', name: 'Old', options: [], checkoutUrl: '', enabled: false }];
  const ok = { item: 'tee1/2', qty: '2', name: 'Jane Smith', phone: '215-555-0100', email: '', note: 'Saturday' };
  assert.deepEqual(validateOrder(ok, P).value, { productId: 'tee1', product: 'Tee', option: 'M', price: '$20', qty: 2, name: 'Jane Smith', phone: '215-555-0100', email: '', note: 'Saturday' });
  assert.equal(validateOrder({ ...ok, item: 'mug1/0' }, P).value.option, '');
  for (const item of ['tee1/0', 'tee1/3', 'mug1/1', 'link1/0', 'off11/0', 'nope1/0', 'tee1', '../x/1', undefined]) assert.equal(code(validateOrder({ ...ok, item }, P)), 'item', String(item));
  for (const qty of [0, 21, 1.5, 'x', '', undefined]) assert.equal(code(validateOrder({ ...ok, qty }, P)), 'qty', String(qty));
  assert.equal(validateOrder({ ...ok, qty: 3 }, P).value.qty, 3);
  assert.equal(code(validateOrder({ ...ok, name: '' }, P)), 'name');
  assert.equal(code(validateOrder({ ...ok, phone: '12' }, P)), 'phone');
  assert.equal(code(validateOrder({ ...ok, phone: '', email: 'bad' }, P)), 'email');
  assert.equal(code(validateOrder({ ...ok, phone: '' }, P)), 'contact');
  assert.equal(validateOrder({ ...ok, note: 'x'.repeat(900) }, P).value.note.length, 500);
});
test('shop marker: coming soon, escaped cards, only on-website products, form only for pickup products', () => {
  assert.match(shopHtml([]), /vfw-shop-soon.*Coming soon.*215-773-0693/);
  assert.ok(!shopHtml([]).includes('<form'));
  const P = [{ id: 'tee1', name: '<img src=x onerror=1>', price: '$20', description: '"q" & <b>', options: ['S', 'L'], photo: '', alt: '', checkoutUrl: '', enabled: true },
    { id: 'link1', name: 'Hat', price: '', description: '', options: [], photo: '', checkoutUrl: 'https://pay.example/h?a=1&b=2', enabled: true }, { id: 'off11', name: 'HiddenThing', options: [], checkoutUrl: '', enabled: false }];
  const h = shopHtml(P);
  assert.ok(!h.includes('<img') && h.includes('&lt;img') && !h.includes('<b>') && !h.includes('HiddenThing') && !h.includes('<script'));
  assert.ok(h.includes('href="https://pay.example/h?a=1&amp;b=2" rel="noopener noreferrer">Buy online') && h.includes('data-item="tee1"') && h.includes('value="tee1/2"') && !h.includes('link1/0'));
  assert.ok(h.includes('vfw-prod-ph') && h.includes('action="/api/shop-order"') && h.includes('name="website"') && h.includes('delete them after 12 months'));
  assert.ok(!shopHtml([P[1]]).includes('<form') && shopHtml([P[1]]).includes('Buy online opens our payment service'));
  const page = injectMarkers('<!--vfw:shop--><!--vfw:data-->', { events: [], specials: [], news: [], menu: { sections: [] }, products: P }, '2099-05-10', null, {});
  assert.ok(page.includes('vfw-shop') && !/products|checkoutUrl/.test(page.match(/id="vfw-data">([^<]*)/)[1])); // the data script never carries products
});
test('retention: orders older than the limit are purged', () => {
  const db = openDb(':memory:');
  const now = Date.UTC(2026, 9, 20, 12);
  const ins = db.prepare("INSERT INTO shop_orders (at, day, product_id, product, qty, name) VALUES (?, '2026-01-01', 'a1b2c3', 'Tee', 1, 'A')");
  ins.run(now - 366 * 864e5); ins.run(now - 364 * 864e5);
  assert.equal(purgeOrders(db, 365, now), 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM shop_orders').get().n, 1);
});

// ---------- the real server ----------
const REPO = join(import.meta.dirname, '..');
const tmp = mkdtempSync(join(tmpdir(), 'vfw-shop-'));
const dist = join(tmp, 'dist'), seed = join(tmp, 'seed'), data = join(tmp, 'data');
mkdirSync(seed);
for (const [dir, body] of [['shop', '<main><!--vfw:shop--><div>soon</div><!--/vfw:shop--><!--vfw:data--></main>'], ['support', '<main><!--vfw:data--></main>']]) {
  mkdirSync(join(dist, dir), { recursive: true });
  writeFileSync(join(dist, dir, 'index.html'), body);
}
mkdirSync(join(dist, 'admin'), { recursive: true });
writeFileSync(join(dist, 'index.html'), '<main><!--vfw:data-->home</main>');
let proc, origin, cookie = '';
const UA = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120 test' };
before(async () => {
  mkdirSync(join(data, 'photos'), { recursive: true });
  writeFileSync(join(data, 'photos', 'news-20260101-abcdef.webp'), 'x'); // an uploaded picture a product can use
  const db = openDb(data); // an old order planted before the server starts: its startup purge must remove it
  db.prepare("INSERT INTO shop_orders (at, day, product_id, product, qty, name, phone) VALUES (?, '2024-01-01', 'old111', 'Ancient', 1, 'Old Customer', '215-555-0000')").run(Date.now() - 400 * 864e5);
  db.close();
  proc = spawn(process.execPath, ['server.js'], { cwd: REPO, env: { ...process.env, PORT: '0', DATA_DIR: data, DIST_DIR: dist, SEED_DIR: seed, ALLOW_DEFAULT_ADMIN: '1', POST_EMAIL: 'post@example.org', SMTP_URL: '', NODE_ENV: 'test' } });
  proc.stderr.on('data', (d) => process.stderr.write(d));
  const port = await new Promise((ok, no) => { proc.stdout.on('data', (d) => { const m = /\(port (\d+),/.exec(String(d)); if (m) ok(+m[1]); }); proc.on('exit', (c) => no(new Error(`server exited ${c}`))); });
  origin = `http://localhost:${port}`;
  const r = await fetch(`${origin}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ username: 'admin', password: 'admin' }) });
  cookie = r.headers.get('set-cookie').split(';')[0];
});
after(() => { proc?.kill(); try { rmSync(tmp, { recursive: true, force: true, maxRetries: 3 }); } catch {} });
const call = (method, path, body, headers = {}) => fetch(origin + path, { method, redirect: 'manual', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
const admin = (method, path, body) => call(method, `/api/admin/${path}`, body, { Origin: origin, Cookie: cookie });
const pub = (path, body, headers = {}) => call('POST', path, body, { Origin: origin, ...headers });
const outbox = () => { try { return readdirSync(join(data, 'outbox')).map((f) => readFileSync(join(data, 'outbox', f), 'utf8')); } catch { return []; } };
let tee, mug, hat;

test('startup purge removed the old order and logged it', async () => {
  assert.equal((await (await admin('GET', 'orders')).json()).orders.length, 0);
  assert.ok((await (await admin('GET', 'security')).json()).events.some((e) => e.type === 'orders_purged' && /1 older than 365 days/.test(e.detail)));
});

test('shop page says Coming soon style static seed until a product exists; order refused with no products', async () => {
  assert.ok((await (await call('GET', '/shop/', null, UA)).text()).includes('vfw-shop-soon'));
  assert.equal((await (await pub('/api/shop-order', { item: 'tee1/1', qty: 1, name: 'A', phone: '215-555-0100' })).json()).error, 'item');
});

test('admin products: sign-in and origin needed, validation, create appends, edit keeps place, hide, picture in use, reorder, delete', async () => {
  assert.equal((await call('PUT', '/api/admin/products/new', { name: 'x' })).status, 401);
  assert.equal((await call('PUT', '/api/admin/products/new', { name: 'x' }, { Origin: 'http://evil.example', Cookie: cookie })).status, 403);
  assert.equal((await (await admin('PUT', 'products/new', { name: '' })).json()).error, 'name');
  for (const u of ['http://pay.example/', 'javascript:alert(1)', 'https://u:p@pay.example/']) assert.equal((await (await admin('PUT', 'products/new', { name: 'Hat', checkoutUrl: u })).json()).error, 'checkoutUrl', u);
  assert.equal((await (await admin('PUT', 'products/new', { name: 'Hat', options: 'x'.repeat(40) })).json()).error, 'options');
  assert.equal((await (await admin('PUT', 'products/new', { name: 'Hat', photo: 'news-20990101-ffffff.webp' })).json()).error, 'photo');
  tee = (await (await admin('PUT', 'products/new', { name: 'Post T-shirt', price: '$20', options: 'S\nM\nL', description: 'Soft cotton.', photo: 'news-20260101-abcdef.webp', enabled: true })).json()).item;
  mug = (await (await admin('PUT', 'products/new', { name: 'Coffee mug', price: '$10' })).json()).item;
  const r = await (await admin('PUT', 'products/new', { name: 'Post hat', price: '$15', checkoutUrl: 'https://pay.example/hat' })).json();
  hat = r.item;
  assert.deepEqual(r.items.map((p) => p.name), ['Post T-shirt', 'Coffee mug', 'Post hat']);
  const edited = await (await admin('PUT', `products/${mug.id}`, { ...mug, price: '$12' })).json();
  assert.deepEqual(edited.items.map((p) => [p.name, p.price]), [['Post T-shirt', '$20'], ['Coffee mug', '$12'], ['Post hat', '$15']]); // an edit keeps its place
  assert.equal((await admin('PUT', 'products/nope1234', { name: 'x' })).status, 404);
  assert.equal((await admin('DELETE', 'photos/news-20260101-abcdef.webp')).status, 409); // a product uses the picture
  assert.equal((await (await admin('GET', 'state')).json()).products.length, 3);
  assert.equal((await (await admin('PUT', 'products-order', { ids: [hat.id, tee.id] })).json()).error, 'order'); // missing one
  assert.equal((await (await admin('PUT', 'products-order', { ids: [hat.id, hat.id, tee.id] })).json()).error, 'order'); // repeated
  assert.equal((await (await admin('PUT', 'products-order', { ids: [hat.id, tee.id, 'zzzz9999'] })).json()).error, 'order'); // unknown
  const moved = await (await admin('PUT', 'products-order', { ids: [hat.id, tee.id, mug.id] })).json();
  assert.deepEqual(moved.items.map((p) => p.name), ['Post hat', 'Post T-shirt', 'Coffee mug']);
  const page = await (await call('GET', '/shop/', null, UA)).text();
  assert.ok(page.indexOf('Post hat') < page.indexOf('Post T-shirt') && page.indexOf('Post T-shirt') < page.indexOf('Coffee mug')); // card order follows the admin order
  assert.ok(page.includes('href="https://pay.example/hat" rel="noopener noreferrer">Buy online') && page.includes(`value="${tee.id}/3"`) && page.includes(`value="${mug.id}/0"`) && !page.includes(`${hat.id}/0`));
  assert.ok(page.includes('news-20260101-abcdef.webp') && !page.includes('Coming soon'));
  const hidden = await (await admin('PUT', 'products/new', { name: 'Secret hidden item', enabled: false })).json();
  assert.ok(!(await (await call('GET', '/shop/', null, UA)).text()).includes('Secret hidden item'));
  assert.equal((await (await admin('DELETE', `products/${hidden.item.id}`)).json()).items.length, 3);
  assert.equal((await admin('DELETE', `products/${hidden.item.id}`)).status, 404);
  const sec = (await (await admin('GET', 'security')).json()).events.map((e) => e.type);
  assert.ok(['products_create', 'products_update', 'products_delete', 'products_reorder'].every((t) => sec.includes(t)));
});

test('pickup order: stored once, emailed once, right reply; link, hidden and unknown products refused; validation errors', async () => {
  const j = { item: `${tee.id}/3`, qty: 2, name: 'Jane Smith', phone: '215-555-0142', email: 'jane@example.org', note: 'SECRET-NOTE Saturday please', website: '', _page: '/shop' };
  const ok = await pub('/api/shop-order', j);
  assert.deepEqual([ok.status, await ok.json()], [200, { ok: true, item: { name: 'Post T-shirt', option: 'L', qty: 2 } }]);
  const mail = outbox().filter((m) => /New shop order/.test(m));
  assert.equal(mail.length, 1);
  assert.ok(/To: post@example\.org/.test(mail[0]) && /2 x Post T-shirt/.test(mail[0]) && /215-555-0142/.test(mail[0]) && /From: Jane\b/.test(mail[0]) && /under Shop/.test(mail[0]));
  assert.deepEqual((await (await pub('/api/shop-order', { ...j, item: `${mug.id}/0`, qty: '1', note: '' })).json()).item, { name: 'Coffee mug', option: '', qty: 1 });
  for (const [patch, err] of [[{ item: `${hat.id}/0` }, 'item'], [{ item: 'zzzz9999/0' }, 'item'], [{ item: `${tee.id}/9` }, 'item'], [{ item: '' }, 'item'], [{ qty: 0 }, 'qty'], [{ qty: 21 }, 'qty'], [{ name: '' }, 'name'],
    [{ phone: '', email: '' }, 'contact'], [{ phone: '12' }, 'phone'], [{ email: 'bad' }, 'email']]) {
    const r = await pub('/api/shop-order', { ...j, ...patch });
    assert.deepEqual([r.status, (await r.json()).error], [400, err], JSON.stringify(patch));
  }
  await admin('PUT', `products/${mug.id}`, { ...mug, enabled: false });
  assert.equal((await (await pub('/api/shop-order', { ...j, item: `${mug.id}/0` })).json()).error, 'item'); // hidden products cannot be ordered
  await admin('PUT', `products/${mug.id}`, { ...mug, enabled: true });
  const orders = (await (await admin('GET', 'orders')).json()).orders;
  assert.equal(orders.length, 2);
  assert.deepEqual([orders[1].qty, orders[1].product, orders[1].option, orders[1].price, orders[1].name, orders[1].phone, orders[1].email, orders[1].note, orders[1].handled, orders[1].emailed], [2, 'Post T-shirt', 'L', '$20', 'Jane Smith', '215-555-0142', 'jane@example.org', 'SECRET-NOTE Saturday please', false, true]);
  // the order keeps its snapshot after the product changes
  await admin('PUT', `products/${tee.id}`, { ...tee, name: 'Renamed', price: '$99', options: ['S'] });
  assert.equal((await (await admin('GET', 'orders')).json()).orders[1].product, 'Post T-shirt');
  await admin('PUT', `products/${tee.id}`, { ...tee });
});

test('pickup order: bad origin, honeypot stores nothing, no-JS form post redirects (allow-listed), oversize body', async () => {
  const j = { item: `${mug.id}/0`, qty: 1, name: 'Eve', phone: '215-555-0111', website: '', _page: '/shop' };
  const before = (await (await admin('GET', 'orders')).json()).orders.length;
  const evil = await call('POST', '/api/shop-order', j, { Origin: 'http://evil.example' });
  assert.deepEqual([evil.status, (await evil.json()).error], [403, 'origin']);
  const spam = await pub('/api/shop-order', { ...j, website: 'http://spam.example' });
  assert.deepEqual([spam.status, await spam.json()], [200, { ok: true }]);
  assert.equal((await (await admin('GET', 'orders')).json()).orders.length, before);
  const form = (extra) => fetch(`${origin}/api/shop-order`, { method: 'POST', redirect: 'manual', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ item: `${mug.id}/0`, qty: '1', name: 'Pat', phone: '215-555-0122', _page: '/shop', ...extra }) });
  const sent = await form({});
  assert.deepEqual([sent.status, sent.headers.get('location')], [303, '/shop/?sent=1#order']);
  assert.equal((await (await admin('GET', 'orders')).json()).orders.length, before + 1);
  assert.equal((await form({ item: 'zzzz9999/0' })).headers.get('location'), '/shop/?error=item#order');
  assert.equal((await form({ qty: '99', _page: 'https://evil.example/' })).headers.get('location'), '/shop/?error=qty#order'); // a visitor-supplied page is ignored
  const big = await call('POST', '/api/shop-order', { ...j, note: 'x'.repeat(300 * 1024) }, { Origin: origin });
  assert.equal(big.status, 413);
});

test('admin orders: new count, mark handled, delete; security log holds no customer words; nothing private on public pages', async () => {
  const state = async () => (await admin('GET', 'state')).json();
  const orders = (await (await admin('GET', 'orders')).json()).orders;
  assert.equal((await state()).newOrders, orders.length);
  assert.equal((await admin('PUT', `orders/${orders[0].id}`, { handled: true })).status, 200);
  assert.equal((await state()).newOrders, orders.length - 1);
  assert.equal((await call('GET', '/api/admin/orders')).status, 401);
  const sec = (await (await admin('GET', 'security')).json()).events;
  assert.ok(sec.some((e) => e.type === 'shop_order' && e.detail === 'Post T-shirt') && sec.some((e) => e.type === 'shop_honeypot') && sec.some((e) => e.type === 'order_update'));
  const text = JSON.stringify(sec);
  assert.ok(!/Jane|jane@|555-01|SECRET-NOTE|Eve|Pat\b/.test(text), 'no customer text in the log');
  for (const p of ['/', '/shop/', '/support/']) { const t = await (await call('GET', p, null, UA)).text(); assert.ok(!/Jane|jane@example|555-01|SECRET-NOTE|Pat\b|Eve\b/.test(t), p); }
  assert.equal((await admin('DELETE', `orders/${orders[0].id}`)).status, 200);
  assert.equal((await admin('DELETE', `orders/${orders[0].id}`)).status, 404);
  assert.equal((await admin('PUT', 'orders/abc', { handled: true })).status, 404);
  assert.ok((await (await admin('GET', 'security')).json()).events.some((e) => e.type === 'order_delete'));
});

test('rate limit: 5 orders per hour per address, then 429', async () => {
  // earlier tests used 3 stored orders from this address; the next two pass, then it stops
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await pub('/api/shop-order', { item: `${mug.id}/0`, qty: 1, name: 'Rate ' + i, phone: '215-555-02' + (10 + i) })).status);
  assert.deepEqual(codes, [200, 200, 429, 429]);
  assert.equal((await (await pub('/api/shop-order', { item: `${mug.id}/0`, qty: 1, name: 'Rate', phone: '215-555-0299' })).json()).error, 'rate');
  assert.ok((await (await admin('GET', 'security')).json()).events.some((e) => e.type === 'shop_rate_limited'));
});
