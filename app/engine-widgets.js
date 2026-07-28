// app/engine-widgets.js — Interaktive Widgets (Plan #45):
// (a) drag-and-drop assignment (fill the risk pyramid, articles to chapters, duties to roles)
// (b) deadline timeline 2024-2031 on the amended baseline (data from content/fristen.json)
// (c) Anhang-III-Explorer  (d) Art.-25-Rollenweiche
// Grading logic is DOM-free; rendering is separate. No external framework.

// ---------- (a) Drag&Drop-Zuordnung ----------

/**
 * Aufgaben-Schema: { id, title, zones:[{id,label,hint}], items:[{id,text,zone}] , competency, level }
 * gradeAssignment is DOM-free and therefore unit-testable.
 */
export function gradeAssignment(task, placement /* Map itemId→zoneId */) {
  let correct = 0; const wrong = [];
  for (const it of task.items) {
    if (placement.get(it.id) === it.zone) correct++;
    else wrong.push({ item: it.id, expected: it.zone, got: placement.get(it.id) ?? null });
  }
  const score = task.items.length ? correct / task.items.length : 0;
  return { verdict: score === 1 ? 'correct' : score > 0 ? 'partial' : 'wrong', score, wrong };
}

export function renderAssignment(mount, task, opts = {}) {
  const doc = mount.ownerDocument;
  mount.innerHTML = '';
  const wrap = doc.createElement('div');
  wrap.className = 'dnd';
  const pool = doc.createElement('div');
  pool.className = 'dnd-pool';
  const zones = doc.createElement('div');
  zones.className = `dnd-zones ${task.layout === 'pyramid' ? 'dnd-pyramid' : ''}`;
  const placement = new Map();

  for (const z of task.zones) {
    const zd = doc.createElement('div');
    zd.className = 'dnd-zone'; zd.dataset.zid = z.id;
    zd.innerHTML = `<div class="dnd-zlabel">${z.label}</div>`;
    zd.addEventListener('dragover', ev => { ev.preventDefault(); zd.classList.add('over'); });
    zd.addEventListener('dragleave', () => zd.classList.remove('over'));
    zd.addEventListener('drop', ev => {
      ev.preventDefault(); zd.classList.remove('over');
      const id = ev.dataTransfer.getData('text/plain');
      const chip = wrap.querySelector(`[data-iid="${id}"]`);
      if (chip) { zd.appendChild(chip); placement.set(id, z.id); check(); }
    });
    zones.appendChild(zd);
  }
  for (const it of task.items) {
    const chip = doc.createElement('div');
    chip.className = 'dnd-chip'; chip.dataset.iid = it.id;
    chip.draggable = true; chip.textContent = it.text;
    chip.addEventListener('dragstart', ev => ev.dataTransfer.setData('text/plain', it.id));
    pool.appendChild(chip);
  }
  const fb = doc.createElement('div');
  fb.className = 'dnd-feedback';
  wrap.append(pool, zones, fb);
  mount.appendChild(wrap);

  function check() {
    if (placement.size !== task.items.length) return;
    const res = gradeAssignment(task, placement);
    for (const chip of wrap.querySelectorAll('.dnd-chip')) {
      const bad = res.wrong.some(w => w.item === chip.dataset.iid);
      chip.classList.add(bad ? 'state-wrong' : 'state-correct');
    }
    fb.textContent = res.verdict === 'correct'
      ? '✓ Alles richtig zugeordnet.'
      : `≈ ${Math.round(res.score * 100)} % — falsch platziert: ${res.wrong.length}`;
    opts.onAnswered?.(res);
  }
  return { wrap, placement };
}

// ---------- (b) Fristen-Timeline (Omnibus-Stand, §2.6/#45c) ----------

/**
 * milestones: from content/fristen.json (g1-g9 and u1-u5) —
 * [{id, date:'YYYY-MM-DD', label, detail, kind:'geltung'|'uebergang', changed_by_omnibus:bool}]
 */
