// Loads the beer-pour effect (pour.ts) only when someone first touches a tap, then replays that press so it still pours.
// Same desktop gate as pour.ts: wide screen, fine pointer, no reduced motion.
if (matchMedia('(min-width: 900px) and (pointer: fine)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const EVENTS = ['pointerover', 'pointerdown', 'keydown', 'focusin'];
  let loading = false, down = false;
  const up = () => { down = false; };
  const start = (e: Event) => {
    if (loading || !(e.target as Element)?.closest?.('[data-pour] .tap')) return;
    loading = true;
    if (e.type === 'keydown' && ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') && (e.target as Element).closest('.tap-handle')) e.preventDefault();
    for (const t of EVENTS) document.removeEventListener(t, start, true);
    if (e.type === 'pointerdown') { down = true; addEventListener('pointerup', up, { once: true }); addEventListener('pointercancel', up, { once: true }); }
    import('./pour.ts').then((m) => m.arm(e, down)).catch(() => {});
  };
  for (const t of EVENTS) document.addEventListener(t, start, true);
}
