// app/variants.js — Varianten-Engine (Plan #14b): erzeugt aus Fakten der facts-db
// zusätzliche Übungsfragen per Distraktor-Rotation und Inversion. Läuft komplett in JS
// (beide Produkte, kein LLM). NUR formativ — summative Prüfungen ziehen aus dem
// validierten Pool (#14). Deterministisch über seed → reproduzierbar.
// Reine Logik — kein DOM, in Node testbar.

/** Deterministischer Hash (kein Math.random — Reproduzierbarkeit). */
function h32(str) {
  let x = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619); }
  return x >>> 0;
}
function pick(arr, seed, salt) { return arr[h32(seed + ':' + salt) % arr.length]; }
function shuffle(arr, seed) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = h32(seed + ':' + i) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Fakten-Schema (facts-db.json, ab Task 8 — hier verbindlich definiert):
 * { id, kind:'frist'|'zuordnung'|'definition'|'schwelle', statement, subject,
 *   correct, distractor_pool:[…], invertible:bool, negation?,
 *   competency, level, legal_basis:[claims], legal_status }
 */

/**
 * Erzeugt bis zu `count` Varianten aus EINEM Faktensatz.
 * Jede Variante: MC-Frage mit rotierten Distraktoren; bei invertible zusätzlich
 * die invertierte Form („Welche Aussage ist FALSCH?" — als Fangfrage gekennzeichnet, #13).
 */
export function generateVariants(fact, { count = 4, optionCount = 4, seedBase = 'v1' } = {}) {
  if (!fact?.id || fact.correct == null || !Array.isArray(fact.distractor_pool)) {
    throw new Error('variants: Faktensatz unvollständig (id/correct/distractor_pool)');
  }
  if (fact.distractor_pool.length < optionCount - 1) {
    throw new Error(`variants: distractor_pool zu klein (${fact.distractor_pool.length} < ${optionCount - 1})`);
  }
  const out = [];
  let rotations = 0, inversions = 0;
  for (let v = 0; out.length < count && v < count * 3; v++) {
    const seed = `${seedBase}:${fact.id}:${v}`;
    const wantInvert = fact.invertible && fact.negation && (v % 3 === 2); // jede 3. Variante invertiert
    if (wantInvert) {
      // Inversion: 3 richtige Aussagen + die Negation als gesuchte falsche
      const truths = shuffle(fact.distractor_truths ?? fact.distractor_pool, seed)
        .slice(0, optionCount - 1)
        .map((t, i) => ({ id: `t${i}`, text: t.truth ?? t, correct: false }));
      out.push(finalize(fact, seed, {
        type: 'mc',
        prompt: fact.prompt_inverted ?? `Welche Aussage zu ${fact.subject} ist NICHT korrekt?`,
        options: shuffle([...truths, { id: 'neg', text: fact.negation, correct: true }], seed + ':o'),
        trap: { is_trap: true, note: 'Invertierte Frage: Gesucht ist die FALSCHE Aussage.' }
      }));
      inversions++;
    } else {
      // Distraktor-Rotation: correct + (optionCount-1) rotierte Distraktoren
      const ds = shuffle(fact.distractor_pool, seed).slice(0, optionCount - 1)
        .map((d, i) => ({ id: `d${i}`, text: d.text ?? d, correct: false, rationale: d.rationale }));
      out.push(finalize(fact, seed, {
        type: 'mc',
        prompt: fact.prompt ?? `${fact.statement} — was gilt?`,
        options: shuffle([...ds, { id: 'c', text: fact.correct, correct: true }], seed + ':o'),
        trap: { is_trap: false }
      }));
      rotations++;
    }
  }
  // Dedup über Options-Signatur (Rotation kann bei kleinem Pool kollidieren)
  const seen = new Set();
  const unique = out.filter(q => {
    const sig = q.options.map(o => o.text).sort().join('|') + '§' + q.prompt;
    if (seen.has(sig)) return false;
    seen.add(sig); return true;
  });
  return { variants: unique, stats: { rotations, inversions, unique: unique.length } };
}

function finalize(fact, seed, q) {
  return {
    id: `var-${h32(seed).toString(36)}`,
    variant_of: fact.id,
    status: 'agent_generated',            // Varianten sind NIE approved_summative (#14/#15)
    competency: fact.competency, level: fact.level,
    legal_basis: fact.legal_basis, legal_status: fact.legal_status,
    ...q
  };
}

/** Validierung einer Variante (CI-/Test-Helfer): genau 1 richtige Option, keine Duplikate. */
export function validateVariant(q) {
  const errs = [];
  if (!q.options?.length || q.options.length < 3) errs.push('zu wenige Optionen');
  const correct = (q.options ?? []).filter(o => o.correct);
  if (correct.length !== 1) errs.push(`erwartet genau 1 richtige Option, gefunden ${correct.length}`);
  const texts = new Set((q.options ?? []).map(o => o.text));
  if (texts.size !== (q.options ?? []).length) errs.push('doppelte Optionstexte');
  if (!q.competency) errs.push('competency fehlt');
  if (!q.legal_basis) errs.push('legal_basis fehlt');
  if (q.status === 'approved_summative') errs.push('Variante darf nie summativ freigegeben sein');
  return { ok: errs.length === 0, errors: errs };
}
