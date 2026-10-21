// Hides the phone "Ask about a date" bar while the inquiry form is on screen.
const bar = document.querySelector<HTMLElement>('.hall-sticky');
const target = document.getElementById('inquiry');
if (bar && target && 'IntersectionObserver' in window) {
  new IntersectionObserver(([e]) => bar.classList.toggle('is-away', e.isIntersecting)).observe(target);
}