export function renderTimeline(mount, milestones, opts = {}) {
  const doc = mount.ownerDocument;
  const from = Date.parse(opts.from ?? '2024-06-01');
  const to = Date.parse(opts.to ?? '2031-03-01');
  const W = opts.width ?? 900, H = 210, PAD = 40;   // H trägt 5 Beschriftungszeilen
                                                  // (34..114) plus the axis at H-56.
  const x = d => PAD + (Date.parse(d) - from) / (to - from) * (W - 2 * PAD);
  const years = [];
  for (let y = 2024; y <= 2031; y++) years.push(y);
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.classList.add('tl');
  svg.innerHTML =
    years.map(y => `<line x1="${x(y + '-01-01')}" y1="30" x2="${x(y + '-01-01')}" y2="${H - 46}" stroke="rgba(151,169,202,.10)"/>` +
      `<text x="${x(y + '-01-01')}" y="${H - 30}" fill="rgba(218,226,240,.5)" font-size="10" text-anchor="middle">${y}</text>`).join('') +
    `<line x1="${PAD}" y1="${H - 56}" x2="${W - PAD}" y2="${H - 56}" stroke="rgba(151,169,202,.25)"/>`;
  const sorted = [...milestones].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  // The milestones are distributed very unevenly in time, clustering in 2026-2027. A
  // fixed row rotation pushes closely spaced labels on top of each other, and an
  // estimated character width does not fit reliably: capitals and digits are
  // considerably wider than average. Hence two passes: insert every label first,
  // then measure its ACTUAL width, and only then assign the row.

  const ZEILEN = 5, ZEILENHOEHE = 20, OBEN = 34, ABSTAND = 8;
  const cy = H - 56;
  const gruppen = sorted.map(m => {
    const cx = x(m.date);
    const g = doc.createElementNS(svgNS, 'g');
    g.classList.add('tl-m');
    g.dataset.mid = m.id;
    g.innerHTML =
      // Der Titel zeigt die volle Angabe, wenn es eine gibt — sonst wiederholte er
      // nur die gekuerzte Beschriftung, die daneben ohnehin steht.
      `<title>${m.detail ?? m.label}</title>` +
      `<line x1="${cx}" y1="0" x2="${cx}" y2="${cy}" stroke="rgba(151,169,202,.28)" stroke-dasharray="2 3"/>` +
      `<circle cx="${cx}" cy="${cy}" r="5" fill="${m.changed_by_omnibus ? '#e1ad58' : '#65d8b2'}"/>` +
      (m.changed_by_omnibus ? `<circle cx="${cx}" cy="${cy}" r="8.5" fill="none" stroke="rgba(225,173,88,.4)"/>` : '') +
      `<text x="${cx}" y="0" fill="#e5eaf3" font-size="10.5" text-anchor="middle">${m.label}</text>`;
    g.addEventListener('click', () => opts.onSelect?.(m));
    svg.appendChild(g);
    return { m, g, cx };
  });

  const legend = doc.createElement('div');
  legend.className = 'legend';
  legend.innerHTML = `<span><i style="background:#65d8b2"></i>Stammfassung</span>` +
    `<span><i style="background:#e1ad58"></i>durch VO 2026/1744 geändert/neu</span>`;
  mount.append(svg, legend);

  // Second pass — only NOW, after insertion into the document: before that,
  // getComputedTextLength() keine belastbare Breite.
  // DOM stubs used in unit tests lack getComputedTextLength, so we estimate.
  const messen = text => {
    let b = 0;
    try { b = text.getComputedTextLength?.() ?? 0; } catch { b = 0; }
    return b || text.textContent.length * 6;
  };

  const belegtBis = new Array(ZEILEN).fill(-Infinity);
  for (const { m, g, cx } of gruppen) {
    const text = g.querySelector('text');
    let breite = messen(text);
    let lane = belegtBis.findIndex(kante => cx - breite / 2 > kante + ABSTAND);
    if (lane === -1) {
      // No free row: take the one ending furthest left and shorten the label until
      // it no longer collides. The full text is not lost — it sits in the <title>
      // and shows up as a tooltip.
      lane = belegtBis.indexOf(Math.min(...belegtBis));
      let txt = String(m.label);
      while (txt.length > 6 && cx - breite / 2 <= belegtBis[lane] + ABSTAND) {
        txt = txt.replace(/[…\s]*.$/, '');
        text.textContent = txt + '…';
        breite = messen(text);
      }
    }
    belegtBis[lane] = cx + breite / 2;
    const ty = OBEN + lane * ZEILENHOEHE;
    text.setAttribute('y', ty);
    g.querySelector('line').setAttribute('y1', ty + 6);
  }
  return svg;
}

