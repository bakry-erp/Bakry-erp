import test from 'node:test';
import assert from 'node:assert/strict';
import { addCalendarMonths, calculateSubscriptionEnd } from '../domain.js';

test('calendar-month arithmetic clamps at the last day of the destination month', () => {
  assert.equal(addCalendarMonths(new Date('2026-01-31T12:00:00Z'), 1).toISOString(), '2026-02-28T12:00:00.000Z');
  assert.equal(addCalendarMonths(new Date('2024-01-31T12:00:00Z'), 1).toISOString(), '2024-02-29T12:00:00.000Z');
});

test('30-day plan is a fixed duration and calendar-month plan follows calendar dates', () => {
  const start = new Date('2026-11-27T10:00:00Z');
  assert.equal(calculateSubscriptionEnd(start, 'month_1', '30_days').toISOString(), '2026-12-27T10:00:00.000Z');
  assert.equal(calculateSubscriptionEnd(start, 'month_1', 'calendar').toISOString(), '2026-12-27T10:00:00.000Z');
  const jan31 = new Date('2027-01-31T10:00:00Z');
  assert.equal(calculateSubscriptionEnd(jan31, 'month_1', 'calendar').toISOString(), '2027-02-28T10:00:00.000Z');
  assert.equal(calculateSubscriptionEnd(jan31, 'month_1', '30_days').toISOString(), '2027-03-02T10:00:00.000Z');
});

test('multi-month, annual and lifetime durations are handled explicitly', () => {
  const start = new Date('2026-11-27T00:00:00Z');
  assert.equal(calculateSubscriptionEnd(start, 'month_2', 'calendar').toISOString(), '2027-01-27T00:00:00.000Z');
  assert.equal(calculateSubscriptionEnd(start, 'month_4', '30_days').toISOString(), '2027-03-27T00:00:00.000Z');
  assert.equal(calculateSubscriptionEnd(start, 'year_1').toISOString(), '2027-11-27T00:00:00.000Z');
  assert.equal(calculateSubscriptionEnd(start, 'lifetime'), null);
});

test('monthly subscriptions refuse an unspecified month rule', () => {
  assert.throws(() => calculateSubscriptionEnd(new Date(), 'month_1'), /month_mode_required/);
});
