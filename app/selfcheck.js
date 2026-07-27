// app/selfcheck.js — In-App-Verifikation (Plan §5.6 Stufe 1, v3.2).
// Checks BEFORE the first learning session: bridge connection, frontier gate (hard lock),
// a miniature calibration probe (which says "technically compatible", NOT "good model"),
// storage and latency. Result: a traffic light plus a diagnostic export without secrets (T6).

import { isFrontierModel } from './llm-adapter.js';

// Miniature calibration: one known reference answer with a fixed expected score.
// The full calibration run (50-80 cases, automatic lock) is tools/gold-set-run.mjs.
//
// Frage, Rubrik und Musterantwort kommen aus dem geprüften Inhalt, nicht von hier.
// Sie standen als Literale in dieser Datei — mit Datum und Fundstelle („2. Dezember
// 2027, Art. 113 Abs. 3 lit. c i"). Damit lag eine Rechtsaussage außerhalb des
// Quellenregisters: `legal-audit` hätte nach der nächsten Rechtsänderung „alle
// Objekte aktualisiert" gemeldet, während ausgerechnet die Ansicht, die neuen
// Nutzern grünes Licht gibt, ein überholtes Datum behauptet (§4.1 #9).
async function ladeMiniGold(fetchImpl = fetch) {
  const j = await (await fetchImpl('content/selfcheck.json')).json();
  const m = j?.mini_gold;
  if (!m?.question) throw new Error('Mini-Gold-Fall fehlt in content/selfcheck.json');
  return { question: m.question, rubric: m.rubric, modelAnswer: m.model_answer, answer: m.answer, expect: m.expect };
}

export async function runSelfCheck({ llm, storage }) {
  const checks = [];
  const add = (id, label, status, detail) => { checks.push({ id, label, status, detail }); return status; };

  // 1) Bridge-Verbindung
  let health = null;
  try {
    health = await llm.refreshHealth();
    add('bridge', 'Bridge-Verbindung', 'ok', `${health.name} · Prompts ${health.promptsVersion}`);
  } catch (e) {
    add('bridge', 'Bridge-Verbindung', 'fail', String(e.message));
    return finish(checks, llm);
  }

  // 2) frontier gate (hard lock on summative functions for unsupported models)
  const gate = llm.evaluateGate();
  add('gate', 'Frontier-Gate (Claude/ChatGPT)', gate.frontier ? 'ok' : 'blocked', gate.reason);

  // 3) model round trip plus the miniature calibration (only when the gate is open)
  if (gate.frontier) {
    try {
      const mini = await ladeMiniGold();
      const t0 = performance.now();
      const { result } = await llm.grade({ kind: 'selfcheck', ...mini });
      const ms = Math.round(performance.now() - t0);
      const schemaOk = result && typeof result.verdict === 'string' && typeof result.score === 'number';
      const goldOk = result.verdict === mini.expect.verdict && result.score === mini.expect.score;
      add('roundtrip', 'Probe-Bewertung (Mini-Gold-Set)',
        schemaOk && goldOk ? 'ok' : schemaOk ? 'warn' : 'fail',
        schemaOk
          ? `technisch kompatibel · ${result.verdict} ${result.score}/${result.max} · ${ms} ms` + (goldOk ? '' : ' · Soll-Abweichung!')
          : 'Antwort entspricht nicht dem JSON-Schema');
      add('latency', 'Latenz', ms < 60000 ? 'ok' : 'warn', ms + ' ms für eine Bewertung');
    } catch (e) {
      add('roundtrip', 'Probe-Bewertung (Mini-Gold-Set)', 'fail', String(e.message));
    }
  } else {
    add('roundtrip', 'Probe-Bewertung', 'skipped', 'übersprungen — Gate geschlossen');
  }

  // 4) Speicher-Roundtrip
  try {
    const probe = { t: Date.now() };
    await storage.set('selfcheck-probe', probe);
    const back = await storage.get('selfcheck-probe', null);
    add('storage', 'Speicher (Lernstand)', back && back.t === probe.t ? 'ok' : 'fail', back ? 'Schreiben/Lesen bestätigt' : 'Rücklesen fehlgeschlagen');
  } catch (e) { add('storage', 'Speicher (Lernstand)', 'fail', String(e.message)); }

  return finish(checks, llm);
}

function finish(checks, llm) {
  const worst = checks.some(c => c.status === 'fail') ? 'fail'
    : checks.some(c => c.status === 'blocked') ? 'blocked'
    : checks.some(c => c.status === 'warn') ? 'warn' : 'ok';
  return {
    ampel: worst,                                  // ok=grün, warn=gelb, blocked/fail=rot
    summativeAllowed: llm.summativeAllowed,
    checks,
    ranAt: new Date().toISOString(),
  };
}

// Diagnostic export: state for the user's troubleshooting agent.
// CONTAINS NO SECRETS: no token, no keys, no learning content in clear text.
export function buildDiagnoseExport({ selfCheckResult, health }) {
  return {
    kind: 'ai-act-akademie-diagnose',
    createdAt: new Date().toISOString(),
    app: { promptsVersion: health?.promptsVersion || null },
    llm: { activeCli: health?.activeCli || null, model: health?.model || null, frontier: health ? isFrontierModel(health.model) : null },
    selfCheck: selfCheckResult ? { ampel: selfCheckResult.ampel, checks: selfCheckResult.checks.map(c => ({ id: c.id, status: c.status, detail: String(c.detail).slice(0, 200) })) } : null,
    userAgent: navigator.userAgent,
  };
}
