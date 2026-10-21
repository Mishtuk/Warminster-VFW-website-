// Beer taps: press a tap and beer pours down the screen, splashes on the page's boxes and drains off the bottom.
// Desktop only (wide screen, fine pointer, no reduced motion). Two lazy fixed canvases; no layout changes, no blocked clicks.
const DESKTOP = '(min-width: 900px) and (pointer: fine)', CALM = '(prefers-reduced-motion: reduce)';
const FIXED = '.snap, .menu-card, .card, [data-pour-collide]';
const GENERIC = 'main img, main figure, main article, main aside, main section, main li, main div, main a';
const MAX = 900, BURST = 1500, G = 1900, Z = 45, FEED = 120, FID = 'vfw-goo'; // FEED = film particles per second where a stream lands; z-index 45: the site header is 50, the theme button 40
const V0 = 400, W0 = 9, SPOUT = 16, TAU = 6.2832, SLIDE = 3; // stream leaves the spout at V0 px/s, W0 px wide; the chrome spout hangs ~16px below .tap-nozzle; SLIDE boosts g·sinθ (page tilts are only 1-2°)

// a collider: centre, half size and angle (CSS rotation, clockwise), plus its screen bounding box l/r/t/b for quick rejects
type Box = { el: Element; cx: number; cy: number; hw: number; hh: number; a: number; co: number; si: number; l: number; r: number; t: number; b: number; gone?: boolean };
// c = box being ridden, from = box just left (not landed on again); fl/fa/g = foam life/age/grow time (fl 0 = beer);
// b = bubble phase (-1 none); h = seconds a drip still hangs at the spout (sy); u = place along the ridden top edge (vx is then the speed along it)
type P = { x: number; y: number; vx: number; vy: number; r: number; r0: number; col: number; hi: number; ttl: number; c?: Box; from?: Box; u: number; fl: number; fa: number; g: number; b: number; h: number; sy: number; pal: Pal };
type Pal = { b: number[]; f: number[]; hi: number; s: string; sh: string; hs: string; foam: number; life: number; surge: boolean };
type St = { x: number; y0: number; top: number; tip: number; land: number; on: boolean; acc: number; vt: number; t: number; pal: Pal }; // one liquid column per pour: spout (y0) down to where it lands (tip, at most land)

// Beer styles: body shades, highlight, stream shade, foam (head) shades, foam share of the pool, head life (s); a stout's head surges first
const STYLES: Record<string, { b: string[]; hi: string; s: string; sh: string; f: string[]; foam: number; life: number; surge?: boolean; hs?: string }> = {
  light: { b: ['#f1cc52', '#e7bf43', '#f7d86e'], hi: '#fff4c2', s: '#efc94e', sh: '#c39421', f: ['#fffbf2', '#f3ead3'], foam: 0.34, life: 2.2 },
  amber: { b: ['#dc8f0c', '#d4850a', '#e29a14'], hi: '#ffd25a', s: '#de920f', sh: '#9e5a04', f: ['#f9f2e1', '#eee1c0'], foam: 0.3, life: 2.2 },
  wheat: { b: ['#e9a33b', '#df9731', '#f0b453'], hi: '#ffdc96', s: '#eaa841', sh: '#b06c1c', f: ['#fdf6e7', '#f1e4c5'], foam: 0.36, life: 2.6 },
  stout: { b: ['#2c1309', '#38180b', '#24100a'], hi: '#b03048', s: '#3b1d10', sh: '#120805', f: ['#dbc193', '#ecdcb8'], foam: 0.22, life: 4.2, surge: true, hs: '#b07d50' },
};
const ink: string[] = [], role: number[] = []; // every colour in use; role 0 beer, 1 foam, 2 highlight (draw order)
const inkOf = (c: string, k: number) => { let i = ink.findIndex((x, j) => x === c && role[j] === k); if (i < 0) { i = ink.push(c) - 1; role[i] = k; } return i; };
const mix = (a: string, b: string, t: number) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('');
const kind = (t: string) => /guinness|stout|porter|murphy|beamish/.test(t) ? 'stout' : /light|lite|ultra|pils|seltzer|helles|k[oö]lsch/.test(t) ? 'light'
  : /blue moon|wheat|white|\bwit|hefe|weiss|shock top/.test(t) ? 'wheat' : /yuengling|budweiser|modelo|lager|ale\b|ipa|amber/.test(t) ? 'amber' : '';
