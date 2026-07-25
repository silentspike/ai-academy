// app/selfcheck.js — In-App-Verifikation (Plan §5.6 Stufe 1, v3.2).
// Prüft VOR dem ersten Lernen: Bridge-Verbindung, Frontier-Gate (harte Sperre),
// Mini-Gold-Set (Aussage: „technisch kompatibel", NICHT „Modellqualität gut"),
// Speicher, Latenz. Ergebnis: Ampel + Diagnose-Export (ohne Secrets, T6).

import { isFrontierModel } from './llm-adapter.js';

// Mini-Gold-Set: 1 bekannte Musterantwort mit fixer Soll-Bewertung.
// Der volle Gold-Set-Lauf (50-80 Fälle, Auto-Sperre) ist tools/gold-set-run.mjs (#27a).
const MINI_GOLD = {
  question: 'Ab wann gelten die Hochrisiko-Pflichten (Kap. III Abschn. 1–3) für Anhang-III-KI-Systeme (VO 2024/1689 idF VO 2026/1744)?',
  rubric: '2 Punkte: 2. Dezember 2027 (2P). Anderes Datum: 0P.',
  modelAnswer: 'Ab dem 2. Dezember 2027 (Art. 113 Abs. 3 lit. c i).',
  answer: 'Ab dem 2. Dezember 2027.',
  expect: { verdict: 'korrekt', score: 2 },
};

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

  // 2) Frontier-Gate (harte Sperre summativer Funktionen bei Nicht-Frontier)
  const gate = llm.evaluateGate();
  add('gate', 'Frontier-Gate (Claude/ChatGPT)', gate.frontier ? 'ok' : 'blocked', gate.reason);

  // 3) LLM-Roundtrip + Mini-Gold-Set (nur wenn Gate offen; misst „technisch kompatibel")
  if (gate.frontier) {
    try {
      const t0 = performance.now();
      const { result } = await llm.grade({ kind: 'selfcheck', ...MINI_GOLD });
      const ms = Math.round(performance.now() - t0);
      const schemaOk = result && typeof result.verdict === 'string' && typeof result.score === 'number';
      const goldOk = result.verdict === MINI_GOLD.expect.verdict && result.score === MINI_GOLD.expect.score;
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

// Diagnose-Export (Plan §5.6): Zustand für den Troubleshoot-Agent des Users.
// ENTHÄLT KEINE SECRETS: kein Token, keine Keys, keine Lerninhalte im Klartext.
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
