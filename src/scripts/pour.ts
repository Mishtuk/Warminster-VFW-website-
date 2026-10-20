// Beer taps: press a tap and beer pours down the screen, splashes on the page's boxes and drains off the bottom.
// Desktop only (wide screen, fine pointer, no reduced motion). One lazy fixed canvas; no layout changes, no blocked clicks.
const DESKTOP = '(min-width: 900px) and (pointer: fine)', CALM = '(prefers-reduced-motion: reduce)';
const FIXED = '.snap, .menu-card, .card, [data-pour-collide]';
const GENERIC = 'main img, main figure, main article, main aside, main section, main li, main div, main a';
const MAX = 900, BURST = 1500, G = 1900, Z = 45, RATE = 170, FID = 'vfw-goo'; // RATE = particles per second per tap (they feed the stream column); z-index 45: the site header is 50, the theme button 40

type Box = { el: Element; l: number; r: number; t: number; b: number; gone?: boolean };
type P = { x: number; y: number; vx: number; vy: number; r: number; col: number; c?: Box; from?: Box; ttl: number; sp?: boolean }; // c = box being ridden, from = box just left (not landed on again)
const COLORS = ['#dc8f0c', '#d4850a', '#e29a14', '#f7f0de']; // amber x3, cream foam; the filter merges neighbours into one body
type St = { x: number; y0: number; top: number; tip: number; on: boolean; acc: number }; // one liquid column per pour: spout (y0) down to where it lands (tip)
const pours = new Map<Element, { until: number; held: boolean; acc: number; st: St }>();
const streams = new Set<St>();
const parts: P[] = [];
let defs: SVGSVGElement | null = null, canvas: HTMLCanvasElement | null = null, ctx: CanvasRenderingContext2D | null = null, raf = 0, last = 0, dirty = true, scan = 0, floor = 0;
let els: Element[] = [], boxes = new Map<Element, Box>(), list: Box[] = [];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

const ok = () => matchMedia(DESKTOP).matches && !matchMedia(CALM).matches;

function size() {
  if (!canvas) return;
  const d = 1; // ponytail: 1x keeps the blur pass cheap; merged edges stay smooth anyway
  canvas.width = Math.round(innerWidth * d); canvas.height = Math.round(innerHeight * d);
  ctx!.setTransform(d, 0, 0, d, 0, 0);
}
const onScroll = () => { dirty = true; };
const onResize = () => { size(); scan = 0; dirty = true; };

