// app/dashboard.js
//
// Every renderer here REPLACES the contents of its mount. They used to append,
// which was invisible as long as each chart was drawn exactly once per route
// change — and produced a chart with two overlapping data sets the moment
// anything redrew in place, such as the curve's time-range selector. — Dashboard-Cockpit (Plan #44): Artikel-Heatmap (klickbar),
// Competency radar with levels A/B/C, progress against target, due counts for core and
// catch-up queues, weekly points history, exam history as first/latest/best per score
// series. Hand-built SVG in the glow style; layout follows the approved design preview.

const SVGNS = 'http://www.w3.org/2000/svg';
const HEAT_SHADES = {
  0: [['#6fdcb8', '#3fa981'], ['#5ecfa9', '#379a74']],
  1: [['#a9cfa4', '#7ba377'], ['#9cc79a', '#6f976e']],
  2: [['#e6b869', '#b98e42'], ['#dcae5e', '#ad8339']],
  3: [['#dd8578', '#b05a4e'], ['#d47b6f', '#a55248']],
  4: [['#4a5160', '#343a46'], ['#434a58', '#2f3540']]
};
const h = (x, y, s) => ((x * 73856093 ^ y * 19349663 ^ s * 83492791) >>> 0) % 1000 / 1000;

/**
 * Article heat map as a sector mosaic: articles = [{id, label, score:0..1|null, unit_id}]
 * score→Stufe: ≥.85 sehr sicher(0) · ≥.65(1) · ≥.4(2) · <.4 kritisch(3) · null ungelernt(4).
 * Clicking a cell calls onSelect(article), which navigates to the unit.
 */
export function renderHeatmap(mount, articles, opts = {}) {
  const doc = mount.ownerDocument;
  const wrap = doc.createElement('div');
  wrap.className = 'hm-groups';
  const stufe = a => a.score == null ? 4 : a.score >= .85 ? 0 : a.score >= .65 ? 1 : a.score >= .4 ? 2 : 3;
  // Order: green → safe → amber → red → grey, so the zones blend as in the reference
  const sorted = [...articles].sort((a, b) => stufe(a) - stufe(b));
  const COLS = 27, ROWS = 11, CB = [5, 9, 14, 19, 23], RB = [4, 8];
  const occ = Array.from({ length: ROWS }, () => new Array(COLS).fill(false));
  let i = 0;
  for (let r = 0; r < ROWS && i < sorted.length; r++) for (let c = 0; c < COLS && i < sorted.length; c++) {
    if (occ[r][c]) continue;
    if (h(c, r, 1) < .04 + (h(c >> 1, r >> 1, 7) < .07 ? .62 : 0)) { occ[r][c] = true; continue; }
    const a = sorted[i++];
    const st = stufe(a);
    const [g1, g2] = HEAT_SHADES[st][Math.floor(h(c, r, 2) * 2)];
    let w = 1;
    // more double cells than in the preview: 133 articles should fill the area
    if (h(c, r, 3) < .55 && c + 1 < COLS && !occ[r][c + 1] && !CB.includes(c + 1)) w = 2;
    for (let x = c; x < c + w; x++) occ[r][x] = true;
    const gc = c + CB.filter(b => c >= b).length + 1, gr = r + RB.filter(b => r >= b).length + 1;
    const cell = doc.createElement('i');
    cell.style.cssText = `grid-area:${gr}/${gc}/span 1/span ${w};cursor:pointer;` +
      `background:linear-gradient(145deg,rgba(255,255,255,.08),transparent 38%),linear-gradient(180deg,${g1},${g2})`;
    cell.title = `${a.label} — ${['sehr sicher', 'sicher', 'unsicher', 'kritisch', 'ungelernt'][st]}`;
    cell.addEventListener('click', () => opts.onSelect?.(a));
    wrap.appendChild(cell);
  }
  mount.replaceChildren(wrap);
  return wrap;
}

