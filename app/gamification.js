// app/gamification.js — XP, Level, Badges, Wochenziel, Zeremonien (Plan #28–#31, §6.3).
// CORE RULE: activity points (participation, including mistakes — a penalty-free space)
// and mastery evidence (only real, delayed, successful performance) are STRICTLY separate
// quantities and are never mixed. Points drive levels and badges; mastery drives the radar, retention and the gate.
// Logik DOM-frei; Zeremonien-Rendering getrennt.

// ---------- points and levels (activity) ----------

export const XP_RULES = Object.freeze({
  check_answered: { A: 10, B: 14, C: 20 },     // C > B > A (#28) — unabhängig von richtig/falsch
  unit_completed: 40,
  review_session: 25,
  drill_completed: 20,
  boss_completed: 60,
  test_passed: 120,
  exam_passed: 400
});

/** Level ladder with dryly humorous titles; the final title comes from the profile. */
export const LEVELS_LADDER = [
  { level: 1, xp: 0, title: 'Anhang-Ahnungslos' },
  { level: 2, xp: 250, title: 'Erwägungsgrund-Leser' },
  { level: 3, xp: 700, title: 'Risikoklassen-Kenner' },
  { level: 4, xp: 1400, title: 'Anhang-III-Flüsterer' },
  { level: 5, xp: 2400, title: 'Fristen-Jongleur' },
  { level: 6, xp: 3800, title: 'Konformitäts-Kartograph' },
  { level: 7, xp: 5600, title: 'Art.-25-Weichensteller' },
  { level: 8, xp: 8000, title: 'FRIA-Dirigent' },
  { level: 9, xp: 11000, title: 'Omnibus-Exeget' },
  { level: 10, xp: 15000, title: null }                    // Endtitel profilabhängig (level_endtitel im Profil)
];

export function levelFor(xp, profileEndTitle = 'AI-Act-Souverän') {
  let cur = LEVELS_LADDER[0];
  for (const l of LEVELS_LADDER) if (xp >= l.xp) cur = l;
  const next = LEVELS_LADDER.find(l => l.xp > xp) ?? null;
  return {
    level: cur.level,
    title: cur.title ?? profileEndTitle,
    nextAt: next?.xp ?? null,
    progress: next ? (xp - cur.xp) / (next.xp - cur.xp) : 1
  };
}

/**
 * Record an event — ALWAYS returns both streams separately.
 * event: {kind, level?, correct?, confidence?, delayedDays?, competency?}
 * Points flow on participation; mastery evidence ONLY when correct and the kind is summative or delayed.
 */
export function applyEvent(state, event) {
  const xpGain = event.kind === 'check_answered'
    ? XP_RULES.check_answered[event.level ?? 'A']
    : (XP_RULES[event.kind] ?? 0);
  state.xp += xpGain;

  let masteryGain = null;
  if (event.correct === true) {
    // Mastery counts real successes only; delayed performance (a day or more apart) weighs more
    const delayed = (event.delayedDays ?? 0) >= 1;
    masteryGain = {
      competency: event.competency ?? null,
      level: event.level ?? 'A',
      weight: delayed ? 1 : 0.5,
      delayed
    };
    state.mastery_events = state.mastery_events ?? [];
    state.mastery_events.push({ ...masteryGain, ts: event.ts ?? null });
  }
  return { xpGain, masteryGain, newTotal: state.xp };
}

// ---------- Wochenziel (#29) ----------

/** A day counts once the mandatory review is done AND either 10 questions or one unit. */
export function dayCounts(dayStats) {
  return dayStats.reviewDone === true && ((dayStats.questions ?? 0) >= 10 || (dayStats.units ?? 0) >= 1);
}