function make() {
  if (canvas) return;
  canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const N = 'http://www.w3.org/2000/svg', el = (t: string, a: Record<string, string>, k?: Element) => { const e = document.createElementNS(N, t); for (const n in a) e.setAttribute(n, a[n]); k?.append(e); return e; };
  defs = el('svg', { width: '0', height: '0', 'aria-hidden': 'true', style: 'position:absolute' }) as SVGSVGElement;
  const f = el('filter', { id: FID, x: '0', y: '0', width: '100%', height: '100%', 'color-interpolation-filters': 'sRGB' }, defs); // blur, then an alpha threshold: touching blobs fuse into liquid with crisp edges
  el('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: '4.5' }, f);
  el('feColorMatrix', { values: '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10' }, f);
  canvas.style.cssText = `position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:${Z};filter:url(#${FID})`;
  document.body.append(defs, canvas);
  ctx = canvas.getContext('2d');
  size();
  addEventListener('resize', onResize);
  addEventListener('scroll', onScroll, { passive: true });
}
function drop() {
  removeEventListener('resize', onResize); removeEventListener('scroll', onScroll);
  canvas?.remove(); defs?.remove(); canvas = ctx = defs = null;
}

/** Which elements can catch beer: the fixed list, plus visible boxes (background, border, shadow or picture) below the taps. Re-run about every 250 ms. */
function rescan() {
  const seen = new Set<Element>(document.querySelectorAll(FIXED));
  const taps = document.querySelector('[data-pour]');
  for (const e of document.querySelectorAll(GENERIC)) {
    if (seen.has(e) || e.contains(taps) || taps?.contains(e) || e.closest('header')) continue;
    const q = e.getBoundingClientRect();
    if (q.width < 60 || q.height < 30 || q.width > innerWidth * 0.9 || q.bottom < 0 || q.top > innerHeight || q.top < floor) continue;
    const s = getComputedStyle(e);
    if (s.visibility === 'hidden' || s.display === 'none') continue;
    if (e.tagName === 'IMG' || e.tagName === 'FIGURE' || parseFloat(s.borderTopWidth) > 0 || s.boxShadow !== 'none' || !/^rgba\(.*, 0\)$|^transparent$/.test(s.backgroundColor)) seen.add(e);
  }
  els = [...seen];
}
function measure() {
  const next = new Map<Element, Box>();
  for (const e of els) {
    const q = e.getBoundingClientRect();
    if (q.width < 20 || q.height < 10 || q.bottom < 0 || q.top > innerHeight || q.top < floor) continue;
    const b = boxes.get(e) ?? { el: e, l: 0, r: 0, t: 0, b: 0 };
    b.l = q.left; b.r = q.right; b.t = q.top; b.b = q.bottom;
    next.set(e, b);
  }
  for (const [e, b] of boxes) if (!next.has(e)) b.gone = true;
  boxes = next; list = [...next.values()];
}

function spawn(tap: Element, n: number) {
  const z = tap.querySelector('.tap-nozzle')?.getBoundingClientRect();
  if (!z) return;
  floor = Math.max(z.bottom, floor);
  const st = pours.get(tap)?.st; if (st) { st.x = z.left + z.width / 2; st.y0 = z.bottom; }
  for (let i = 0; i < n && parts.length < MAX; i++) {
    parts.push({ x: z.left + z.width / 2 + rnd(-4, 4), y: z.bottom + rnd(0, 20), vx: rnd(-20, 20), vy: rnd(330, 520), r: rnd(2.6, 3.8), col: (Math.random() * 3) | 0, ttl: 0 });
  }
}
function splash(p: P, t: number) {
  const k = 2 + ((Math.random() * 2) | 0);
  for (let i = 0; i < k && parts.length < MAX; i++) parts.push({ x: p.x, y: t - 3, vx: rnd(-150, 150), vy: -rnd(120, 300), r: rnd(2.6, 3.6), col: Math.random() < 0.4 ? 3 : p.col, ttl: 0, sp: true }); // falls back and rejoins as a riding film
}

function step(p: P, dt: number) {
  if (p.c) { // riding a box's top edge: slide, rub, roll off the ends
    const c = p.c;
    if (p.ttl > 6) { p.y = 1e9; return; } // safety net only: beer normally runs off the nearest edge first
    if (c.gone || p.x < c.l || p.x > c.r) { p.c = undefined; p.from = c; p.vy = 0; return; }
    p.ttl += dt;
    p.vx *= 1 - 1.2 * dt;
    const out = p.x < (c.l + c.r) / 2 ? -1 : 1; // run toward the nearest edge and roll off it
    if (p.vx * out < 160) p.vx += out * 420 * dt;
    p.x += p.vx * dt; p.y = c.t - p.r * 0.6;
    return;
  }
  const px = p.x, py = p.y;
  p.vy += G * dt; p.x += p.vx * dt; p.y += p.vy * dt;
  for (const c of list) {
    if (c !== p.from && p.vy > 0 && py + p.r * 0.6 <= c.t && p.y + p.r * 0.6 >= c.t && p.x >= c.l && p.x <= c.r) { // lands on the top edge
      if (!p.sp && Math.random() < 0.5) splash(p, c.t);
      p.c = c; p.ttl = 0; p.y = c.t - p.r * 0.6; p.vx = (Math.random() < 0.5 ? -1 : 1) * rnd(70, 180); p.vy = 0; return;
    }
    if (p.y > c.t && p.y < c.b) { // side hit: bounce back out
      if (px <= c.l && p.x > c.l) { p.x = c.l; p.vx = -Math.abs(p.vx) * 0.3 - 20; }
      else if (px >= c.r && p.x < c.r) { p.x = c.r; p.vx = Math.abs(p.vx) * 0.3 + 20; }
    }
  }
}

const LIGHT = '#ffd25a';
/** The liquid column from the spout down to where it lands: a smooth tapered ribbon with a slight wobble, plus a thin highlight band. */
function column(c: CanvasRenderingContext2D, s: St, now: number) {
  const n = Math.max(2, Math.ceil((s.tip - s.top) / 12));
  for (const hi of [false, true]) {
    const L: number[] = [], R: number[] = [];
    for (let i = 0; i <= n; i++) {
      const y = s.top + ((s.tip - s.top) * i) / n, d = y - s.y0, w = 9 * (1 - 0.3 * Math.min(1, Math.max(0, d) / 500)) * Math.min(1, 0.35 + (y - s.top) / 24) * (hi ? 0.28 : 1);
      const x = s.x + Math.sin(y * 0.04 + now * 0.011) * 1.4 * (d / (d + 90)) + (hi ? -w * 1.5 : 0);
      L.push(x - w / 2, y); R.push(x + w / 2, y);
    }
    c.fillStyle = hi ? LIGHT : COLORS[0]; c.beginPath(); c.moveTo(L[0], L[1]);
    for (let i = 2; i < L.length; i += 2) c.lineTo(L[i], L[i + 1]);
    for (let i = R.length - 2; i >= 0; i -= 2) c.lineTo(R[i], R[i + 1]);
    c.fill();
  }
}
function draw(now: number) {
  const c = ctx!;
  c.clearRect(0, 0, innerWidth, innerHeight);
  for (const s of streams) column(c, s, now);
  for (let k = 0; k < COLORS.length; k++) {
    c.fillStyle = COLORS[k]; c.beginPath();
    for (const p of parts) if (p.col === k) { c.moveTo(p.x + p.r, p.y); c.arc(p.x, p.y, p.r, 0, 6.2832); }
    c.fill();
  }
  c.fillStyle = LIGHT; c.beginPath(); // highlight: a small lighter blob up and left inside each amber one
  for (const p of parts) if (p.col < 3) { const r = p.r * 0.45; c.moveTo(p.x - p.r * 0.3 + r, p.y - p.r * 0.3); c.arc(p.x - p.r * 0.3, p.y - p.r * 0.3, r, 0, 6.2832); }
  c.fill();
}
/** Move each column: the tip falls to the first box under it (or the screen bottom); where it lands it sheets out along the top and splashes. */
function flow(dt: number) {
  for (const s of streams) {
    let target = innerHeight + 20, hit: Box | undefined;
    for (const b of list) if (b.t > s.y0 + 4 && b.t < target && s.x >= b.l && s.x <= b.r) { target = b.t; hit = b; }
    s.tip = Math.min(target, s.tip + 1100 * dt);
    if (!s.on) { s.top += (180 + (s.top - s.y0) * 6) * dt; if (s.top >= s.tip) { streams.delete(s); continue; } }
    if (hit && s.tip >= target && s.top < s.tip) {
      s.acc += 110 * dt; const n = Math.floor(s.acc); s.acc -= n;
      for (let i = 0; i < n && parts.length < MAX; i++) {
        if (Math.random() < 0.25) splash({ x: s.x, col: 3 } as P, hit.t);
        else parts.push({ x: s.x + rnd(-3, 3), y: hit.t - 2, vx: (Math.random() < 0.5 ? -1 : 1) * rnd(70, 190), vy: 0, r: rnd(3, 4), col: (Math.random() * 3) | 0, c: hit, ttl: 0 });
      }
    }
  }
}

function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 0.034); last = now;
  for (const [tap, s] of pours) {
    if (!s.held && now >= s.until) { tap.classList.remove('pouring'); s.st.on = false; pours.delete(tap); continue; }
    s.acc += RATE * dt; const n = Math.floor(s.acc); s.acc -= n; spawn(tap, n);
  }
  if (now - scan > 250) { scan = now; rescan(); dirty = true; }
  if (dirty) { dirty = false; measure(); }
  flow(dt);
  let w = 0;
  for (const p of parts) {
    step(p, dt);
    if (p.y - p.r <= innerHeight && p.x > -50 && p.x < innerWidth + 50) parts[w++] = p;
  }
  parts.length = w;
  if (!parts.length && !pours.size && !streams.size) { raf = 0; drop(); return; }
  draw(now);
  raf = requestAnimationFrame(frame);
}

