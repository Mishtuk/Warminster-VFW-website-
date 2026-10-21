// Live "Bar open now" badge: upgrades every .today-hours[data-live] from the build-time hours to the live status.
// One shared timer refreshes each minute; it stops while the tab is hidden and runs again (with an immediate refresh) when it shows.
import { barStatus } from '../lib/bar-hours.js';

const els = [...document.querySelectorAll<HTMLElement>('.today-hours[data-live]')];

function paint(el: HTMLElement, s: { open: boolean; label: string }) {
  if (el.dataset.label === s.label) return; // unchanged: leave the DOM alone
  el.dataset.label = s.label;
  el.dataset.state = s.open ? 'open' : 'closed';
  el.replaceChildren();
  if (el.dataset.dot) {
    const dot = document.createElement('span');
    dot.className = 'bs-dot';
    dot.setAttribute('aria-hidden', 'true');
    el.append(dot);
  }
  const hint = document.createElement('span');
  hint.className = 'sr-only';
  hint.textContent = 'Bar status: ';
  el.append(hint, s.label);
}

const tick = () => { const s = barStatus(new Date()); for (const el of els) paint(el, s); };

let timer = 0;
const stop = () => { clearInterval(timer); timer = 0; };
const start = () => { if (!timer) { tick(); timer = window.setInterval(tick, 60_000); } };

if (els.length) {
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  if (!document.hidden) start();
}