/** Local day key, the same form dayStats is keyed by. */
function tagesschluessel(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Monday 00:00 of the week containing nowMs, local time. */
function wochenstart(nowMs) {
  const d = new Date(nowMs);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Days that count, derived from dayStats.
 *
 * This used to read state.week.doneDays — a second store that nothing ever
 * wrote to. The weekly goal therefore read "0 of 5" forever, no matter how much
 * work went in, and the mechanism the plan puts in place of a streak (#29) was
 * dead on arrival. Deriving it from dayStats leaves one source of truth: if a
 * day counts in the statistics, it counts in the goal.
 */
export function lerntage(state, vonMs, bisMs) {
  const raus = [];
  for (const [key, wert] of Object.entries(state.dayStats ?? {})) {
    if (!dayCounts(wert ?? {})) continue;
    const ms = Date.parse(key + 'T00:00:00');
    if (Number.isNaN(ms)) continue;
    if (vonMs != null && ms < vonMs) continue;
    if (bisMs != null && ms > bisMs) continue;
    raus.push(key);
  }
  return raus.sort();
}

export function weekProgress(state, nowMs) {
  const montag = wochenstart(nowMs).getTime();
  const done = lerntage(state, montag, nowMs).length;
  const goal = state.week?.goalDays ?? 5;
  return { done, goal, met: done >= goal, tage: lerntage(state, montag, nowMs) };
}

/** Which of the last seven days counted — the dots in the top bar. */
export function wochenpunkte(state, nowMs) {
  const montag = wochenstart(nowMs);
  const zaehlt = new Set(lerntage(state));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(montag); d.setDate(montag.getDate() + i);
    const key = tagesschluessel(d.getTime());
    return { key, kurz: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'][i],
             gelernt: zaehlt.has(key), zukunft: d.getTime() > nowMs };
  });
}

/** Weeks in which the goal was met — counted, not stored. */
export function wochenzieleErreicht(state, nowMs = Date.now()) {
  const proWoche = new Map();
  for (const key of lerntage(state)) {
    const w = wochenstart(Date.parse(key + 'T00:00:00')).getTime();
    proWoche.set(w, (proWoche.get(w) ?? 0) + 1);
  }
  const ziel = state.week?.goalDays ?? 5;
  return [...proWoche.values()].filter(n => n >= ziel).length;
}

// ---------- badges (the catalogue grows with the content) ----------

export const BADGES = [
  { id: 'erste-schritte', title: 'Aktenkundig', desc: 'Erste Einheit abgeschlossen.', check: s => (s.stats?.units ?? 0) >= 1 },
  { id: 'streakless', title: 'Verlässlich unspektakulär', desc: 'Wochenziel zum ersten Mal erreicht.', check: s => (s.stats?.weeksMet ?? 0) >= 1 },
  { id: 'phase1', title: 'Fundament betoniert', desc: 'Phase 1 bestanden.', check: s => s.phase_progress?.p1?.passed === true },
  { id: 'verbote', title: 'Rote-Linien-Kenner', desc: 'Phase 2 bestanden.', check: s => s.phase_progress?.p2?.passed === true },
  { id: 'hundert', title: 'Dreistellig', desc: '100 Fragen beantwortet.', check: s => (s.stats?.questions ?? 0) >= 100 },
  { id: 'grenzfall', title: 'Grenzfall-Gourmet', desc: '25 C-Stufen-Fragen richtig.', check: s => (s.stats?.cCorrect ?? 0) >= 25 },
  { id: 'ehrlich', title: 'Kalibriert', desc: '20× „unsicher" angegeben und trotzdem richtig.', check: s => (s.stats?.honestCorrect ?? 0) >= 20 },
  { id: 'bosskiller', title: 'Meeting überlebt', desc: 'Ersten Bosskampf solide bestanden.', check: s => (s.stats?.bossPassed ?? 0) >= 1 },
  { id: 'retention7', title: 'Langzeitgedächtnis aktiviert', desc: '50 Karten auf Stufe „behalten".', check: s => (s.stats?.retained7 ?? 0) >= 50 },
  { id: 'omnibus', title: 'Fahrplan-Auskunft', desc: 'Alle Fristen-Fragen der Omnibus-Einheit richtig.', check: s => s.stats?.omnibusPerfect === true }
];

/**
 * The state a badge check sees: stored counters plus everything derivable.
 *
 * Six of the ten badges asked for counters nothing incremented — weeksMet,
 * bossPassed, retained7, omnibusPerfect and units among them — so they could
 * never be earned, however much work went in. Deriving them from data the
 * application already keeps removes both the dead counters and the risk that a
 * counter and reality drift apart.
 */
export function badgeSicht(state, nowMs = Date.now()) {
  const stats = { ...(state.stats ?? {}) };
  stats.units = state.unit_done?.length ?? stats.units ?? 0;
  stats.weeksMet = wochenzieleErreicht(state, nowMs);
  stats.retained7 = (state.cards ?? []).filter(c => c.retention === 'behalten' || c.retention === 'gefestigt').length;
  stats.bossPassed = stats.bossPassed
    ?? (state.events ?? []).filter(e => e.kind === 'boss_completed' && e.passed).length;
  return { ...state, stats };
}

export function newBadges(state, nowMs = Date.now()) {
  state.badges = state.badges ?? [];
  const sicht = badgeSicht(state, nowMs);
  const fresh = BADGES.filter(b => !state.badges.includes(b.id) && b.check(sicht));
  for (const b of fresh) state.badges.push(b.id);
  return fresh;
}

// ---------- ceremonies (small, medium, large) ----------

export const CEREMONY = Object.freeze({ KLEIN: 'klein', MITTEL: 'mittel', GROSS: 'gross' });

/** Confetti physics on canvas; disabled entirely under reduced motion. */
export function confettiBurst(doc, { count = 80, duration = 1800 } = {}) {
  if (doc.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
  const c = doc.createElement('canvas');
  c.className = 'confetti';
  Object.assign(c.style, { position: 'fixed', inset: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 70 });
  doc.body.appendChild(c);
  const ctx = c.getContext('2d');
  c.width = innerWidth; c.height = innerHeight;
  const colors = ['#65d8b2', '#e1ad58', '#8a70ef', '#22d3ee', '#e5eaf3'];
  const parts = Array.from({ length: count }, (_, i) => ({
    x: c.width / 2 + (i % 2 ? 1 : -1) * (i * 3 % 120), y: c.height * 0.35,
    vx: (i * 7919 % 200 - 100) / 18, vy: -((i * 104729 % 140) + 60) / 14,
    r: 3 + (i % 4), rot: i, col: colors[i % colors.length]
  }));
  const t0 = performance.now();
  (function tick(t) {
    const dt = t - t0;
    ctx.clearRect(0, 0, c.width, c.height);
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.18; p.rot += 0.1;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, 1 - dt / duration);
      ctx.fillStyle = p.col; ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
      ctx.restore();
    }
    if (dt < duration) requestAnimationFrame(tick); else c.remove();
  })(t0);
  return c;
}

