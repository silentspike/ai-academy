// app/rewards.js — Belohnungs-Verdrahtung (Plan #28, §6.3 gestufte Zeremonien).
// Zentrale Stelle, an der ECHTE Ereignisse zu Zeremonien werden:
//   KLEIN  = richtige Antwort/XP (inline, im Quiz)
//   MITTEL = neues Badge, Tagesziel erreicht
//   GROSS  = Level-Up, Phasen-Abschluss, bestandenes Examen
// Vorher lief nur KLEIN; MITTEL/GROSS existierten ausschließlich in der Demo-Route.
import { levelFor, newBadges, ceremony, CEREMONY, BADGES, dayCounts } from './gamification.js';

const dayKey = (ms = Date.now()) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Nach JEDEM verbuchten Ereignis aufrufen: prüft Level-Up, neue Badges und Tagesziel
 * und spielt die passende Zeremonie. Gibt aus, was ausgelöst wurde (für Tests/Logs).
 */
export function checkRewards(state, doc = document, { anchor = null, phaseCompleted = null, examPassed = false } = {}) {
  const fired = [];
  const titel = state.levelEndtitel;

  // 1. Level-Up (GROSS)
  const lvl = levelFor(state.xp ?? 0, titel);
  if ((state.level ?? 1) < lvl.level) {
    state.level = lvl.level;
    ceremony(doc, CEREMONY.GROSS, { title: `Level ${lvl.level} — ${lvl.title}`, text: 'Aktivitäts-XP treiben Level und Badges; dein Können zeigt das Kompetenz-Radar (#28).', image: 'assets/badges/endstufe-krone.png', stats: [{ k: 'XP', v: state.xp ?? 0 }, { k: 'Level', v: lvl.level }] });
    fired.push({ tier: 'gross', kind: 'level', level: lvl.level, title: lvl.title });
  } else if (state.level == null) {
    state.level = lvl.level;
  }

  // 2. Neue Badges (MITTEL)
  for (const b of newBadges(state)) {
    ceremony(doc, CEREMONY.MITTEL, { title: b.title, text: b.desc, image: badgeArt(b.id) });
    fired.push({ tier: 'mittel', kind: 'badge', id: b.id, title: b.title });
  }

  // 3. Tagesziel erreicht (MITTEL, einmal pro Tag)
  const dk = dayKey();
  const ds = state.dayStats?.[dk];
  if (ds && dayCounts(ds) && !ds.celebrated) {
    ds.celebrated = true;
    const done = Object.entries(state.dayStats).filter(([, v]) => dayCounts(v)).length;
    ceremony(doc, CEREMONY.MITTEL, { title: 'Lerntag zählt', text: `${done} von ${state.week?.goalDays ?? 5} Tagen dieser Woche` });
    fired.push({ tier: 'mittel', kind: 'tagesziel' });
  }

  // 4. Phasen-Abschluss / Examen (GROSS)
  if (phaseCompleted) {
    ceremony(doc, CEREMONY.GROSS, { title: `Phase ${phaseCompleted.toUpperCase()} abgeschlossen`, text: 'Kapiteltest bestanden — Bosskampf und Test hinter dir.', image: coverArt(phaseCompleted) });
    fired.push({ tier: 'gross', kind: 'phase', phase: phaseCompleted });
  }
  if (examPassed) {
    ceremony(doc, CEREMONY.GROSS, { title: 'Examen bestanden', text: 'Teil A (Closed Book) und Capstone (Open Book) — der Lernnachweis steht bereit.', image: 'assets/badges/endstufe-krone.png' });
    fired.push({ tier: 'gross', kind: 'examen' });
  }
  void anchor;
  return fired;
}

const COVER = { p1: 'p1-fundament', p2: 'p2-verbote', p3: 'p3-einstufung', p4: 'p4-pflichten', p5: 'p5-transparenz',
  p6: 'p6-gpai', p7: 'p7-aufsicht', p8: 'p8-randwissen', p9: 'p9-oesterreich', p10: 'p10-auslegung' };
function coverArt(p) { return `assets/covers/${COVER[p] ?? p}.png`; }

// Badge-ID → vorhandenes Artwork (Task-12-Nacharbeit: die Galerie lud 404er, weil
// IDs und Dateinamen auseinanderliefen).
const BADGE_ART = {
  'erste-schritte': 'erste-einheit.png',
  'streakless': 'wochenziel.png',
  'phase1': 'phase1-fundament.png',
  'verbote': 'verbote-erkannt.png',
  'hundert': 'hundert-fragen.png',
  'grenzfall': 'risikopyramide.png',
  'ehrlich': 'kalibriert.png',
  'bosskiller': 'bosskampf.png',
  'retention7': 'retention.png',
  'omnibus': 'omnibus.png',
};
function badgeArt(id) { return `assets/badges/${BADGE_ART[id] ?? 'wissens-tresor.png'}`; }

/** Badge-Galerie (#28): verdiente und offene Badges sichtbar machen. */
export function renderBadgeGallery(mount, state) {
  const have = new Set(state.badges ?? []);
  mount.innerHTML = `<div class="badge-grid">${BADGES.map(b => `
    <div class="badge-tile${have.has(b.id) ? ' have' : ''}" title="${b.desc}">
      <img src="${badgeArt(b.id)}" alt="" onerror="this.style.visibility='hidden'">
      <span>${b.title}</span>
    </div>`).join('')}</div>
   <p class="dim">${have.size}/${BADGES.length} verdient · XP belohnt Arbeit, das Kompetenz-Radar zeigt Können (#28 — beides bleibt getrennt).</p>`;
  return have.size;
}

/** Erstkontakt-Hero (§6.3): einmaliger Startmoment vor dem ersten Lernen. */
export function heroOnce(state, doc = document) {
  if (state.heroSeen) return false;
  const ov = doc.createElement('div');
  ov.className = 'hero-overlay';
  ov.innerHTML = `<div class="hero-card">
      <img src="assets/covers/hero.png" alt="" onerror="this.remove()">
      <h1>AI-Act-Akademie</h1>
      <p>Den EU AI Act nicht nachlesen, sondern anwenden können — Einstufung, Pflichten, Fristen.
         Auf dem Rechtsstand, der wirklich gilt.</p>
      <button class="btn-primary">Los geht's</button>
    </div>`;
  doc.body.appendChild(ov);
  ov.querySelector('button').onclick = () => {
    state.heroSeen = Date.now();
    ov.remove();
    doc.dispatchEvent(new CustomEvent('akademie:hero-done'));
  };
  return true;
}
