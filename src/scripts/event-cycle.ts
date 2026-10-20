// Home "What's going on": events with a bundle of photos fade slowly from one to the next.
// Markup comes from featuredHtml in src/lib/state.js: [data-cycle] holds stacked imgs and the one showing has .is-on (CSS does the fade).
// One shared timer drives every bundle, a step apart so only one fades at a time. It stops when the section is off screen or the tab is hidden,
// a bundle waits while the pointer or keyboard focus is on its card, and with reduced motion nothing runs (the first photo stays).
const TICK = 1500; // ms between steps of the shared timer
const EVERY = 4; // a bundle changes photo every 4 steps (6 seconds); bundles are staggered by one step

const root = document.querySelector<HTMLElement>('.whats-on');
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const bundles = [...(root?.querySelectorAll<HTMLElement>('[data-cycle]') ?? [])].map((el, n) => ({
  el,
  n,
  imgs: [...el.querySelectorAll<HTMLImageElement>('img')],
  at: 0,
  held: false,
}));

let timer = 0;
let step = 0;
let onScreen = false;

const show = (b: (typeof bundles)[number]) => {
  const next = (b.at + 1) % b.imgs.length;
  const img = b.imgs[next];
  if (!img.complete || !img.naturalWidth) return; // lazy image not here yet: try again next time round
  b.imgs[b.at].classList.remove('is-on');
  img.classList.add('is-on');
  b.at = next;
};
const tick = () => {
  step++;
  for (const b of bundles) if (!b.held && (step + b.n) % EVERY === 0) show(b);
};
const sync = () => {
  const go = onScreen && !document.hidden && !reduce.matches && bundles.length > 0;
  if (go && !timer) timer = window.setInterval(tick, TICK);
  if (!go && timer) { clearInterval(timer); timer = 0; }
};

if (root && bundles.length) {
  for (const b of bundles) {
    const card = b.el.closest<HTMLElement>('.vfw-card, .vfw-feature') ?? b.el;
    card.addEventListener('pointerenter', () => { b.held = true; });
    card.addEventListener('pointerleave', () => { b.held = false; });
    card.addEventListener('focusin', () => { b.held = true; });
    card.addEventListener('focusout', () => { b.held = false; });
  }
  new IntersectionObserver((entries) => { onScreen = entries.some((e) => e.isIntersecting); sync(); }).observe(root);
  document.addEventListener('visibilitychange', sync);
  reduce.addEventListener('change', sync);
}
