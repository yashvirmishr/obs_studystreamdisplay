/*
  Study Stream Display - shared time module

  The one home for the clock/session math that used to be hand-copied
  into overlay.html, control.html and layout.html (three copies of the
  stopwatch, three of the pomodoro-remaining formula, two of
  today-studied — the layout editor's copies had drifted).

  Contract:
  - Pure functions: state goes IN, numbers/strings come out; `now`
    is always an explicit argument so every result is reproducible and
    unit-testable (app.test.js). Pages pass Date.now().
  - Formulas are pasted VERBATIM from the pages that already agreed on
    them. Fixing a formula works on all pages at once.
  - Golden rule: the overlay's numbers are what the layout editor
    shows. If these two disagree, this module is wrong, not the page.

  Consumers: <script src="/app.js"></script> before a page's inline
  script; the pages keep one-line adapters so their call sites don't
  change. Node tests load this file via vm.runInThisContext.
*/
(function (global) {
'use strict';

/* formatter cache keyed by the requested zone: 'en-CA' YYYY-MM-DD,
   the same format every page used for the "studied today" day key */
const dayFmts = Object.create(null);
function dayFormatter(tz) {
  const key = tz || '(local)';
  if (key in dayFmts) return dayFmts[key];
  let f;
  try {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz || undefined,
      year: 'numeric', month: '2-digit', day: '2-digit'
    });
  } catch {
    f = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric', month: '2-digit', day: '2-digit'
    });
  }
  return (dayFmts[key] = f);
}

/* '' for missing/invalid timestamps - such entries can never match a day key */
function dayKeyInTz(f, ms) {
  try {
    const d = new Date(ms);
    if (isNaN(d.getTime())) return '';
    return f.format(d);
  } catch { return ''; }
}

const StudyTime = {
  /* stopwatch helpers - byte-identical twins of overlay+control */
  pad(n) { return String(n).padStart(2, '0'); },

  duration(ms) {
    let s = Math.floor(ms / 1000);
    return `${this.pad(Math.floor(s / 3600))}:${this.pad(Math.floor(s % 3600 / 60))}:${this.pad(s % 60)}`;
  },

  /* accumulated timer + the live tail of a running session */
  sessionElapsedMs(state, now) {
    return Math.max(0, Number(state && state.accumulatedMs) || 0) +
      (state && state.running && state.startedAt ? Math.max(0, now - state.startedAt) : 0);
  },

  /* configured length of the CURRENT pomodoro phase (fill-bar total);
     falls back to focusMin/breakMin minutes, then 25/5 */
  pomodoroPhaseLenMs(pom) {
    pom = pom || {};
    const phase = (pom.phase || 'focus') === 'break' ? 'break' : 'focus';
    return Number(pom.phaseLenMs) ||
      ((phase === 'break' ? (pom.breakMin || 5) : (pom.focusMin || 25))) * 60000;
  },

  /* ms left in the current pomodoro round:
     running -> clamped countdown to endsAt
     stopped -> remainingMs, then the phase length in minutes */
  pomodoroRemainingMs(pom, now) {
    pom = pom || {};
    if (pom.running && pom.endsAt) return Math.max(0, pom.endsAt - now);
    const phase = (pom.phase || 'focus') === 'break' ? 'break' : 'focus';
    const mins = phase === 'break' ? (pom.breakMin || 5) : (pom.focusMin || 25);
    return Math.max(0, Number(pom.remainingMs) || mins * 60000);
  },

  /* spoken duration: "59m", "5h 06m" */
  durWords(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
    return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
  },

  /* short zone label (e.g. "GMT+5:30") - what the stream clock shows */
  timeZoneLabel(tz) {
    try {
      const t = new Intl.DateTimeFormat(undefined, { timeZone: tz, timeZoneName: 'short' })
        .formatToParts().find(p => p.type === 'timeZoneName');
      return t ? t.value.toUpperCase() : '';
    } catch { return ''; }
  },

  /* ms studied on the STATED timezone's calendar day, counting the
     running session too. 'auto' resolves to the viewer's local day.
     THE definition every page must show - editor included. */
  todayStudiedMs(state, now) {
    state = state || {};
    const tz = (state.timezone && state.timezone !== 'auto') ? state.timezone : undefined;
    const f = dayFormatter(tz);
    const key = dayKeyInTz(f, now);
    let total = 0;
    const log = Array.isArray(state.sessionLog) ? state.sessionLog : [];
    log.forEach(e => {
      if (dayKeyInTz(f, e && e.endedAt) === key) total += Number(e.durationMs) || 0;
    });
    if (state.running) total += this.sessionElapsedMs(state, now);
    return total;
  }
};

global.StudyTime = StudyTime;
})(typeof window !== 'undefined' ? window : globalThis);
