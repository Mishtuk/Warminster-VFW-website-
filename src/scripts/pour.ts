// Beer taps: press a tap and beer pours down the screen, splashes on the page's boxes and drains off the bottom.
// Desktop only (wide screen, fine pointer, no reduced motion). One lazy fixed canvas; no layout changes, no blocked clicks.
const DESKTOP = '(min-width: 900px) and (pointer: fine)', CALM = '(prefers-reduced-motion: reduce)';
const FIXED = '.snap, .menu-card, .card, [data-pour-collide]';
const GENERIC = 'main img, main figure, main article, main aside, main section, main li, main div, main a';
const MAX = 900, BURST = 1500, G = 1900, Z = 45, RATE = 300; // RATE = droplets per second per tap; z-index 45: the site header is 50, the theme button 40

type Box = { el: Element; l: number; r: number; t: number; b: number; gone?: boolean };
type P = { x: number; y: number; vx: number; vy: number; r: number; col: number; c?: Box; from?: Box; ttl: number; sp?: boolean }; // c = box being ridden, from = box just left (not landed on again)
const COLORS = ['#e8a317', '#d98a0b', '#f2b632', '#f6efe0']; // amber x3, off-white foam
const pours = new Map<Element, { until: number; held: boolean; acc: number }>();
const parts: P[] = [];
let canvas: HTMLCanvasElement | null = null, ctx: CanvasRenderingContext2D | null = null, raf = 0, last = 0, dirty = true, scan = 0, floor = 0;
let els: Element[] = [], boxes = new Map<Element, Box>(), list: Box[] = [];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

const ok = () => matchMedia(DESKTOP).matches && !matchMedia(CALM).matches;

function size() {
  if (!canvas) return;
  const d = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(innerWidth * d); canvas.height = Math.round(innerHeight * d);
  ctx!.setTransform(d, 0, 0, d, 0, 0);
}
const onScroll = () => { dirty = true; };
const onResize = () => { size(); scan = 0; dirty = true; };

function make() {
  if (canvas) return;
  canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = `position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:${Z}`;
  document.body.append(canvas);
  ctx = canvas.getContext('2d');
  size();
  addEventListener('resize', onResize);
  addEventListener('scroll', onScroll, { passive: true });
}
function drop() {
  removeEventListener('resize', onResize); removeEventListener('scroll', onScroll);
  canvas?.remove(); canvas = ctx = null;
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
  for (let i = 0; i < n && parts.length < MAX; i++) {
    const foam = Math.random() < 0.1;
    parts.push({ x: z.left + z.width / 2 + rnd(-1.5, 1.5), y: z.bottom + rnd(0, 6), vx: rnd(-14, 14), vy: rnd(250, 420), r: rnd(2.5, 4), col: foam ? 3 : (Math.random() * 3) | 0, ttl: 0 });
  }
}
function splash(p: P, t: number) {
  const k = 1 + ((Math.random() * 2) | 0);
  for (let i = 0; i < k && parts.length < MAX; i++) parts.push({ x: p.x, y: t - 1, vx: rnd(-130, 130), vy: -rnd(90, 260), r: rnd(2.5, 3.2), col: p.col, ttl: 0, sp: true });
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

function draw() {
  const c = ctx!;
  c.clearRect(0, 0, innerWidth, innerHeight);
  for (let k = 0; k < COLORS.length; k++) {
    c.fillStyle = COLORS[k]; c.beginPath();
    for (const p of parts) if (p.col === k) { c.moveTo(p.x + p.r, p.y); c.arc(p.x, p.y, p.r, 0, 6.2832); }
    c.fill();
  }
}

function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 0.034); last = now;
  for (const [tap, s] of pours) {
    if (!s.held && now >= s.until) { tap.classList.remove('pouring'); pours.delete(tap); continue; }
    s.acc += RATE * dt; const n = Math.floor(s.acc); s.acc -= n; spawn(tap, n);
  }
  if (now - scan > 250) { scan = now; rescan(); dirty = true; }
  if (dirty) { dirty = false; measure(); }
  let w = 0;
  for (const p of parts) {
    step(p, dt);
    if (p.y - p.r <= innerHeight && p.x > -50 && p.x < innerWidth + 50) parts[w++] = p;
  }
  parts.length = w;
  if (!parts.length && !pours.size) { raf = 0; drop(); return; }
  draw();
  raf = requestAnimationFrame(frame);
}

function press(tap: Element, hold: boolean) {
  if (!ok() || pours.has(tap)) return;
  tap.classList.add('pouring');
  pours.set(tap, { until: performance.now() + BURST, held: hold, acc: 3 });
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