// ---------- (c) Anhang-III-Explorer (#45c) ----------

/** areas: [{nr, title, simple, org_relevant, examples:[…], legal_basis}] */
export function renderAnnexExplorer(mount, areas, opts = {}) {
  const doc = mount.ownerDocument;
  const wrap = doc.createElement('div');
  wrap.className = 'annex';
  for (const a of areas) {
    const card = doc.createElement('button');
    card.className = 'annex-item' + (a.org_relevant ? ' rel' : '');
    card.innerHTML = `<span class="annex-nr">${a.nr}</span><span class="annex-t">${a.title}</span>` +
      (a.org_relevant ? '<span class="annex-flag">relevant für dein Profil</span>' : '');
    card.addEventListener('click', () => {
      // Die gewaehlte Kachel war von den uebrigen nicht zu unterscheiden — man
      // sah den Text unten, aber nicht, wo er herkam.
      for (const andere of wrap.querySelectorAll('.annex-item')) andere.classList.remove('gewaehlt');
      card.classList.add('gewaehlt');
      detail.innerHTML = `<h4>Anhang III Nr. ${a.nr} — ${a.title}</h4><p>${a.simple}</p>` +
        // Standard-Aufzaehlung mit runden Punkten war die letzte im Werkzeug.
        (a.examples?.length ? `<ul class="annex-bsp">${a.examples.map(e => `<li>${e}</li>`).join('')}</ul>` : '') +
        `<span class="mono" data-hilfsmittel>${a.legal_basis ?? ''}</span>`;
      opts.onSelect?.(a);
    });
    wrap.appendChild(card);
  }
  const detail = doc.createElement('div');
  detail.className = 'annex-detail card';
  detail.innerHTML = '<p class="dim">Bereich wählen …</p>';
  mount.append(wrap, detail);
  return wrap;
}

// ---------- (d) Art.-25-Rollenweiche (#45c) ----------

/**
 * Decision tree, DOM-free and testable: yes/no questions leading to a provider-switch verdict.
 * steps: [{id, q, yes:'stepId'|'RESULT:…', no:'stepId'|'RESULT:…', legal_basis}]
 */
export function walkRoleSwitch(steps, answers /* Map stepId→bool */) {
  if (!Array.isArray(steps) || steps.length === 0) return { done: false, at: null, path: [], leer: true };
  const byId = new Map(steps.map(s => [s.id, s]));
  let cur = steps[0], path = [];
  while (cur) {
    const a = answers.get(cur.id);
    if (a == null) return { done: false, at: cur.id, path };
    path.push({ step: cur.id, answer: a });
    const nxt = a ? cur.yes : cur.no;
    if (nxt.startsWith('RESULT:')) return { done: true, result: nxt.slice(7), path };
    cur = byId.get(nxt);
  }
  return { done: false, at: null, path };
}

