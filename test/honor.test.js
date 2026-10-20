import { test } from 'node:test';
import assert from 'node:assert/strict';
import { honorList } from '../src/lib/honor.js';

const good = { id: 'a', name: 'Jane Doe', branch: 'Army', era: 'Vietnam War', served: '1968 to 1970', photo: 'hero-memorial-vets.webp', note: '', consent: true };

test('honor: only consent === true renders', () => {
  assert.equal(honorList([{ ...good, consent: false }]).length, 0);
  assert.equal(honorList([{ ...good, consent: 'true' }]).length, 0);
  assert.equal(honorList([{ ...good, consent: 1 }]).length, 0);
  const { consent, ...none } = good;
  assert.equal(honorList([none]).length, 0);
  assert.equal(honorList([good]).length, 1);
});

test('honor: unknown branch dropped, bad photo dropped, good entry kept', () => {
  assert.equal(honorList([{ ...good, branch: 'Foreign Legion' }]).length, 0);
  assert.equal(honorList([{ ...good, photo: '../secret.webp' }])[0].photo, '');
  assert.equal(honorList([{ ...good, photo: 'a/b.webp' }])[0].photo, '');
  assert.equal(honorList([good])[0].photo, 'hero-memorial-vets.webp');
  assert.equal(honorList([good])[0].name, 'Jane Doe');
});

test('honor: sorted by name, junk input is safe', () => {
  const names = honorList([{ ...good, name: 'Zed' }, null, 'x', { ...good, name: 'Abe' }]).map((e) => e.name);
  assert.deepEqual(names, ['Abe', 'Zed']);
  assert.deepEqual(honorList(undefined), []);
});
