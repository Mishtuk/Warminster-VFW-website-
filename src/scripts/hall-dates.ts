// Open dates on /hall: choosing an open date fills the inquiry form's date field. The link itself jumps to #inquiry.
document.addEventListener('click', (e) => {
  const a = (e.target as Element).closest<HTMLAnchorElement>('a[data-date]');
  const f = document.getElementById('f-date') as HTMLInputElement | null;
  if (a && f) f.value = a.dataset.date ?? '';
});
