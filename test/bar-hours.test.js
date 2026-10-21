// Live bar status: Eastern time, midnight closes belong to the night before, DST-safe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { barStatus, parseWeek } from '../src/lib/bar-hours.js';

// Eastern wall time -> instant. Winter (EST) is UTC-5, summer (EDT) is UTC-4.
const est = (y, mo, d, h, mi = 0) => new Date(Date.UTC(y, mo - 1, d, h + 5, mi));
const edt = (y, mo, d, h, mi = 0) => new Date(Date.UTC(y, mo - 1, d, h + 4, mi));
const at = (date) => barStatus(date).label;

test('parseWeek reads POST.hours, closes after midnight run past 1440', () => {
  const w = parseWeek();
  assert.deepEqual(w[1], { from: 17 * 60, to: 22 * 60 });
  assert.deepEqual(w[5], { from: 16 * 60, to: 1440 });
  assert.deepEqual(w[0], { from: 13 * 60, to: 19 * 60 });
});

// 2026-01-12 Mon, 01-16 Fri, 01-17 Sat, 01-18 Sun (EST); 2026-07-13 Mon, 07-17 Fri, 07-18 Sat (EDT)
test('before opening, open, after closing (Monday)', () => {
  assert.deepEqual(barStatus(est(2026, 1, 12, 16, 59)), { open: false, label: 'Opens at 5 PM today' });
  assert.deepEqual(barStatus(est(2026, 1, 12, 17)), { open: true, label: 'Open now, until 10 PM' });
  assert.equal(at(est(2026, 1, 12, 21, 59)), 'Open now, until 10 PM');
  assert.equal(at(est(2026, 1, 12, 22)), 'Closed now, opens tomorrow 5 PM');
});

test('Monday after 10 PM points at Tuesday; Thursday night points at Friday 4 PM', () => {
  assert.equal(at(est(2026, 1, 12, 23, 30)), 'Closed now, opens tomorrow 5 PM');
  assert.equal(at(est(2026, 1, 15, 22, 30)), 'Closed now, opens tomorrow 4 PM');
});

test('midnight close belongs to the night before (Fri into Sat)', () => {
  assert.equal(at(est(2026, 1, 16, 15, 59)), 'Opens at 4 PM today');
  assert.equal(at(est(2026, 1, 16, 23, 30)), 'Open now, until midnight');
  assert.deepEqual(barStatus(est(2026, 1, 17, 0, 10)), { open: false, label: 'Opens at 6 PM today' });
  assert.equal(at(est(2026, 1, 17, 23, 59)), 'Open now, until midnight');
  assert.equal(at(est(2026, 1, 18, 0, 5)), 'Opens at 1 PM today'); // Saturday night into Sunday
});

test('Sunday afternoon and evening', () => {
  assert.equal(at(est(2026, 1, 18, 13)), 'Open now, until 7 PM');
  assert.equal(at(est(2026, 1, 18, 18, 59)), 'Open now, until 7 PM');
  assert.equal(at(est(2026, 1, 18, 19)), 'Closed now, opens tomorrow 5 PM');
});

test('DST: same Eastern times give the same answers in summer (EDT)', () => {
  assert.equal(at(edt(2026, 7, 13, 16, 59)), 'Opens at 5 PM today');
  assert.equal(at(edt(2026, 7, 13, 17)), 'Open now, until 10 PM');
  assert.equal(at(edt(2026, 7, 17, 23, 30)), 'Open now, until midnight');
  assert.equal(at(edt(2026, 7, 18, 0, 10)), 'Opens at 6 PM today');
});

test('DST changes: spring forward (Sun 2026-03-08) and fall back (Sun 2026-11-01)', () => {
  assert.equal(at(edt(2026, 3, 8, 13)), 'Open now, until 7 PM');
  assert.equal(at(edt(2026, 3, 8, 12, 59)), 'Opens at 1 PM today');
  assert.equal(at(est(2026, 11, 1, 13)), 'Open now, until 7 PM');
  assert.equal(at(est(2026, 3, 8, 0, 30)), 'Opens at 1 PM today'); // Sat night into the 23-hour Sunday
  assert.equal(at(edt(2026, 11, 1, 0, 30)), 'Opens at 1 PM today'); // into the 25-hour Sunday
  assert.equal(at(est(2026, 11, 1, 12, 59)), 'Opens at 1 PM today');
});

test('the visitor timezone does not matter: a UTC instant that is already Saturday UTC is still Friday night in Eastern', () => {
  assert.equal(at(new Date('2026-01-17T04:30:00Z')), 'Open now, until midnight'); // Fri 11:30 PM EST
});
