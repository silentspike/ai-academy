// app/gamification.js — XP, Level, Badges, Wochenziel, Zeremonien (Plan #28–#31, §6.3).
// KERNREGEL (#28, Review 2): Aktivitäts-XP (Teilnahme — auch bei Fehlern, straffreier Lernraum)
// und Mastery-Evidenz (nur echte, verzögerte, erfolgreiche Leistungen) sind STRIKT getrennte
// Größen und werden nie vermischt. XP treibt Level/Badges; Mastery treibt Radar/Retention/Gate.
// Logik DOM-frei; Zeremonien-Rendering getrennt.

// ---------- XP & Level (Aktivität) ----------

export const XP_RULES = Object.freeze({
  check_answered: { A: 10, B: 14, C: 20 },     // C > B > A (#28) — unabhängig von richtig/falsch
  unit_completed: 40,
  review_session: 25,
  drill_completed: 20,
  boss_completed: 60,
  test_passed: 120,
  exam_passed: 400
});

/** Level-Leiter: trocken-witzige Fachtitel (#28); Endstufe kommt aus dem Profil. */
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
 * Ereignis verbuchen — gibt IMMER beide Ströme getrennt zurück (AC1).
 * event: {kind, level?, correct?, confidence?, delayedDays?, competency?}
 * XP fließt bei Teilnahme; Mastery-Evidenz NUR wenn correct && (kind summativ/verzögert relevant).
 */
export function applyEvent(state, event) {
  const xpGain = event.kind === 'check_answered'
    ? XP_RULES.check_answered[event.level ?? 'A']
    : (XP_RULES[event.kind] ?? 0);
  state.xp += xpGain;

  let masteryGain = null;
  if (event.correct === true) {
    // Mastery zählt nur echte Erfolge; verzögerte Leistung (≥1 Tag Abstand) wiegt mehr (#28, #33)
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

/** Ein Tag zählt ab: Pflicht-Review erledigt UND (≥10 Fragen ODER ≥1 Einheit). */
export function dayCounts(dayStats) {
  return dayStats.reviewDone === true && ((dayStats.questions ?? 0) >= 10 || (dayStats.units ?? 0) >= 1);
}

export function weekProgress(state, nowMs) {
  const day = new Date(nowMs);
  const monday = new Date(day); monday.setDate(day.getDate() - ((day.getDay() + 6) % 7)); monday.setHours(0, 0, 0, 0);
  const done = (state.week.doneDays ?? []).filter(d => d >= monday.getTime()).length;
  return { done, goal: state.week.goalDays ?? 5, met: done >= (state.week.goalDays ?? 5) };
}

// ---------- Badges (#28; Katalog wächst mit Content) ----------

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

export function newBadges(state) {
  state.badges = state.badges ?? [];
  const fresh = BADGES.filter(b => !state.badges.includes(b.id) && b.check(state));
  for (const b of fresh) state.badges.push(b.id);
  return fresh;
}

// ---------- Zeremonien (§6.3: klein / mittel / groß) ----------

export const CEREMONY = Object.freeze({ KLEIN: 'klein', MITTEL: 'mittel', GROSS: 'gross' });

/** Konfetti-Physik auf Canvas — nur transform/opacity-äquivalente Zeichnung, reduced-motion → aus. */
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
 * Zeremonie auslösen (AC4): klein = Inline-Snap; mittel = Toast + kleiner Burst;
 * groß = Vollbild-Bühne (abgedunkelt, Artwork fährt auf, Stats-Karte, Konfetti).
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