function press(tap: Element, hold: boolean) {
  if (!ok() || pours.has(tap)) return;
  tap.classList.add('pouring');
  const z = tap.querySelector('.tap-nozzle')?.getBoundingClientRect();
  const st: St = { x: z ? z.left + z.width / 2 : 0, y0: z ? z.bottom : 0, top: z ? z.bottom : 0, tip: z ? z.bottom : 0, on: true, acc: 0 };
  streams.add(st);
  pours.set(tap, { until: performance.now() + BURST, held: hold, acc: 3, st });
  make();
  if (!raf) { last = performance.now(); scan = 0; raf = requestAnimationFrame(frame); }
}

document.addEventListener('pointerdown', (e) => {
  const h = (e.target as Element)?.closest?.('[data-pour] .tap-handle');
  const tap = h?.closest('.tap');
  if (!tap || e.button !== 0) return;
  press(tap, true);
  const up = () => { removeEventListener('pointerup', up); removeEventListener('pointercancel', up); const s = pours.get(tap); if (s) s.held = false; }; // a quick click still pours the full burst
  addEventListener('pointerup', up); addEventListener('pointercancel', up);
});
document.addEventListener('keydown', (e) => {
  const tap = (e.target as Element)?.closest?.('[data-pour] .tap-handle')?.closest('.tap');
  if (!tap || (e.key !== 'Enter' && e.key !== ' ')) return;
  e.preventDefault();
  if (!e.repeat) press(tap, false);
});
document.addEventListener('keyup', (e) => { if (e.key === ' ' && (e.target as Element)?.closest?.('[data-pour] .tap-handle')) e.preventDefault(); });
