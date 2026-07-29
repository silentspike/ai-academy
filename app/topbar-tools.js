// app/topbar-tools.js — search, due list and profile menu in the top bar.
//
// The design reference shows a magnifier, a bell and an avatar. None of the
// three existed. They are built as working functions rather than placed as
// shapes: a magnifier that does not search is worse than no magnifier, because
// it promises something the product cannot do.
//
// Search covers what the product actually holds — units, glossary entries and
// article references — and is deliberately local: no request, no index build at
// startup, the content files are already fetched for the dashboard anyway.

const MAX_TREFFER = 8;

let INDEX = null;

/** Builds the search index once from the content files. */
export async function sucheIndex() {
  if (INDEX) return INDEX;
  const [units, glossar, facts] = await Promise.all([
    fetch('content/units/index.json').then(r => r.ok ? r.json() : { units: [] }).catch(() => ({ units: [] })),
    fetch('content/glossary.json').then(r => r.ok ? r.json() : []).catch(() => []),
    fetch('content/facts-db.json').then(r => r.ok ? r.json() : null).catch(() => null),
  ]);

  const eintraege = [];
  const artikelZuEinheit = new Map();
  for (const u of units.units ?? []) {
    for (const ref of u.legal_refs ?? []) if (!artikelZuEinheit.has(ref)) artikelZuEinheit.set(ref, u.id);
    eintraege.push({
      art: 'einheit', titel: u.title, unter: `Phase ${u.phase.slice(1)} · ${(u.legal_refs ?? []).join(', ')}`,
      ziel: `#/einheit/${u.id}`,
      suchtext: [u.title, u.id, ...(u.legal_refs ?? []), u.competency].join(' ').toLowerCase(),
    });
  }
  for (const g of glossar) {
    const ref = Array.isArray(g.legal_basis) ? g.legal_basis[0] : g.legal_basis;
    const einheit = ref ? artikelZuEinheit.get(String(ref).split(/[,(]/)[0].trim()) : null;
    eintraege.push({
      art: 'begriff', titel: g.term, unter: g.simple ?? '',
      // Without a unit the entry still helps: the explanation is the result.
      ziel: einheit ? `#/einheit/${einheit}` : null,
      erklaerung: g.simple ?? '',
      suchtext: [g.term, ...(g.aliases ?? []), g.simple ?? ''].join(' ').toLowerCase(),
    });
  }
  // Articles without a unit of their own are covered by the overview unit — the
  // same mapping the article map uses when a tile has no unit behind it. Sending
  // them to the dashboard instead would be a hit that promises a destination and
  // delivers the page the user is already on.
  const UEBERBLICK = 'p8-e01-randwissen';
  const hatUeberblick = (units.units ?? []).some(u => u.id === UEBERBLICK);
  for (const a of facts?.relevanz_matrix?.artikel ?? []) {
    const einheit = artikelZuEinheit.get(a.ref);
    eintraege.push({
      art: 'artikel', titel: a.ref,
      unter: einheit ? (a.titel ?? a.kurz ?? 'Artikel des AI Act')
                     : `${a.titel ?? a.kurz ?? 'Artikel des AI Act'} — im Überblick „Randwissen"`,
      ziel: einheit ? `#/einheit/${einheit}` : (hatUeberblick ? `#/einheit/${UEBERBLICK}` : null),
      suchtext: [a.ref, a.titel ?? '', a.kurz ?? '', ...(a.kategorien ?? [])].join(' ').toLowerCase(),
    });
  }
  INDEX = eintraege;
  return INDEX;
}

/**
 * Ranked hits. Exact prefix before word start before anywhere, so typing "Art. 6"
 * puts Article 6 first and not Article 60.
 */
export function suche(eintraege, roh) {
  const q = (roh ?? '').trim().toLowerCase();
  if (q.length < 2) return [];
  const treffer = [];
  for (const e of eintraege) {
    const pos = e.suchtext.indexOf(q);
    if (pos < 0) continue;
    const titel = e.titel.toLowerCase();
    let rang = 3;
    if (titel === q) rang = 0;
    else if (titel.startsWith(q)) rang = 1;
    else if (new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(titel)) rang = 2;
    // Units before glossary before articles when the rank is equal: a unit is
    // somewhere to go, an article reference is only a pointer.
    const artRang = { einheit: 0, begriff: 1, artikel: 2 }[e.art] ?? 3;
    treffer.push({ ...e, rang, artRang, pos });
  }
  return treffer
    .sort((a, b) => a.rang - b.rang || a.artRang - b.artRang || a.pos - b.pos || a.titel.length - b.titel.length)
    .slice(0, MAX_TREFFER);
}

/** True while an examination is on screen: search would be a way around closed book. */
export function pruefungLaeuft(doc = document) {
  return !!doc.querySelector('[data-quiz-mode="closed_book"]');
}

const ART_LABEL = { einheit: 'Einheit', begriff: 'Begriff', artikel: 'Fundstelle' };

/**
 * Builds the result list as nodes, never as an HTML string.
 *
 * The first version interpolated the query into innerHTML for the empty case —
 * typing a script tag into the search box would have run it. Content titles go
 * the same way: the plan treats model output and content data as untrusted and
 * bars it from innerHTML, and a search field is the one place where the user's
 * own input comes straight back onto the page.
 */
function zeichneTreffer(liste, treffer, q) {
  const doc = liste.ownerDocument;
  const el = (tag, klasse, text) => {
    const n = doc.createElement(tag);
    if (klasse) n.className = klasse;
    if (text != null) n.textContent = text;
    return n;
  };

  if (!treffer.length) {
    liste.replaceChildren(el('div', 'such-leer', `Nichts gefunden zu „${q}".`));
    return;
  }
  // A hit without a destination is rendered as text, not as a dead link: the
  // glossary explanation is the answer, and a link back to the current page
  // would promise somewhere to go and deliver nothing.
  liste.replaceChildren(...treffer.map((t, i) => {
    const knoten = el(t.ziel ? 'a' : 'div', 'such-treffer' + (i === 0 ? ' aktiv' : ''));
    if (t.ziel) knoten.setAttribute('href', t.ziel);
    else knoten.dataset.nurInfo = '1';
    knoten.dataset.i = String(i);
    knoten.append(
      el('span', 'such-art', ART_LABEL[t.art] ?? t.art),
      el('span', 'such-titel', t.titel),
      el('span', 'such-unter', (t.unter ?? '').slice(0, 110)),
    );
    return knoten;
  }));
}

/**
 * Wires the three controls. Called once after the shell exists.
 * ctx gives access to state and storage; both menus read live data on open
 * rather than a value captured at wiring time.
 */
export function verdrahteTopbar(ctx, { doc = document } = {}) {
  const feld = doc.getElementById('tb-suche-feld');
  const liste = doc.getElementById('tb-suche-treffer');
  const suchbox = doc.getElementById('tb-suche');

  // Drei Werkzeuge, drei Fenster — und keines wusste vom anderen: im Bild lagen
  // Trefferliste und Profil-Menue uebereinander. Wer eines oeffnet, schliesst
  // die anderen.
  const andereZu = (ausser) => {
    for (const id of ['tb-suche-treffer', 'tb-faellig-menu', 'tb-profil-menu']) {
      if (id === ausser) continue;
      const el = doc.getElementById(id);
      if (el && !el.hidden) {
        el.hidden = true;
        if (id === 'tb-suche-treffer') doc.getElementById('tb-suche')?.classList.remove('offen');
      }
    }
  };

  if (feld && liste) {
    let aktuell = [];
    let markiert = 0;
    const schliessen = () => { liste.hidden = true; suchbox?.classList.remove('offen'); };

    const lauf = async () => {
      if (pruefungLaeuft(doc)) {
        liste.hidden = false;
        // Ohne Zeichen: alle anderen Sperren im Werkzeug tragen ein Schloss.
        liste.innerHTML = '<div class="such-leer">'
          + '<svg class="ut-sym" aria-hidden="true"><use href="assets/icons/sprite.svg#icon-st-lock"/></svg>'
          + '<span>Während einer Prüfung ohne Hilfsmittel ist die Suche aus — genau darum geht es.</span></div>';
        return;
      }
      const idx = await sucheIndex();
      aktuell = suche(idx, feld.value);
      markiert = 0;
      if (!feld.value.trim() || feld.value.trim().length < 2) { schliessen(); return; }
      andereZu('tb-suche-treffer');
      liste.hidden = false;
      suchbox?.classList.add('offen');
      zeichneTreffer(liste, aktuell, feld.value.trim());
    };

    feld.addEventListener('input', lauf);
    feld.addEventListener('focus', lauf);
    feld.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { feld.value = ''; schliessen(); feld.blur(); return; }
      if (!aktuell.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        markiert = (markiert + (e.key === 'ArrowDown' ? 1 : aktuell.length - 1)) % aktuell.length;
        [...liste.querySelectorAll('.such-treffer')].forEach((a, i) => a.classList.toggle('aktiv', i === markiert));
      } else if (e.key === 'Enter') {
        const ziel = aktuell[markiert];
        if (ziel?.ziel) { location.hash = ziel.ziel.slice(1); schliessen(); feld.blur(); }
      }
    });
    liste.addEventListener('click', (e) => {
      const a = e.target.closest('.such-treffer');
      if (a?.dataset.nurInfo) e.preventDefault();       // glossary entry without a unit: the text is the answer
      else schliessen();
    });
    doc.addEventListener('click', (e) => { if (!suchbox?.contains(e.target)) schliessen(); });
  }

  // ---- due list: the same numbers the review view uses, and a way there
  const glocke = doc.getElementById('tb-faellig');
  const glockenmenu = doc.getElementById('tb-faellig-menu');
  if (glocke && glockenmenu) {
    // Loaded up front, not on click: awaiting an import between opening and
    // filling shows an empty box for a frame — and makes any check of the
    // contents a race.
    const module = Promise.all([import('./engine-leitner.js'), import('./gamification.js')]);
    glocke.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!glockenmenu.hidden) { glockenmenu.hidden = true; return; }
      andereZu('tb-faellig-menu');
      const [{ splitQueues, planAufhol }, { weekProgress }] = await module;
      const q = splitQueues(ctx.state.cards ?? [], Date.now());
      const heute = planAufhol(q.aufholMeta, { perDay: 15 }).today;
      const w = weekProgress(ctx.state, Date.now());
      const doc2 = glockenmenu.ownerDocument;
      const eintrag = (zahl, text, ziel) => {
        const a = doc2.createElement('a');
        a.className = 'menu-eintrag';
        a.setAttribute('href', ziel);
        const b = doc2.createElement('b');
        b.textContent = String(zahl);
        a.append(b, doc2.createTextNode(' ' + text));
        return a;
      };
      const kopf = doc2.createElement('div');
      kopf.className = 'menu-kopf';
      kopf.textContent = 'Heute zu tun';
      glockenmenu.replaceChildren(
        kopf,
        eintrag(q.kern.length,
          `Karte${q.kern.length === 1 ? '' : 'n'} im Kern${q.kern.length ? ' — Pflicht vor neuem Stoff' : ' — nichts fällig'}`,
          '#/karten'),
        eintrag(heute.length,
          `zum Aufholen${q.aufhol.length > heute.length ? ` (von ${q.aufhol.length}, verteilt)` : ''}`,
          '#/karten'),
        eintrag(`${w.done}/${w.goal}`, `Tage Wochenziel${w.met ? ' — erreicht' : ''}`, '#/heute'),
      );
      glockenmenu.hidden = false;
    });
    doc.addEventListener('click', (e) => {
      if (!glocke.contains(e.target) && !glockenmenu.contains(e.target)) glockenmenu.hidden = true;
    });
  }

  // ---- profile menu: existing views only, plus export and reset
  const profil = doc.getElementById('tb-profil');
  const profilmenu = doc.getElementById('tb-profil-menu');
  if (profil && profilmenu) {
    profil.addEventListener('click', (e) => {
      e.preventDefault();
      if (profilmenu.hidden) andereZu('tb-profil-menu');
      profilmenu.hidden = !profilmenu.hidden;
    });
    profilmenu.addEventListener('click', async (e) => {
      const akt = e.target.closest('[data-aktion]')?.dataset.aktion;
      if (!akt) return;
      e.preventDefault();
      if (akt === 'export') {
        const bundle = await ctx.storage.exportAll();
        const a = doc.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 1)], { type: 'application/json' }));
        const d = new Date();
        a.download = `ai-act-akademie-lernstand-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
        a.click(); URL.revokeObjectURL(a.href);
      }
      profilmenu.hidden = true;
    });
    doc.addEventListener('click', (e) => {
      if (!profil.contains(e.target) && !profilmenu.contains(e.target)) profilmenu.hidden = true;
    });
  }
}