const pals = new WeakMap<Element, Pal>();
/** The tap's beer, from its name (then its subtitle); a data-liquid hex on the tap overrides the body colour. */
function palette(tap: Element): Pal {
  let p = pals.get(tap); if (p) return p;
  const txt = (q: string) => (tap.querySelector(q)?.textContent ?? '').toLowerCase();
  const S = STYLES[kind(txt('.tap-name')) || kind(txt('.tap-sub')) || 'amber'];
  let b = S.b, hi = S.hi, s = S.s, sh = S.sh, hs = S.hs ?? hi;
  let hex = tap.getAttribute('data-liquid')?.trim() ?? '';
  if (/^#[0-9a-f]{3}$/i.test(hex)) hex = '#' + [...hex.slice(1)].map((h) => h + h).join('');
  if (/^#[0-9a-f]{6}$/i.test(hex)) { b = [mix(hex, '#000000', 0.06), mix(hex, '#000000', 0.14), mix(hex, '#ffffff', 0.08)]; if (!S.surge) hi = hs = mix(hex, '#ffffff', 0.5); s = hex; sh = mix(hex, '#000000', 0.38); }
  p = { b: b.map((c) => inkOf(c, 0)), f: S.f.map((c) => inkOf(c, 1)), hi: inkOf(hi, 2), s, sh, hs, foam: S.foam, life: S.life, surge: !!S.surge };
  pals.set(tap, p); return p;
}

const pours = new Map<Element, { until: number; held: boolean; st: St }>();
const streams = new Set<St>();
const parts: P[] = [], free: P[] = [];
let defs: SVGSVGElement | null = null, canvas: HTMLCanvasElement | null = null, glass: HTMLCanvasElement | null = null, ctx: CanvasRenderingContext2D | null = null, tcx: CanvasRenderingContext2D | null = null;
let raf = 0, last = 0, floor = 0, sy = 0, scanY = 0, meas = 0, moved = false, fresh = true;
let els: Element[] = [], boxes = new Map<Element, Box>(), list: Box[] = [], geo = new Map<Element, [number, number, number]>(); // geo: half width, half height, angle (cached per scan)
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const side = () => (Math.random() < 0.5 ? -1 : 1);

const ok = () => matchMedia(DESKTOP).matches && !matchMedia(CALM).matches;

function size() {
  for (const k of [canvas, glass]) if (k) { k.width = innerWidth; k.height = innerHeight; } // 1x keeps the blur pass cheap; merged edges stay smooth anyway
}
const onScroll = () => { moved = true; }; // capture: also catches scrolling boxes (carousels)
const onResize = () => { size(); fresh = true; };

function make() {
  if (canvas) return;
  const N = 'http://www.w3.org/2000/svg', el = (t: string, a: Record<string, string>, k?: Element) => { const e = document.createElementNS(N, t); for (const n in a) e.setAttribute(n, a[n]); k?.append(e); return e; };
  defs = el('svg', { width: '0', height: '0', 'aria-hidden': 'true', style: 'position:absolute' }) as SVGSVGElement;
  const f = el('filter', { id: FID, x: '0', y: '0', width: '100%', height: '100%', 'color-interpolation-filters': 'sRGB' }, defs); // blur, then an alpha threshold: touching blobs fuse into liquid with crisp edges
  el('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: '4.5' }, f);
  el('feColorMatrix', { values: '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10' }, f);
  const css = `position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:${Z}`;
  canvas = document.createElement('canvas'); glass = document.createElement('canvas'); // goo layer (pooled film, foam) under a crisp one (streams, drops, bubbles)
  canvas.style.cssText = `${css};filter:url(#${FID})`; glass.style.cssText = css;
  for (const k of [canvas, glass]) k.setAttribute('aria-hidden', 'true');
  document.body.append(defs, canvas, glass);
  ctx = canvas.getContext('2d'); tcx = glass.getContext('2d');
  size();
  addEventListener('resize', onResize);
  addEventListener('scroll', onScroll, { passive: true, capture: true });
}
function drop() {
  removeEventListener('resize', onResize); removeEventListener('scroll', onScroll, { capture: true });
  canvas?.remove(); glass?.remove(); defs?.remove(); canvas = glass = ctx = tcx = defs = null;
}

/** Which elements can catch beer: the fixed list, plus visible boxes (background, border, shadow or picture) near the screen.
 *  Styles are read once per pour (and after a resize or a long scroll), not every frame. */
function rescan() {
  const seen = new Set<Element>(document.querySelectorAll(FIXED));
  const taps = document.querySelector('[data-pour]');
  for (const e of document.querySelectorAll(GENERIC)) {
    if (seen.has(e) || e.contains(taps) || taps?.contains(e) || e.closest('header')) continue;
    const q = e.getBoundingClientRect();
    if (q.width < 60 || q.height < 30 || q.width > innerWidth * 0.9 || q.bottom < -innerHeight || q.top > innerHeight * 2) continue;
    const s = getComputedStyle(e);
    if (s.visibility === 'hidden' || s.display === 'none') continue;
    if (e.tagName === 'IMG' || e.tagName === 'FIGURE' || parseFloat(s.borderTopWidth) > 0 || s.boxShadow !== 'none' || !/^rgba\(.*, 0\)$|^transparent$/.test(s.backgroundColor)) seen.add(e);
  }
  const memo = new Map<Element, number>();
  geo = new Map();
  for (const e of seen) { // untransformed size and the summed rotation of it and its ancestors (tilted snapshots, slides, stamps)
    const a = tilt(e, memo), h = e as HTMLElement, q = h.offsetWidth ? null : e.getBoundingClientRect();
    if (Math.abs(a) < 0.6) geo.set(e, [(q ? q.width : h.offsetWidth) / 2, (q ? q.height : h.offsetHeight) / 2, a]);
  }
  els = [...geo.keys()]; scanY = scrollY;
}
function tilt(e: Element | null, memo: Map<Element, number>): number {
  if (!e || e === document.body) return 0;
  let a = memo.get(e);
  if (a === undefined) {
    const s = getComputedStyle(e), m = /^matrix(?:3d)?\(([^,]+),\s*([^,]+)/.exec(s.transform), r = /(-?[\d.]+)deg\s*$/.exec(s.rotate || '');
    a = (m ? Math.atan2(+m[2], +m[1]) : 0) + (r ? (+r[1] * Math.PI) / 180 : 0) + tilt(e.parentElement, memo);
    memo.set(e, a);
  }
  return a;
}
/** Fresh rects for the cached elements and spouts. Between these, scrolling just shifts everything (shift). */
function measure(now: number) {
  if (fresh || Math.abs(scrollY - scanY) > innerHeight * 0.8) { fresh = false; rescan(); }
  moved = false; meas = now; sy = scrollY;
  for (const [tap, s] of pours) {
    const z = tap.querySelector('.tap-nozzle')?.getBoundingClientRect();
    if (z) { s.st.x = z.left + z.width / 2; s.st.y0 = z.bottom + SPOUT; floor = Math.max(floor, z.bottom); }
  }
  const next = new Map<Element, Box>();
  for (const e of els) {
    const q = e.getBoundingClientRect();
    const g = geo.get(e);
    if (!g || q.width < 20 || q.height < 10 || q.bottom < -innerHeight || q.top > innerHeight * 2 || q.top < floor) continue;
    const b = boxes.get(e) ?? { el: e, cx: 0, cy: 0, hw: 0, hh: 0, a: 0, co: 1, si: 0, l: 0, r: 0, t: 0, b: 0 };
    b.l = q.left; b.r = q.right; b.t = q.top; b.b = q.bottom; b.cx = (q.left + q.right) / 2; b.cy = (q.top + q.bottom) / 2; // a rotated box's bounds share its centre
    b.a = g[2]; b.co = Math.cos(g[2]); b.si = Math.sin(g[2]);
    const k = q.width / (2 * (g[0] * b.co + g[1] * Math.abs(b.si))) || 1; // a scaled ancestor (e.g. a side slide) shrinks it
    b.hw = g[0] * k; b.hh = g[1] * k;
    next.set(e, b);
  }
  for (const [e, b] of boxes) if (!next.has(e)) b.gone = true;
  boxes = next; list = [...next.values()];
}
/** The page scrolled by d px: move the boxes, spouts and the beer with it (no layout reads). */
function shift(d: number) {
  floor -= d;
  for (const b of list) { b.t -= d; b.b -= d; b.cy -= d; }
  for (const s of streams) { s.y0 -= d; s.top -= d; s.tip -= d; }
  for (const p of parts) { p.y -= d; p.sy -= d; }
}

function mk(pal: Pal, x: number, y: number, vx: number, vy: number, r: number): P { // particles are recycled, not reallocated
  const p = free.pop() ?? ({} as P);
  p.pal = pal; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.r = p.r0 = r; p.col = pal.b[(Math.random() * 3) | 0]; p.hi = pal.hi;
  p.ttl = p.fl = p.fa = p.g = p.h = p.sy = p.u = 0; p.b = -1; p.c = p.from = undefined;
  parts.push(p); return p;
}
function foam(p: P, big: number) { const pal = p.pal; p.hi = -1; p.col = pal.f[(Math.random() * pal.f.length) | 0]; p.fl = pal.life * rnd(0.7, 1.3); p.g = pal.surge ? rnd(0.5, 0.9) : 0.15; p.r0 *= big; }
function splash(x: number, t: number, pal: Pal) {
  const k = 2 + ((Math.random() * 2) | 0);
  for (let i = 0; i < k && parts.length < MAX; i++) {
    const p = mk(pal, x + rnd(-3, 3), t - 3, side() * rnd(25, 120), -rnd(90, 260), rnd(2.6, 3.8));
    if (Math.random() < 0.35) foam(p, 1); // falls back and rejoins as a riding film
  }
}

function step(p: P, dt: number) {
  if (p.fl) { // foam: rises quickly (a stout surges slowly), then settles away
    p.fa += dt;
    if (p.fa >= p.fl) { p.y = 1e9; return; }
    p.r = p.fa < p.g ? p.r0 * (0.3 + 0.7 * (p.fa / p.g)) : p.r0 * Math.sqrt(1 - ((p.fa - p.g) / (p.fl - p.g)) ** 2);
  }
  if (p.h > 0) { // a drip swelling under the spout, then letting go
    p.h -= dt; p.r = p.r0 * Math.min(1, Math.max(0, 1 - p.h / 0.5)); p.y = p.sy + p.r * 0.95;
    if (p.h <= 0) p.vy = 30;
    return;
  }
  if (p.b >= 0) p.b = (p.b + dt * 0.8) % 1;
  if (p.c) { // riding a box's top edge: slide, rub, run downhill, roll off the ends
    const c = p.c, f = p.fl > 0;
    if (p.ttl > 8) { p.y = 1e9; return; } // safety net only: beer normally runs off an edge first
    if (c.gone || p.u < -c.hw || p.u > c.hw) { p.c = undefined; p.from = c; p.vy = p.vx * c.si; p.vx *= c.co; if (!f) for (let i = 1; i < 4 && parts.length < MAX; i++) { const q = mk(p.pal, p.x - Math.sign(p.vx) * i * 3, p.y - p.vy / Math.abs(p.vx || 1) * i * 3, p.vx, p.vy, p.r); q.col = p.col; q.from = c; } return; } // leaves along the slope; a short tail of beer behind it keeps the first runoff one thread, not dashes
    p.ttl += dt;
    const flat = Math.max(0, 1 - Math.abs(c.a) / 0.012), out = p.u < 0 ? -1 : 1, k = 3.5 / p.r0; // level: spread to the nearest edge (big blobs and foam creep)
    if (flat && p.vx * out < (f ? 14 : 160)) p.vx += out * (f ? 30 : 420 * k * k) * flat * dt;
    p.vx += G * c.si * SLIDE * (f ? 0.4 : 1) * dt; // sloped: g·sinθ downhill against friction, so the film moves as one; it only sheets off the upper end if it came in fast
    p.vx *= 1 - (f ? 3 : 1.2 + 0.8 * (1 - flat)) * dt;
    p.u += p.vx * dt; seat(p, c, f ? 5 : 0);
    return;
  }
  const px = p.x, py = p.y;
  p.vy += G * dt; p.x += p.vx * dt; p.y += p.vy * dt;
  for (const c of list) {
    if (c === p.from || Math.max(px, p.x) < c.l - 8 || Math.min(px, p.x) > c.r + 8 || Math.max(py, p.y) < c.t - 8 || Math.min(py, p.y) > c.b + 8) continue;
    const dx = p.x - c.cx, dy = p.y - c.cy, ox = px - c.cx, oy = py - c.cy, e = p.r * 0.6; // into the box's own (unrotated) frame
    const lx = c.co * dx + c.si * dy, ly = c.co * dy - c.si * dx, lx0 = c.co * ox + c.si * oy, ly0 = c.co * oy - c.si * ox;
    if (ly0 + e <= -c.hh && ly + e >= -c.hh && lx >= -c.hw && lx <= c.hw) { // lands on the (sloped) top edge, keeping a little of its speed along it
      p.c = c; p.ttl = 0; p.u = lx; p.vx = 0.3 * (p.vx * c.co + p.vy * c.si) + side() * (p.fl ? rnd(10, 60) : rnd(70, 180)); p.vy = 0;
      seat(p, c, p.fl ? 5 : 0);
      if (!p.fl && p.b < 0 && Math.random() < 0.3) p.b = Math.random();
      return;
    }
    if (ly > -c.hh && ly < c.hh) { // side hit: bounce back out along the face's angle
      const L = lx0 <= -c.hw && lx > -c.hw ? -1 : lx0 >= c.hw && lx < c.hw ? 1 : 0;
      if (!L) continue;
      const vt = L * (Math.abs(p.vx * c.co + p.vy * c.si) * 0.3 + 20), vn = p.vy * c.co - p.vx * c.si, X = L * c.hw;
      p.vx = c.co * vt - c.si * vn; p.vy = c.si * vt + c.co * vn;
      p.x = c.cx + c.co * X - c.si * ly; p.y = c.cy + c.si * X + c.co * ly;
    }
  }
}
/** World y of a box's top edge at screen x (NaN off its ends). */
function topAt(c: Box, x: number) { const u = (x - c.cx - c.hh * c.si) / c.co; return u < -c.hw || u > c.hw ? NaN : c.cy + u * c.si - c.hh * c.co; }
/** Put a riding particle on its box's top edge at u, sitting just above it (lift for foam on the film). */
function seat(p: P, c: Box, lift: number) { const h = c.hh + p.r * 0.6 + lift; p.x = c.cx + p.u * c.co + h * c.si; p.y = c.cy + p.u * c.si - h * c.co; }

/** Stream width d px below the spout: it speeds up as it falls, so it thins (continuity, w ∝ 1/√v), with a slow ripple. */
function colW(s: St, y: number, now: number) {
  const d = Math.max(0, y - s.y0);
  let w = Math.max(4, W0 * Math.sqrt(V0 / Math.sqrt(V0 * V0 + 2 * G * d))) * (1 + 0.07 * Math.sin(y * 0.11 - now * 0.025) * (d / (d + 250)));
  if (!s.on) w *= Math.sqrt(Math.min(1, (y - s.top) / 26)); // let go: the top end draws out to a point
  return w;
}
const colX = (s: St, y: number, now: number) => { const d = Math.max(0, y - s.y0); return s.x + Math.sin(y * 0.035 - now * 0.012) * 1.2 * (d / (d + 120)); }; // laminar wobble, travelling down
/** One lengthwise band of the column, between a and b across it (-1 left edge, 1 right edge). */
function band(c: CanvasRenderingContext2D, s: St, now: number, a: number, b: number) {
  const len = s.tip - s.top, n = Math.max(2, Math.ceil(len / 8));
  c.beginPath();
  for (let i = 0; i <= n; i++) { const y = s.top + (len * i) / n, h = colW(s, y, now) / 2, x = colX(s, y, now); c.lineTo(x + a * h, y); }
  for (let i = n; i >= 0; i--) { const y = s.top + (len * i) / n, h = colW(s, y, now) / 2, x = colX(s, y, now); c.lineTo(x + b * h, y); }
  if (a < -0.9 && s.tip < s.land) { const w = colW(s, s.tip, now) * 0.62, x = colX(s, s.tip, now); c.moveTo(x + w, s.tip); c.arc(x, s.tip, w, 0, TAU); } // rounded leading drop while it falls
  c.fill();
}
/** The glossy column: body, a shaded far side, a soft highlight and a few fine bubbles carried down. */
function column(c: CanvasRenderingContext2D, s: St, now: number) {
  if (s.tip - s.top < 1) return;
  c.fillStyle = s.pal.s; band(c, s, now, -1, 1);
  c.globalAlpha = 0.55; c.fillStyle = s.pal.sh; band(c, s, now, 0.3, 1);
  c.globalAlpha = 0.6; c.fillStyle = s.pal.hs; band(c, s, now, -0.7, -0.12);
  c.globalAlpha = 0.45; c.fillStyle = '#ffffff'; band(c, s, now, -0.52, -0.36); // specular streak
  if (s.pal.surge) { c.globalAlpha = 0.75; c.fillStyle = '#c23a52'; band(c, s, now, -1, -0.78); band(c, s, now, 0.8, 1); } // a stout is near black: a ruby rim on both edges keeps the stream visible
  const len = s.tip - s.top, k = Math.floor(len / 40);
  c.globalAlpha = s.pal.surge ? 0.75 : 0.5; c.beginPath();
  for (let i = 0; i < k; i++) {
    const y = s.top + ((now * 0.32 + i * 61.8) % len), u = ((i * 0.618) % 1) * 1.1 - 0.55, x = colX(s, y, now) + u * colW(s, y, now) / 2, r = 0.5 + ((i * 0.37) % 1) * 0.45;
    c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU);
  }
  c.fill(); c.globalAlpha = 1;
}
/** Goo layer: the pooled film and foam (fused by the filter), plus a flared foot where each stream meets its pool. */
function drawGoo(c: CanvasRenderingContext2D) {
  c.clearRect(0, 0, innerWidth, innerHeight);
  for (const s of streams) if (s.tip >= s.land && s.land < innerHeight && s.tip - s.top > 4) {
    const y = Math.max(s.top, s.tip - 22), w = colW(s, s.tip, 0);
    c.fillStyle = ink[s.pal.b[1]]; c.beginPath();
    c.moveTo(s.x - w / 2 - 1, y); c.lineTo(s.x + w / 2 + 1, y); c.lineTo(s.x + w / 2 + 7, s.tip); c.lineTo(s.x - w / 2 - 7, s.tip); c.fill();
  }
  for (let pass = 0; pass < 3; pass++) for (let k = 0; k < ink.length; k++) {
    if (role[k] !== pass) continue;
    let any = false; c.beginPath();
    for (const p of parts) {
      if (!p.c || p.h > 0 || (pass === 2 ? p.hi : p.col) !== k) continue;
      const r = pass === 2 ? p.r * 0.45 : p.r, x = pass === 2 ? p.x - p.r * 0.3 : p.x, y = pass === 2 ? p.y - p.r * 0.3 : p.y;
      c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); any = true;
    }
    if (any) { c.fillStyle = ink[k]; c.fill(); }
  }
  for (let k = 0; k < ink.length; k++) { // airborne beer too, so dribbles off an edge stay joined
    if (role[k] === 2) continue;
    let any = false; c.beginPath();
    for (const p of parts) if (!p.c && p.h <= 0 && p.col === k) { c.moveTo(p.x + p.r, p.y); c.arc(p.x, p.y, p.r, 0, TAU); any = true; }
    if (any) { c.fillStyle = ink[k]; c.fill(); }
  }
}
/** Crisp layer: streams, drops in the air (alone the goo filter would erase them), hanging drips, bubbles in the film, foam sparkle. */
function drawTop(c: CanvasRenderingContext2D, now: number) {
  c.clearRect(0, 0, innerWidth, innerHeight);
  for (const s of streams) column(c, s, now);
  c.lineCap = 'round'; c.lineWidth = 3.4;
  for (let k = 0; k < ink.length; k++) {
    if (role[k] === 2) continue;
    let fill = false, line = false; c.beginPath();
    for (const p of parts) if (!p.c && p.h > 0 && p.col === k) { c.moveTo(p.x + p.r, p.y); c.arc(p.x, p.y, p.r, 0, TAU); c.rect(p.x - p.r * 0.45, p.sy - 1, p.r * 0.9, p.y - p.sy); fill = true; } // swelling drip, necked to the spout
    if (fill) { c.fillStyle = ink[k]; c.fill(); }
    c.beginPath();
    for (const p of parts) {
      if (p.c || p.h > 0 || p.col !== k || p.r < 1) continue;
      const v = Math.hypot(p.vx, p.vy), m = Math.min(0.03, 20 / (v + 1)); // droplets stretch along their flight
      c.moveTo(p.x - p.vx * m, p.y - p.vy * m); c.lineTo(p.x, p.y + 0.01); line = true;
    }
    if (line) { c.strokeStyle = ink[k]; c.stroke(); }
  }
  c.globalAlpha = 0.85;
  for (let k = 0; k < ink.length; k++) {
    if (role[k] !== 2) continue;
    let any = false; c.beginPath();
    for (const p of parts) {
      if (p.hi !== k) continue;
      if (p.h > 0) { const r = p.r * 0.28; c.moveTo(p.x - p.r * 0.3 + r, p.y - p.r * 0.2); c.arc(p.x - p.r * 0.3, p.y - p.r * 0.2, r, 0, TAU); any = true; }
      else if (p.c && p.b >= 0) { // a bubble rising through the film and popping at the top (in a stout they sink)
        const u = p.b, r = 0.95 * (1 - u * u * u * u), x = p.x + Math.sin(u * 9 + p.r0 * 7) * 1.4, y = p.y + p.r * 0.5 + (p.pal.surge ? -3 + u * 4 : -u * (p.r * 1.2 + 1));
        c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); any = true;
      }
    }
    if (any) { c.fillStyle = ink[k]; c.fill(); }
  }
  c.globalAlpha = 0.8;
  for (let k = 0; k < ink.length; k++) { // the head: soft lumps of foam over the fused film
    if (role[k] !== 1) continue;
    let any = false; c.beginPath();
    for (const p of parts) if (p.c && p.col === k && p.r > 1.2) { const r = p.r * 0.72; c.moveTo(p.x + r, p.y); c.arc(p.x, p.y, r, 0, TAU); any = true; }
    if (any) { c.fillStyle = ink[k]; c.fill(); }
  }
  c.globalAlpha = 0.35; c.fillStyle = '#fffdf4'; c.beginPath(); // tiny bubbles in the head
  for (let i = 0; i < parts.length; i += 3) { const p = parts[i]; if (p.fl && p.c && p.r > 2) { const x = p.x + (i % 5) - 2, y = p.y - p.r * 0.5, r = 0.6; c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); } }
  c.fill(); c.globalAlpha = 1;
}
/** Move each column: the tip falls to the first box under it (or past the screen bottom); where it lands it sheets out, heads up and splashes. */
function flow(dt: number) {
  for (const s of streams) {
    let target = innerHeight + 20, hit: Box | undefined;
    for (const b of list) if (s.x >= b.l && s.x <= b.r && b.b > s.y0) { const y = topAt(b, s.x); if (y > s.y0 + 4 && y < target) { target = y; hit = b; } }
    s.land = target; s.t += dt;
    s.tip = Math.min(target, s.tip + Math.sqrt(V0 * V0 + 2 * G * Math.max(0, s.tip - s.y0)) * dt);
    if (!s.on) { s.vt += G * dt; s.top += s.vt * dt; if (s.top >= s.tip) { streams.delete(s); continue; } }
    else s.top = s.y0;
    if (!hit || s.tip < target || s.top >= s.tip) continue;
    s.acc += FEED * dt; const n = Math.floor(s.acc); s.acc -= n;
    const pal = s.pal, share = pal.surge ? (s.t < 1.1 ? 0.62 : 0.2) : pal.foam;
    for (let i = 0; i < n && parts.length < MAX; i++) {
      const q = Math.random();
      if (q < 0.1) { splash(s.x, target, pal); continue; }
      const p = mk(pal, s.x, target - 2, 0, 0, rnd(3, 4));
      p.c = hit; p.u = (s.x - hit.cx - hit.hh * hit.si) / hit.co + rnd(-3, 3);
      if (q < 0.1 + share) { p.u += rnd(-3, 3); p.vx = side() * rnd(10, 80); foam(p, pal.surge ? rnd(1.15, 1.45) : rnd(1.1, 1.45)); }
      else if (q > 0.82) { p.r = p.r0 = rnd(4.4, 5.6); p.vx = side() * rnd(5, 35); } // heavier blobs: the pool mounds up where it lands
      else { p.vx = side() * rnd(60, 190); if (Math.random() < 0.35) p.b = Math.random(); }
    }
  }
}
/** The tap shuts: the column lets go of the spout and falls as a whole; a couple of drips follow. */
function stop(tap: Element, st: St) {
  tap.classList.remove('pouring'); st.on = false; st.vt = V0; pours.delete(tap);
  for (let i = 0, k = Math.random() < 0.35 ? 3 : 2, h = 0; i < k && parts.length < MAX; i++) {
    h += rnd(0.35, 0.75);
    const p = mk(st.pal, st.x + rnd(-0.6, 0.6), st.y0, 0, 0, rnd(3.6, 4.4));
    p.col = st.pal.b[1]; p.sy = st.y0 - 1; p.h = h + 0.5; p.r = 0;
  }
}

