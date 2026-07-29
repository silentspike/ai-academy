// app/glossary.js — Glossar-Tooltips (Plan #6, #41):
// Technical terms are underlined everywhere; the explanation opens on hover AND click.
// Disabled centrally during closed-book exams via engine-quiz.applyMode → .gloss-off.

let TERMS = new Map();

/** Marks a subtree as an exam in progress; set by engine-quiz.applyMode. */
const GESCHLOSSEN = '[data-quiz-mode="closed_book"]';

const rxEscape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** glossary.json: [{term, aliases:[…], simple, memory_hook, legal_basis}] */
export function loadGlossary(entries) {
  TERMS = new Map();
  for (const e of entries) {
    TERMS.set(e.term.toLowerCase(), e);
    for (const a of e.aliases ?? []) TERMS.set(a.toLowerCase(), e);
  }
  return TERMS.size;
}

/** Marks known terms inside a container (idempotent; skips exam containers). */
export function decorate(root) {
  if (!TERMS.size) return 0;
  const doc = root.ownerDocument;

  // Content may ship hand-written <span class="gloss"> markup. Those carry no
  // data-term and are not focusable, so the tooltip would silently stay empty.
  // Adopt them first — the term is simply what the span says.
  for (const s of root.querySelectorAll('.gloss:not([data-term])')) {
    const wort = (s.textContent || '').trim().toLowerCase();
    if (!TERMS.has(wort)) continue;
    s.dataset.term = wort;
    if (!s.hasAttribute('tabindex')) s.tabIndex = 0;
  }

  // Closed book is applied once when a question renders (engine-quiz.applyMode).
  // Anything decorated afterwards would slip past it and quietly turn a
  // closed-book exam into an open-book one (#13).
  for (const s of root.querySelectorAll('.gloss')) {
    if (!s.closest(GESCHLOSSEN)) continue;
    s.classList.add('gloss-off');
    s.removeAttribute('tabindex');
  }

  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  const pattern = new RegExp(`\\b(${[...TERMS.keys()].map(rxEscape).join('|')})\\b`, 'gi');
  const targets = [];
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (n.parentElement.closest('.gloss, script, style, textarea, [data-no-gloss]')) continue;
    if (pattern.test(n.textContent)) targets.push(n);
    pattern.lastIndex = 0;
  }
  let count = 0;
  for (const n of targets) {
    const frag = doc.createDocumentFragment();
    let last = 0; const text = n.textContent;
    for (const m of text.matchAll(pattern)) {
      frag.appendChild(doc.createTextNode(text.slice(last, m.index)));
      const s = doc.createElement('span');
      s.className = 'gloss';
      s.tabIndex = 0;
      s.dataset.term = m[0].toLowerCase();
      s.textContent = m[0];
      frag.appendChild(s);
      last = m.index + m[0].length;
      count++;
    }
    frag.appendChild(doc.createTextNode(text.slice(last)));
    n.replaceWith(frag);
  }
  return count;
}

/**
 * Keeps a container decorated while it fills up.
 *
 * Routes that fetch their content render asynchronously: a single decorate()
 * right after the route function runs sees an empty container, and everything
 * that arrives afterwards never gets marked up. Watching the subtree covers
 * every render path — synchronous, awaited, or streamed in later.
 */
export function beobachte(root) {
  let laeuft = false;
  const lauf = () => {
    if (laeuft) return;                 // decorate() mutates the tree itself
    laeuft = true;
    try { decorate(root); } finally { laeuft = false; }
  };
  const beobachter = new MutationObserver(() => {
    if (laeuft) return;
    queueMicrotask(lauf);               // batch a burst of insertions into one pass
  });
  beobachter.observe(root, { childList: true, subtree: true });
  lauf();
  return beobachter;
}

/** A single global tooltip; opens on hover AND click or Enter, closes on Escape or blur. */
export function attachTooltip(doc) {
  let tip = doc.querySelector('.gloss-tip');
  if (!tip) {
    tip = doc.createElement('div');
    tip.className = 'gloss-tip';
    tip.hidden = true;
    doc.body.appendChild(tip);
  }
  const show = el => {
    if (el.classList.contains('gloss-off')) return;         // Closed Book (#13)
    // Second line of defence: even if the class were missing, a term inside a
    // running closed-book question must not explain itself. Exam integrity is
    // not something to leave to a single class attribute.
    if (el.closest(GESCHLOSSEN)) return;
    const e = TERMS.get(el.dataset.term);
    if (!e) return;
    // Merkanker und Fundstelle standen ohne Zeichen und ohne Abgrenzung unter der
    // Erklaerung — der Merkanker trug ein Emoji statt eines Zeichens aus dem Satz.
    const sym = id => `<svg class="ut-sym" aria-hidden="true"><use href="assets/icons/sprite.svg#${id}"/></svg>`;
    tip.innerHTML = `<b class="gt-begriff">${e.term}</b><p>${e.simple}</p>` +
      (e.memory_hook ? `<p class="hook">${sym('icon-st-retention')}<span>${e.memory_hook}</span></p>` : '') +
      (e.legal_basis ? `<span class="gt-quelle">${sym('icon-fach-paragraph')}<span class="mono">${e.legal_basis}</span></span>` : '');
    const r = el.getBoundingClientRect();
    tip.style.left = Math.min(r.left, doc.documentElement.clientWidth - 340) + 'px';
    tip.style.top = (r.bottom + 8) + 'px';
    tip.hidden = false;
  };
  const hide = () => { tip.hidden = true; };
  doc.addEventListener('mouseover', ev => { const g = ev.target.closest?.('.gloss'); if (g) show(g); });
  doc.addEventListener('mouseout', ev => { if (ev.target.closest?.('.gloss')) hide(); });
  doc.addEventListener('click', ev => { const g = ev.target.closest?.('.gloss'); g ? show(g) : hide(); });
  doc.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') hide();
    if (ev.key === 'Enter' && ev.target.classList?.contains('gloss')) show(ev.target);
  });
  return tip;
}
