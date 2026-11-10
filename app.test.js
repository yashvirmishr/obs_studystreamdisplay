/* Unit tests for the shared time module (app.js).
   Run: node --test app.test.js */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const assert = require('node:assert');

vm.runInThisContext(fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8'), { filename: 'app.js' });
const T = globalThis.StudyTime;
assert.ok(T, 'app.js must expose StudyTime');

const MIN = 60000;

test('pad + duration formatting', () => {
  assert.equal(T.pad(7), '07');
  assert.equal(T.duration(0), '00:00:00');
  assert.equal(T.duration(3661000), '01:01:01');
  assert.equal(T.duration(45296000), '12:34:56');   // 12h 34m 56s
  assert.equal(T.duration(59999), '00:00:59');       // floors, never rounds
});

test('sessionElapsedMs: idle, running, clamps', () => {
  const now = 1_000_000_000;
  assert.equal(T.sessionElapsedMs({ accumulatedMs: 3600000, running: false }, now), 3600000);
  assert.equal(T.sessionElapsedMs({ accumulatedMs: 1000, running: true, startedAt: now - 5000 }, now), 6000);
  assert.equal(T.sessionElapsedMs({ accumulatedMs: 0, running: true, startedAt: undefined }, now), 0);
  // a startedAt in the future must add nothing, not go negative
  assert.equal(T.sessionElapsedMs({ accumulatedMs: 4000, running: true, startedAt: now + 10000 }, now), 4000);
  assert.equal(T.sessionElapsedMs({}, now), 0);
});

test('pomodoroRemainingMs: running, paused, fallbacks', () => {
  const now = 5_000_000;
  // running: countdown to endsAt, clamped at zero
  assert.equal(T.pomodoroRemainingMs({ running: true, endsAt: now + 45000 }, now), 45000);
  assert.equal(T.pomodoroRemainingMs({ running: true, endsAt: now - 1000 }, now), 0);
  // paused: remainingMs wins while > 0
  assert.equal(T.pomodoroRemainingMs({ running: false, phase: 'focus', remainingMs: 120000 }, now), 120000);
  // paused with remainingMs 0 -> phase length in minutes
  assert.equal(T.pomodoroRemainingMs({ running: false, phase: 'focus', remainingMs: 0, focusMin: 15 }, now), 15 * MIN);
  assert.equal(T.pomodoroRemainingMs({ running: false, phase: 'break', remainingMs: 0, breakMin: 10 }, now), 10 * MIN);
  // no phase at all -> focus defaults; missing mins fall back to 25/5
  assert.equal(T.pomodoroRemainingMs({}, now), 25 * MIN);
  assert.equal(T.pomodoroRemainingMs({ phase: 'break' }, now), 5 * MIN);
  assert.equal(T.pomodoroRemainingMs({ phase: 'break', breakMin: 0 }, now), 5 * MIN);
});

test('pomodoroPhaseLenMs: configured length, then minutes, then 25/5', () => {
  assert.equal(T.pomodoroPhaseLenMs({ phaseLenMs: 450000 }), 450000);
  assert.equal(T.pomodoroPhaseLenMs({ phase: 'break', breakMin: 3 }), 3 * MIN);
  assert.equal(T.pomodoroPhaseLenMs({}), 25 * MIN);
  assert.equal(T.pomodoroPhaseLenMs({ phase: 'break' }), 5 * MIN);
});

test('durWords: spoken duration', () => {
  assert.equal(T.durWords(0), '0m');
  assert.equal(T.durWords(-5), '0m');            // never negative
  assert.equal(T.durWords(59 * MIN), '59m');
  assert.equal(T.durWords(99 * MIN + 30000), '1h 39m');
  assert.equal(T.durWords(5 * 3600000 + 6 * MIN), '5h 06m');  // minutes zero-padded under an hour count
});

test('timeZoneLabel: short label or empty', () => {
  const label = T.timeZoneLabel('Asia/Kolkata');
  assert.ok(label.length > 0, 'valid zone gives a short label');
  assert.equal(label, label.toUpperCase());
  assert.equal(T.timeZoneLabel('Not/AZone'), '');
});

test('todayStudiedMs: timezone day boundary + running session', () => {
  // noon UTC 10 Nov 2026 = 17:30 in Asia/Kolkata (+5:30) -- well after midnight there
  const now = Date.UTC(2026, 10, 10, 12, 0, 0);
  const state = {
    timezone: 'Asia/Kolkata',
    running: false,
    sessionLog: [
      { endedAt: new Date(now - 3600000).toISOString(), durationMs: 5000 },   // 16:30 IST Nov 10 -> counts
      { endedAt: new Date(now - 13 * 3600000).toISOString(), durationMs: 7000 }, // 04:30 IST Nov 10 (was 23:00 UTC Nov 9!) -> counts
      { endedAt: new Date(now - 26 * 3600000).toISOString(), durationMs: 8000 }, // 15:30 IST Nov 9 -> out
      { endedAt: new Date(now - 30 * 3600000).toISOString(), durationMs: 9000 }, // 11:30 IST Nov 9 -> out
      { endedAt: 'garbage', durationMs: 12000 },                                // invalid -> skipped
      { endedAt: new Date(now - 3600000).toISOString() },                       // no durationMs -> +0
    ],
  };
  assert.equal(T.todayStudiedMs(state, now), 12000);

  // same state, but running session contributes live tail too
  const live = { ...state, running: true, startedAt: now - 2000, accumulatedMs: 0 };
  assert.equal(T.todayStudiedMs(live, now), 12000 + 2000);
});

test("todayStudiedMs: 'auto' follows the viewer's local day", () => {
  const now = Date.UTC(2026, 10, 10, 12, 0, 0);
  // an entry ENDED exactly at `now` shares the local day with `now` in every zone
  const state = {
    timezone: 'auto',
    running: false,
    sessionLog: [{ endedAt: new Date(now).toISOString(), durationMs: 7000 }],
  };
  assert.equal(T.todayStudiedMs(state, now), 7000);
});

test("todayStudiedMs: entries before midnight elsewhere don't leak into today", () => {
  // The bug this module fixed: the layout editor summed the WHOLE log.
  // Across several past days, only "today in the stated zone" may count.
  const now = Date.UTC(2026, 10, 10, 12, 0, 0);
  const weekAgo = new Date(now - 7 * 24 * 3600000).toISOString();
  const yesterday = new Date(now - 26 * 3600000).toISOString();
  const state = {
    timezone: 'Asia/Kolkata',
    running: false,
    sessionLog: [
      { endedAt: weekAgo, durationMs: 999000 },
      { endedAt: yesterday, durationMs: 888000 },
    ],
  };
  assert.equal(T.todayStudiedMs(state, now), 0);
});