/** Kompetenz-Radar (Gate-2a-Stil: gestaffelte Ringe, Soll-Kontur, Glow+Linie+Halo). axes: radarData(). */
export function renderRadar(mount, axes, opts = {}) {
  const doc = mount.ownerDocument;
  const W = 320, H = 262, cx = 160, cy = 135, R = 94;
  const n = axes.length;
  const pt = (i, v) => {
    const ang = -Math.PI / 2 + i * 2 * Math.PI / n;
    return [cx + Math.cos(ang) * R * v, cy + Math.sin(ang) * R * v];
  };
  const ring = v => Array.from({ length: n }, (_, i) => pt(i, v).map(x => x.toFixed(1)).join(',')).join(' ');
  const profile = ring(1) && axes.map((a, i) => pt(i, Math.max(.12, a.value)).map(x => x.toFixed(1)).join(',')).join(' ');
  const soll = axes.map((a, i) => pt(i, opts.target?.[i] ?? .9).map(x => x.toFixed(1)).join(',')).join(' ');
  const svg = doc.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = `
    <defs>
      <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#a9f5dc" stop-opacity=".30"/><stop offset=".55" stop-color="#65d8b2" stop-opacity=".14"/>
        <stop offset="1" stop-color="#1d5c46" stop-opacity=".10"/></linearGradient>
      <linearGradient id="rs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a5ecd2"/><stop offset="1" stop-color="#41a87e"/></linearGradient>
      <filter id="soft"><feGaussianBlur stdDeviation="4"/></filter>
    </defs>
    <g fill="none" stroke-width="1">
      <polygon points="${ring(1)}" stroke="rgba(151,169,202,.09)"/>
      <polygon points="${ring(.85)}" stroke="rgba(151,169,202,.06)"/>
      <polygon points="${ring(.7)}" stroke="rgba(151,169,202,.13)"/>
      <polygon points="${ring(.45)}" stroke="rgba(151,169,202,.10)"/>
      <polygon points="${ring(.22)}" stroke="rgba(151,169,202,.07)"/>
    </g>
    <polygon points="${soll}" fill="none" stroke="rgba(170,186,214,.42)" stroke-dasharray="3 4" stroke-width="1.1"/>
    <polygon points="${profile}" fill="url(#rg)"/>
    <polygon points="${profile}" fill="none" stroke="#65d8b2" stroke-width="7" opacity=".15" filter="url(#soft)"/>
    <polygon points="${profile}" fill="none" stroke="url(#rs)" stroke-width="1.5"/>
    ${axes.map((a, i) => { const [x, y] = pt(i, Math.max(.12, a.value)); return `<circle cx="${x}" cy="${y}" r="5.5" fill="rgba(101,216,178,.18)"/><circle cx="${x}" cy="${y}" r="2.1" fill="#dcfcee"/>`; }).join('')}
    ${axes.map((a, i) => { const [x, y] = pt(i, 1.24); return `<text x="${x}" y="${Math.max(12, Math.min(H - 4, y + 3))}" font-family="Inter" font-size="10.5" fill="rgba(218,226,240,.68)" text-anchor="middle">${a.label}</text>`; }).join('')}`;
  svg.addEventListener('click', ev => {
    const t = ev.target.closest('text'); if (!t) return;
    const ax = axes.find(a => a.label === t.textContent);
    if (ax) opts.onSelect?.(ax);
  });
  mount.replaceChildren(svg);
  return svg;
}