export function renderRoleSwitch(mount, steps, opts = {}) {
  const doc = mount.ownerDocument;
  // Accept a bare array as well as { steps: [...] }, and survive an empty payload.
  // A widget without data used to throw and took the whole unit down with it —
  // the learner saw an almost blank page with no indication of what went wrong.
  const liste = Array.isArray(steps) ? steps : (Array.isArray(steps?.steps) ? steps.steps : []);
  if (liste.length === 0) {
    const hinweis = doc.createElement('p');
    hinweis.className = 'dim';
    hinweis.textContent = 'Für dieses Element liegen noch keine Entscheidungsschritte vor.';
    mount.appendChild(hinweis);
    return null;
  }
  steps = liste;
  const answers = new Map();
  const wrap = doc.createElement('div');
  wrap.className = 'rolesw';
  mount.appendChild(wrap);
  const paint = () => {
    wrap.innerHTML = '';
    const state = walkRoleSwitch(steps, answers);
    for (const p of state.path) {
      const s = steps.find(x => x.id === p.step);
      wrap.appendChild(Object.assign(doc.createElement('div'), {
        className: 'rolesw-step done',
        innerHTML: `<span>${s.q}</span><b>${p.answer ? 'Ja' : 'Nein'}</b>`
      }));
    }
    if (state.done) {
      // Das Ergebnis begann mit fettem Fliesstext, und danach gab es keinen Weg
      // zurueck: Wer den anderen Zweig sehen wollte, musste die Seite neu laden.
      const erg = doc.createElement('div');
      erg.className = 'rolesw-result card';
      erg.innerHTML = `<div class="lage">
          <span class="lage-symbol lage-symbol-info"><svg aria-hidden="true"><use href="assets/icons/sprite.svg#icon-fach-rollen"/></svg></span>
          <div class="lage-txt"><h3>Ergebnis</h3><p>${state.result}</p></div>
        </div>
        <div class="formular-fuss"><button class="btn" data-act="neu">Anderen Weg durchspielen</button></div>`;
      erg.querySelector('[data-act=neu]').addEventListener('click', () => { answers.clear(); paint(); });
      wrap.appendChild(erg);
      opts.onResult?.(state);
    } else if (state.at) {
      const s = steps.find(x => x.id === state.at);
      const step = doc.createElement('div');
      step.className = 'rolesw-step';
      step.innerHTML = `<span>${s.q}</span>`;
      for (const [label, val] of [['Ja', true], ['Nein', false]]) {
        const b = doc.createElement('button');
        b.textContent = label;
        b.addEventListener('click', () => { answers.set(s.id, val); paint(); });
        step.appendChild(b);
      }
      wrap.appendChild(step);
    }
  };
  paint();
  return { wrap, answers };
}

/**
 * Recital explorer: the 40 most exam-relevant recitals, filterable by topic, each with
 * its core statement, its use in argument and a verbatim quotation.
 * data: { erwaegungsgruende: [{nr, thema, competency, kernaussage, einsatz, zitat}] }
 */
export function renderErwgExplorer(mount, data, opts = {}) {
  const list = data.erwaegungsgruende ?? [];
  const themen = [...new Set(list.map(e => e.thema))];
  mount.innerHTML = `<div class="erwg-x">
    <div class="erwg-filter"><button class="chip active" data-t="">Alle (${list.length})</button>${
      themen.map(t => `<button class="chip" data-t="${t}">${t} (${list.filter(e => e.thema === t).length})</button>`).join('')}</div>
    <div class="erwg-list"></div></div>`;
  const box = mount.querySelector('.erwg-list');
  const paint = filter => {
    box.innerHTML = list.filter(e => !filter || e.thema === filter).map(e => `
      <details class="erwg-item">
        <summary><b>ErwG ${e.nr}</b> <span class="dim">${e.thema} · ${e.competency}</span><br>${e.kernaussage}</summary>
        <p class="erwg-einsatz"><b>Einsatz:</b> ${e.einsatz}</p>
        <blockquote class="mono">${e.zitat}</blockquote>
      </details>`).join('');
  };
  paint('');
  mount.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => {
    mount.querySelectorAll('.chip').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    paint(b.dataset.t);
    opts.onFilter?.(b.dataset.t);
  }));
  return list.length;
}
