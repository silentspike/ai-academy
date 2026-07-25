// app/engine-widgets.js — Interaktive Widgets (Plan #45):
// (a) Drag&Drop-Zuordnung (Risikopyramide befüllen, Artikel↔Kapitel, Pflichten↔Rollen)
// (b) Fristen-Timeline 2024–2031 auf Omnibus-Stand (Daten aus legal/fristen-uebergangsmatrix)
// (c) Anhang-III-Explorer  (d) Art.-25-Rollenweiche
// Prüf-Logik DOM-frei; Rendering getrennt. Kein externes Framework.

// ---------- (a) Drag&Drop-Zuordnung ----------

/**
 * Aufgaben-Schema: { id, title, zones:[{id,label,hint}], items:[{id,text,zone}] , competency, level }
 * gradeAssignment ist DOM-frei (AC1-testbar).
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
 * milestones: aus legal/fristen-uebergangsmatrix.json (g1–g9 + u1–u5) —
 * [{id, date:'YYYY-MM-DD', label, detail, kind:'geltung'|'uebergang', changed_by_omnibus:bool}]
 */
export function renderTimeline(mount, milestones, opts = {}) {
  const doc = mount.ownerDocument;
  const from = Date.parse(opts.from ?? '2024-06-01');
  const to = Date.parse(opts.to ?? '2031-03-01');
  const W = opts.width ?? 900, H = 190, PAD = 40;
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
  let lane = 0;
  for (const m of sorted) {
    const cx = x(m.date), cy = H - 56, ty = 44 + (lane++ % 3) * 26;
    const g = doc.createElementNS(svgNS, 'g');
    g.classList.add('tl-m');
    g.dataset.mid = m.id;
    g.innerHTML =
      `<line x1="${cx}" y1="${ty + 6}" x2="${cx}" y2="${cy}" stroke="rgba(151,169,202,.28)" stroke-dasharray="2 3"/>` +
      `<circle cx="${cx}" cy="${cy}" r="5" fill="${m.changed_by_omnibus ? '#e1ad58' : '#65d8b2'}"/>` +
      (m.changed_by_omnibus ? `<circle cx="${cx}" cy="${cy}" r="8.5" fill="none" stroke="rgba(225,173,88,.4)"/>` : '') +
      `<text x="${cx}" y="${ty}" fill="#e5eaf3" font-size="10.5" text-anchor="middle">${m.label}</text>`;
    g.addEventListener('click', () => opts.onSelect?.(m));
    svg.appendChild(g);
  }
  const legend = doc.createElement('div');
  legend.className = 'legend';
  legend.innerHTML = `<span><i style="background:#65d8b2"></i>Stammfassung</span>` +
    `<span><i style="background:#e1ad58"></i>durch VO 2026/1744 geändert/neu</span>`;
  mount.append(svg, legend);
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
      detail.innerHTML = `<h4>Anhang III Nr. ${a.nr} — ${a.title}</h4><p>${a.simple}</p>` +
        (a.examples?.length ? `<ul>${a.examples.map(e => `<li>${e}</li>`).join('')}</ul>` : '') +
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
 * Entscheidungsbaum DOM-frei (testbar): Fragen mit ja/nein → Ergebnis Anbieter-Kipp ja/nein.
 * steps: [{id, q, yes:'stepId'|'RESULT:…', no:'stepId'|'RESULT:…', legal_basis}]
 */
export function walkRoleSwitch(steps, answers /* Map stepId→bool */) {
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
      wrap.appendChild(Object.assign(doc.createElement('div'), {
        className: 'rolesw-result card',
        innerHTML: `<b>Ergebnis:</b> ${state.result}`
      }));
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
 * ErwG-Explorer (Plan #4, Phase 10): die 40 prüfungsrelevantesten Erwägungsgründe
 * filterbar nach Thema — Kernaussage, Einsatzzweck und Amtsblatt-Zitat je Eintrag.
 * data: { erwaegungsgruende: [{nr, thema, competency, kernaussage, einsatz, zitat}] }
 */
export function renderErwgExplorer(mount, data, opts = {}) {
  const doc = mount.ownerDocument;
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