/** Progress against target: points and targets as {label, value 0..1}[]; badge on the last actual value. */
export function renderCurve(mount, points, targets) {
  const doc = mount.ownerDocument;
  const W = 620, H = 208, X0 = 58, XW = 528, Y = v => 192 - v * 180;
  const x = i => X0 + i * (XW / Math.max(1, points.length - 1));
  const path = pts => pts.map((p, i) => {
    if (i === 0) return `M${x(0)} ${Y(p.value).toFixed(1)}`;
    const px = x(i - 1), cx1 = px + (x(i) - px) / 2;
    return `C${cx1} ${Y(pts[i - 1].value).toFixed(1)} ${cx1} ${Y(p.value).toFixed(1)} ${x(i)} ${Y(p.value).toFixed(1)}`;
  }).join(' ');
  const li = points.length - 1, lx = x(li), ly = Y(points[li].value);
  const svg = doc.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.innerHTML = `
    <defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5dd3ae" stop-opacity=".16"/><stop offset=".7" stop-color="#5dd3ae" stop-opacity=".03"/>
      <stop offset="1" stop-color="#5dd3ae" stop-opacity="0"/></linearGradient>
      <filter id="cs"><feGaussianBlur stdDeviation="2"/></filter></defs>
    <g stroke="rgba(151,169,202,.07)">${[12, 57, 102, 147].map(y => `<line x1="44" y1="${y}" x2="608" y2="${y}"/>`).join('')}</g>
    <g font-family="Inter" font-size="10" fill="rgba(218,226,240,.5)">
      <text x="6" y="16">100%</text><text x="12" y="61">75%</text><text x="12" y="106">50%</text><text x="12" y="151">25%</text><text x="18" y="196">0%</text>
      ${points.map((p, i) => `<text x="${x(i) - 8}" y="205">${p.label}</text>`).join('')}</g>
    <line x1="44" y1="192" x2="608" y2="192" stroke="rgba(151,169,202,.16)"/>
    <path d="${path(targets)}" stroke="rgba(170,186,214,.34)" stroke-width="1.1" stroke-dasharray="3 4" fill="none"/>
    <path d="${path(points)} L${lx} 192 L${x(0)} 192 Z" fill="url(#lg)"/>
    <path d="${path(points)}" stroke="#65d8b2" stroke-width="3.2" opacity=".2" fill="none" filter="url(#cs)"/>
    <path d="${path(points)}" stroke="#6cd9b6" stroke-width="1.4" fill="none"/>
    ${points.slice(0, -1).map((p, i) => `<circle cx="${x(i)}" cy="${Y(p.value)}" r="2.5" fill="#0a0f18" stroke="#6cd9b6" stroke-width="1.3"/>`).join('')}
    <circle cx="${lx}" cy="${ly}" r="4.2" fill="#6cd9b6" opacity=".22" filter="url(#cs)"/>
    <circle cx="${lx}" cy="${ly}" r="2.9" fill="#6cd9b6"/>
    <g><rect x="${lx - 28}" y="${ly - 28}" rx="7" width="46" height="22" fill="rgba(31,38,53,.85)" stroke="rgba(151,169,202,.25)"/>
    <text x="${lx - 5}" y="${ly - 13}" font-family="Poppins" font-size="12" font-weight="600" fill="#6cd9b6" text-anchor="middle">${Math.round(points[li].value * 100)}%</text></g>`;
  mount.replaceChildren(svg);
  return svg;
}

/** Weekly points history as glow bars. weeks: [{label, xp}] */
export function renderXpBars(mount, weeks) {
  const doc = mount.ownerDocument;
  const W = 320, H = 120, max = Math.max(...weeks.map(w => w.xp), 1);
  const bw = Math.min(34, (W - 40) / weeks.length - 8);
  const svg = doc.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = `<defs><linearGradient id="xb" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#b6a5ff"/><stop offset="1" stop-color="#5b4bb0"/></linearGradient></defs>` +
    weeks.map((w, i) => {
      const bh = Math.max(3, w.xp / max * 82), bx = 24 + i * ((W - 40) / weeks.length), by = 96 - bh;
      return `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="4" fill="url(#xb)" opacity=".85"/>
        <rect x="${bx}" y="${by}" width="${bw}" height="2.5" rx="1" fill="#cfc3ff"/>
        <text x="${bx + bw / 2}" y="110" font-family="Inter" font-size="9" fill="rgba(218,226,240,.5)" text-anchor="middle">${w.label}</text>`;
    }).join('');
  mount.replaceChildren(svg);
  return svg;
}

/** Examens-Historie first/latest/best — strikt PRO Score-Serie (#17, Serien nie mischen). */
export function renderExamHistory(mount, series) {
  const doc = mount.ownerDocument;
  const wrap = doc.createElement('div');
  wrap.className = 'exam-history';
  for (const s of series) {
    const scores = s.attempts.map(a => a.score);
    const row = doc.createElement('div');
    row.className = 'exam-serie';
    row.innerHTML = `<div class="exam-serie-head"><span class="mono">${s.regime}</span>${s.note ? `<span class="exam-break">⚠ ${s.note}</span>` : ''}</div>
      <div class="exam-triple">
        <div><span>first</span><b>${scores[0] ?? '—'}%</b></div>
        <div><span>latest</span><b>${scores[scores.length - 1] ?? '—'}%</b></div>
        <div><span>best</span><b>${scores.length ? Math.max(...scores) : '—'}%</b></div>
      </div>`;
    wrap.appendChild(row);
  }
  mount.replaceChildren(wrap);
  return wrap;
}