function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 0.034); last = now;
  const y = scrollY; if (y !== sy) { shift(y - sy); sy = y; moved = true; }
  if (fresh || (moved && now - meas > 500)) measure(now);
  for (const [tap, s] of pours) if (!s.held && now >= s.until) stop(tap, s.st);
  flow(dt);
  let w = 0;
  for (const p of parts) {
    step(p, dt);
    if (p.y - p.r <= innerHeight && p.x > -50 && p.x < innerWidth + 50) parts[w++] = p; else free.push(p);
  }
  parts.length = w;
  if (free.length > MAX) free.length = MAX;
  if (!parts.length && !pours.size && !streams.size) { raf = 0; drop(); return; }
  drawGoo(ctx!); drawTop(tcx!, now);
  raf = requestAnimationFrame(frame);
}

function press(tap: Element, hold: boolean) {
  if (!ok() || pours.has(tap)) return;
  tap.classList.add('pouring');
  const z = tap.querySelector('.tap-nozzle')?.getBoundingClientRect(), x = z ? z.left + z.width / 2 : 0, y0 = z ? z.bottom + SPOUT : 0;
  if (z) floor = Math.max(z.bottom, raf ? floor : 0);
  const st: St = { x, y0, top: y0, tip: y0, land: innerHeight, on: true, acc: 0, vt: 0, t: 0, pal: palette(tap) };
  streams.add(st);
  pours.set(tap, { until: performance.now() + BURST, held: hold, st });
  make();
  if (!raf) { last = performance.now(); fresh = true; sy = scrollY; raf = requestAnimationFrame(frame); }
}

