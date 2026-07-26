// app/ritual.js — the session ritual in the interface, with the review enforced.
// Wires the DOM-free state machine from session.js into the application:
//   4-Takt: Pflicht-Review → 2–3 Einheiten → Tages-Drill → Abschluss-Karte
// plus intensive blocks (60 minutes), marathon warning, rotation banner and drift suggestion.
import { route } from './router.js';
import {
  STEPS, createSession, canStartUnit, completeStep,
  blockCheck, marathonWarning, rotationHint, wrapupCard,
} from './session.js';
import { splitQueues } from './engine-leitner.js';
import { aggregateCompetencies, weakestCompetencies } from './competency.js';
import { driftCheck } from './pacing.js';
import { renderQuestion } from './engine-quiz.js';
import { applyEvent } from './gamification.js';
import { einheitenGesamt } from './content-index.js';

const dayKey = (ms = Date.now()) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Fetch or create today's session; persisted in state so a reload destroys nothing. */
export function todaySession(state, nowMs = Date.now()) {
  const key = dayKey(nowMs);
  if (state.session?.day === key) return state.session;
  const agg = aggregateCompetencies(state.events ?? []);
  const weakScores = new Map([...agg.entries()].map(([k, v]) => [k, v.score]));
  state.session = { day: key, ...createSession(state, nowMs, { weakScores }) };
  return state.session;
}

/** Intensive-block and marathon status, for display anywhere. */
export function sessionStatus(state, nowMs = Date.now()) {
  const s = todaySession(state, nowMs);
  return { session: s, block: blockCheck(s, nowMs), marathon: marathonWarning(s, nowMs) };
}

export function noteActivity(state, kind, nowMs = Date.now()) {
  const s = todaySession(state, nowMs);
  return rotationHint(s, kind, nowMs);
}

const card = html => { const d = document.createElement('div'); d.className = 'card'; d.innerHTML = html; return d; };