/**
 * Trigger a ceremony: small = inline snap; medium = toast with a small burst;
 * large = full-screen stage (dimmed, artwork rises, stats card, confetti).
 */
export function ceremony(doc, tier, payload = {}) {
  if (tier === CEREMONY.KLEIN) {
    const el = payload.anchor ?? doc.body;
    const s = doc.createElement('span');
    s.className = 'xp-pop';
    s.textContent = `+${payload.xp ?? 0} XP`;
    el.appendChild(s);
    setTimeout(() => s.remove(), 1200);
    return { tier, el: s };
  }
  if (tier === CEREMONY.MITTEL) {
    const t = doc.createElement('div');
    t.className = 'toast-ceremony';
    t.innerHTML = `${payload.image ? `<img src="${payload.image}" alt="">` : ''}<div><b>${payload.title ?? ''}</b><p>${payload.text ?? ''}</p></div>`;
    doc.body.appendChild(t);
    confettiBurst(doc, { count: 40, duration: 1200 });
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 3200);
    return { tier, el: t };
  }
  // GROSS
  const stage = doc.createElement('div');
  stage.className = 'stage-ceremony';
  stage.innerHTML = `<div class="stage-inner">
      ${payload.image ? `<img class="stage-art" src="${payload.image}" alt="">` : ''}
      <h2>${payload.title ?? ''}</h2><p>${payload.text ?? ''}</p>
      ${payload.stats ? `<div class="stage-stats">${payload.stats.map(s => `<div><b>${s.v}</b><span>${s.k}</span></div>`).join('')}</div>` : ''}
      <button class="btn-primary">Weiter</button></div>`;
  doc.body.appendChild(stage);
  confettiBurst(doc, { count: 120, duration: 2400 });
  stage.querySelector('button').addEventListener('click', () => stage.remove());
  return { tier, el: stage };
}