const onDown = (e: PointerEvent, held = true) => {
  const h = (e.target as Element)?.closest?.('[data-pour] .tap-handle');
  const tap = h?.closest('.tap');
  if (!tap || e.button !== 0) return;
  press(tap, held);
  if (!held) return;
  const up = () => { removeEventListener('pointerup', up); removeEventListener('pointercancel', up); const s = pours.get(tap); if (s) s.held = false; }; // a quick click still pours the full burst
  addEventListener('pointerup', up); addEventListener('pointercancel', up);
};
const onKey = (e: KeyboardEvent) => {
  const tap = (e.target as Element)?.closest?.('[data-pour] .tap-handle')?.closest('.tap');
  if (!tap || (e.key !== 'Enter' && e.key !== ' ')) return;
  e.preventDefault();
  if (!e.repeat) press(tap, false);
};
const onKeyUp = (e: KeyboardEvent) => { if (e.key === ' ' && (e.target as Element)?.closest?.('[data-pour] .tap-handle')) e.preventDefault(); };

/** Registers the listeners (pour-loader.ts calls this on the first touch of a tap) and replays the press that triggered the load. */
export function arm(first?: Event, held = true) {
  document.addEventListener('pointerdown', onDown);
  document.addEventListener('keydown', onKey);
  document.addEventListener('keyup', onKeyUp);
  if (first?.type === 'pointerdown') onDown(first as PointerEvent, held);
  else if (first?.type === 'keydown') onKey(first as KeyboardEvent);
}