// ---------------------------------------------------------------- #/heute — Ritual-Cockpit
route('heute', async (view, ctx) => {
  const st = ctx.state;
  const s = todaySession(st);
  const q = splitQueues(st.cards ?? [], Date.now());
  const marathon = marathonWarning(s, Date.now());
  const idx = STEPS.indexOf(s.step);

  const takt = (i, name, sub, done, href, gesperrt) => `
    <a class="ritual-step${done ? ' done' : ''}${i === idx ? ' active' : ''}${gesperrt ? ' locked' : ''}"
       ${gesperrt ? '' : `href="${href}"`}>
      <span class="ritual-num">${done ? '✓' : i + 1}</span>
      <span class="ritual-txt"><b>${name}</b><span class="dim">${sub}</span></span>
    </a>`;

  view.appendChild(card(`<div class="chead violett"><span class="csym"><svg aria-hidden="true"><use href="assets/icons/sprite.svg#icon-st-kalender"/></svg></span><span class="t"><h3>Heute — dein Ritual</h3>
    <span class="sub">Feste Reihenfolge: kein „Womit fange ich an?" (#32). Wiederholung ist Pflicht VOR neuem Stoff.</span></span></div>
    <div class="ritual">
      ${takt(0, 'Pflicht-Review', `Kern ${s.review.kern.length} · Aufholen ${s.review.aufhol.length} · Retention-Checks ${s.review.retentionChecks.length}`, s.review.done, '#/karten', false)}
      ${takt(1, `Einheiten (${s.unitsDone}/${s.unitsPlanned})`, s.review.done ? 'Neuer Stoff freigeschaltet' : 'Gesperrt bis das Review erledigt ist', s.unitsDone >= s.unitsPlanned, '#/lernen', !canStartUnit(s))}
      ${takt(2, 'Tages-Drill', '5 Fragen: 3 Schwäche · 1 Zufall · 1 Grenzfall', s.drill.done, '#/drill', false)}
      ${takt(3, 'Abschluss-Karte', 'Bilanz, Kurve, Morgen-Vorschau', s.step === 'wrapup' && s.wrapupSeen, '#/wrapup', false)}
    </div>
    ${marathon.warn ? `<p class="ritual-warn">⚠ ${marathon.text}</p>` : ''}
    ${s.blocks.count ? `<p class="dim">Intensiv-Blöcke heute: ${s.blocks.count} (nach je ~60 min ein Mini-Block mit Pausenvorschlag, #33)</p>` : ''}`));

  // Detect completion automatically: nothing due any more means step 1 is done
  if (!s.review.done && q.kern.length === 0) { completeStep(s, 'review'); await ctx.saveState(); }
});

// ---------------------------------------------------------------- #/drill — Tages-Drill (#32)
route('drill', async (view, ctx) => {
  const st = ctx.state;
  const s = todaySession(st);
  const pool = (await fetch('content/questions-core.json').then(r => r.json())).questions
    .filter(q => q.status === 'approved_summative');
  // Variant engine: a formative extra pool from the fact database (distractor rotation
  // and inversion). NEVER summative — variants carry status 'agent_generated' and
  // appear only in the drill and in remediation.
  let variantPool = [];
  try {
    const { generateVariants } = await import('./variants.js');
    const facts = (await fetch('content/facts-db.json').then(r => r.json())).facts ?? [];
    const salt = 'drill-' + dayKey();
    variantPool = facts.flatMap(f => generateVariants(f, { count: 2, seedBase: salt }).variants)
      .filter(v => v.status !== 'approved_summative');
  } catch { /* Varianten sind Zusatz */ }
  const agg = aggregateCompetencies(st.events ?? []);
  const weak = weakestCompetencies(agg, 3).map(w => w.id);
  const seen = new Set(st.drillSeen ?? []);
  const gesamt = [...pool, ...variantPool];
  const pick = (filter, n) => {
    const src = gesamt.filter(q => filter(q) && !seen.has(q.id));
    const out = [];
    while (out.length < n && src.length) out.push(src.splice(Math.floor(Math.random() * src.length), 1)[0]);
    return out;
  };
  // Mix: three weak spots, one at random, one level-C bonus; top up if short
  const chosen = [
    ...pick(q => weak.includes(q.competency), s.drill.mix.weak),
    ...pick(() => true, s.drill.mix.random),
    ...pick(q => q.level === 'C', s.drill.mix.cBonus),
  ];
  while (chosen.length < s.drill.size) chosen.push(...pick(q => !chosen.includes(q), 1));
  const questions = chosen.slice(0, s.drill.size);

  view.appendChild(card(`<div class="chead gold"><span class="csym"><svg aria-hidden="true"><use href="assets/icons/sprite.svg#icon-st-flamme"/></svg></span><span class="t"><h3>Tages-Drill</h3>
    <span class="sub">${weak.length ? `Schwächen-gewichtet: ${weak.join(' · ')}` : 'Noch keine Schwächen-Historie — gemischte Auswahl'} · straffrei · Pool ${pool.length} Kernfragen + ${variantPool.length} Varianten</span></span></div>`));
  const mount = document.createElement('div');
  view.appendChild(mount);

  let i = 0, correct = 0;
  const step = () => {
    mount.innerHTML = '';
    if (i >= questions.length) {
      completeStep(s, 'drill');
      st.drillSeen = [...seen, ...questions.map(q => q.id)].slice(-120);
      ctx.saveState();
      mount.appendChild(card(`<h3>Drill erledigt — ${correct}/${questions.length}</h3>
        <p class="dim">Aktiver Abruf zum Sitzungsende: der stärkste Retention-Hebel (§3).</p>
        <a class="btn-primary" href="#/wrapup">Zur Abschluss-Karte</a>`));
      return;
    }
    const q = questions[i];
    mount.appendChild(card(`<span class="dim">Frage ${i + 1}/${questions.length} · ${q.competency} · Stufe ${q.level}${q.variant_of ? ' · <b>Variante</b> (generiert aus der Fakten-DB, nie in Prüfungen)' : ''}</span>`));
    const qm = document.createElement('div'); mount.appendChild(qm);
    renderQuestion(qm, q, {
      onAnswered: (res, conf) => {
        if (res.verdict === 'correct') correct++;
        const ev = applyEvent(st, { kind: 'check_answered', level: q.level, correct: res.verdict === 'correct', confidence: conf, ts: Date.now() });
        st.events.push({ kind: 'check_answered', competency: q.competency, level: q.level, correct: res.verdict === 'correct', confidence: conf, summative: false, ts: Date.now() });
        const dk = (d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)(new Date());
        st.dayStats = st.dayStats ?? {};
        st.dayStats[dk] = { ...(st.dayStats[dk] ?? {}), questions: (st.dayStats[dk]?.questions ?? 0) + 1, xp: (st.dayStats[dk]?.xp ?? 0) + ev.xpGain };
        st.stats = st.stats ?? {}; st.stats.questions = (st.stats.questions ?? 0) + 1;
        if (q.level === 'C' && res.verdict === 'correct') st.stats.cCorrect = (st.stats.cCorrect ?? 0) + 1;
        if (conf === 'unsicher' && res.verdict === 'correct') st.stats.honestCorrect = (st.stats.honestCorrect ?? 0) + 1;
        import('./rewards.js').then(({ checkRewards }) => checkRewards(st, document));
        ctx.saveState();
        i++; setTimeout(step, 900);
      },
    });
  };
  step();
});

// ---------------------------------------------------------------- #/wrapup — Abschluss-Karte (#32)
route('wrapup', async (view, ctx) => {
  const st = ctx.state;
  const s = todaySession(st);
  // Progress = completed units divided by total, for drift against the target curve
  const UNITS_TOTAL = await einheitenGesamt();
  const progress = Math.min(1, (st.unit_done?.length ?? 0) / UNITS_TOTAL);
  let drift = { onTrack: true, drift: 0 };
  if (st.milestones?.length && st.pace) {
    const start = st.events?.[0]?.ts ?? Date.now();
    drift = driftCheck({ ...st.pace, milestones: st.milestones }, { totalUnits: UNITS_TOTAL, minutesPerUnit: 25 }, progress, start, Date.now());
  }
  const w = wrapupCard(s, st, drift, Date.now());
  s.wrapupSeen = true;
  await ctx.saveState();

  // Proactive export hint after long sessions: Safari clears local storage
  // aggressively, and the export doubles as a way to move between devices.
  const grosseSession = w.bilanz.minutes >= 45 || w.bilanz.reviewed + w.bilanz.units * 5 >= 20;
  const localBackend = (ctx.storage?.backendName ?? '') === 'localStorage' || !ctx.storage?.backendName;
  if (grosseSession && !st.exportHintShownToday) {
    st.exportHintShownToday = dayKey();
    const ex = card(`<b>Sicherheitsnetz:</b> Große Lernsitzung — jetzt einmal exportieren.
      <span class="dim">${localBackend ? 'Browser-Speicher kann (v. a. in Safari) geräumt werden; ' : ''}der Export macht den Stand auch gerätewechselbar (§5.5).</span>
      <div style="margin-top:8px"><button class="btn" id="w-export">Lernstand exportieren</button></div>`);
    view.appendChild(ex);
    ex.querySelector('#w-export').onclick = async () => {
      const bundle = await ctx.storage.exportAll();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 1)], { type: 'application/json' }));
      a.download = `ai-act-akademie-lernstand-${dayKey()}.json`;
      a.click(); URL.revokeObjectURL(a.href);
      ex.querySelector('.dim').textContent = 'Exportiert — Datei sicher ablegen. Import über den Self-Check.';
    };
  }

  // "0 Minuten heute" neben "6 Karten wiederholt" widerspricht sich: die Dauer
  // zählt ab dem Sitzungsbeginn, und ein wiederhergestellter Stand fängt bei
  // null an. Lieber weglassen als eine Zahl zeigen, die der Zeile daneben
  // widerspricht.
  const dauer = w.bilanz.minutes >= 1 ? `${w.bilanz.minutes} Minuten heute` : 'Bilanz des Tages';
  view.appendChild(card(`<div class="chead gold"><span class="csym"><svg aria-hidden="true"><use href="assets/icons/sprite.svg#icon-st-star"/></svg></span><span class="t"><h3>Abschluss-Karte</h3>
    <span class="sub">${dauer}</span></span></div>
    <div class="wrap-stats">
      <div><b>${w.bilanz.reviewed}</b><span>Karten wiederholt</span></div>
      <div><b>${w.bilanz.units}</b><span>Einheiten</span></div>
      <div><b>${w.bilanz.drillDone ? '✓' : '—'}</b><span>Tages-Drill</span></div>
      <div><b>${(st.xp ?? 0).toLocaleString('de-AT')}</b><span>XP gesamt</span></div>
    </div>
    <div class="wrap-kurs ${w.drift.onTrack ? 'gut' : 'drift'}">
    ${w.drift.onTrack
      ? '<p><b>Auf Kurs</b> gegenüber der Soll-Kurve.</p>'
      : `<p><b>${(w.drift.drift * 100).toFixed(0)} % hinter der Soll-Kurve</b> — bewusst entscheiden statt schleifen lassen:</p>
         <ul>${(w.drift.options ?? []).map(o => `<li>${o.text}</li>`).join('')}</ul>
         <a class="btn" href="#/einstellungen">Einstellungen öffnen</a>`}
    </div>
    <div class="wrap-morgen"><span class="wm-tag">Morgen</span>
      <span>${w.morgen.dueTomorrow} Karten fällig${w.morgen.nextUnit ? ` · weiter mit „${w.morgen.nextUnit}"` : ''}</span></div>`));
});
