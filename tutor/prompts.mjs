// tutor/prompts.mjs — prompt builders for AI-Academy.
//
// ARCHITECTURAL RULE (threat model T4): separate builders enforce the isolation
// rule as code structure. The summative builder ACCEPTS no notes, no history and
// no free text from the profile — there is simply no parameter for it. Formative
// builders may personalise.
//
// SOURCE GROUNDING: legal explanations return claims[] with source_ids[]; the
// application and bridge validate them against the source package. The model is
// never a legal source (rank 8 of the hierarchy, docs/REVIEW-PROCESS.md).

export const PROMPTS_VERSION = '1.2.0';

const JSON_ONLY =
  'Antworte AUSSCHLIESSLICH mit einem einzigen validen JSON-Objekt. ' +
  'Kein Markdown, keine Code-Fences, kein Text davor oder danach.';

const GRADING_SCHEMA = `{
  "verdict": "korrekt" | "teilweise" | "falsch",
  "score": <Zahl, vergebene Punkte>,
  "max": <Zahl, erreichbare Punkte>,
  "rubric_points": [ { "criterion": "<Rubrik-Kriterium>", "awarded": <Zahl>, "of": <Zahl>, "reason": "<1 Satz>" } ],
  "critical_error": <true|false, NUR wenn ein als fatal definierter Fehler der Rubrik vorliegt>,
  "feedback": "<2-5 Sätze, konkret, auf die Antwort bezogen>",
  "claims": [ { "text": "<rechtliche Aussage im Feedback>", "source_ids": ["<z.B. art-6-abs-3>"] } ],
  "uncertainties": [ "<offene Auslegungsfragen, falls vorhanden>" ]
}`;

export const PRUEFER_SYSTEM =
  'Du bist ein strenger, fairer Prüfer für den EU AI Act (VO (EU) 2024/1689 in der Fassung ' +
  'der VO (EU) 2026/1744, Zielrechtsstand 27.7.2026). Du bewertest ausschließlich anhand der ' +
  'mitgelieferten Rubrik und Musterlösung. Keine Hinweise, keine Nachsicht, aber Teilpunkte ' +
  'exakt nach Rubrik. Bewertungsdisziplin (kalibriert am Gold-Set, v1.1.4): ' +
  '(1) SUBSTANZ vor Stil — bewertet wird, ob die Rubrik-Kriterien inhaltlich erfüllt sind; ' +
  'Telegramm-/Stichwortstil, Abkürzungen und komprimierte Juristensprache kosten KEINE Punkte, ' +
  'solange Subsumtion und Fundstellen stimmen. Länge ist kein Qualitätsmaß. ' +
  '(2) Jedes Rubrik-Kriterium einzeln und MECHANISCH: Ein Kriterium ist voll erfüllt, wenn alle ' +
  'in seinem Wortlaut benannten Elemente in der Antwort erkennbar und inhaltlich richtig adressiert ' +
  'sind — mehr Ausführungstiefe, als die Rubrik ausdrücklich verlangt, darfst du NICHT fordern ' +
  '(ein Kriterium „X subsumiert (A+B+C)“ ist erfüllt, wenn A, B, C korrekt auf den Fall bezogen ' +
  'genannt sind, auch im Stichwortstil). Erkennbar adressiert mit fehlendem Element oder Fehler = ' +
  'hälftig, nicht adressiert = 0. NULL Punkte NUR, wenn das Thema des Kriteriums in der Antwort ' +
  'überhaupt nicht vorkommt — kommt es mit richtigem Kern-Ergebnis vor, aber ohne die benannten ' +
  'Elemente, ist es hälftig, nie null. Zweifelsregel: Sind alle benannten Elemente vorhanden, vergib den ' +
  'HÖHEREN Punktestand. Keine Pauschalabzüge außerhalb der Rubrik. ' +
  '(3) Verdict STRIKT aus der Punktquote: korrekt ≥ 0.8 · teilweise 0.4–0.79 · falsch < 0.4. ' +
  '(4) critical_error NUR bei diesen fünf definierten fatalen Fehlern (docs/CRITICAL-ERRORS.md): ' +
  'CE1 verbotene Praxis als ZULÄSSIG eingestuft · CE2 eindeutiges Hochrisiko-System als pflichtenfrei ' +
  'eingestuft · CE3 FRIA-Pflicht verneint wo sie eindeutig greift · CE4 Art. 4a als Pauschal-Erlaubnis ' +
  'behandelt · CE5 geltendes Verbot wegen Terminverwechslung für noch-nicht-anwendbar erklärt. ' +
  'NIEMALS critical_error für: bloße Unvollständigkeit, falsche ÜBERSTRENGE (das Recht strenger ' +
  'darstellen als es ist — das kostet Punkte, ist aber nie fatal), Stilmängel oder Fundstellenfehler. ' +
  'Zusätzliche Eingrenzung (v3.2): critical_error setzt einen KONKRETEN Fall-Sachverhalt in der ' +
  'Aufgabe voraus (System/Praxis mit vollständigen Fakten), dessen Rechtsfolge fatal falsch erklärt ' +
  'wird. Bei abstrakten Wissens-, Zusammenfassungs- oder Überblicksfragen ohne Fallbezug ist auch ' +
  'eine grob falsche Aussage (z. B. Fristen-Totalirrtum) KEIN critical_error, sondern 0 Punkte. ' +
  'Rechtliche Aussagen in deinem Feedback stützt du NUR auf die ' +
  'mitgelieferten Quellen und listest sie als claims mit source_ids. ' + JSON_ONLY;

export const COACH_SYSTEM =
  'Du bist ein sokratischer Lern-Coach für den EU AI Act (Zielrechtsstand 27.7.2026: ' +
  'VO 2024/1689 idF VO 2026/1744). Du gibst Hinweise statt Lösungen, lobst konkret, ' +
  'stellst Rückfragen und nutzt IT-Analogien, wenn das Profil sie vorsieht. ' +
  'Rechtliche Aussagen stützt du NUR auf die mitgelieferten Quellen (claims + source_ids); ' +
  'bist du unsicher, sag es ausdrücklich. Ton: präzise, trocken-freundlich, nie überschwänglich.';

// ---------------------------------------------------------------------------
// SUMMATIVE — deliberately minimal signature. Do NOT add further parameters.
// ---------------------------------------------------------------------------
export function buildSummativeGradingPrompt({ question, rubric, modelAnswer, answer, sources }) {
  for (const [k, v] of Object.entries({ question, rubric, answer })) {
    if (typeof v !== 'string' || !v.trim()) throw new Error(`summative prompt: '${k}' fehlt`);
  }
  return [
    '## Prüfungsaufgabe',
    question.trim(),
    '',
    '## Bewertungsrubrik (bindend)',
    rubric.trim(),
    modelAnswer ? `\n## Musterlösung (Referenz)\n${modelAnswer.trim()}` : '',
    sources ? `\n## Quellenpaket (einzige zulässige Rechtsgrundlage)\n${sources.trim()}` : '',
    '',
    '## Antwort des Prüflings',
    answer.trim(),
    '',
    '## Ausgabeformat',
    GRADING_SCHEMA,
  ].join('\n');
}

// Appeal: a FRESH second assessor that does NOT see the first assessment.
export function buildAppealPrompt({ question, rubric, modelAnswer, answer, appealReason, sources }) {
  const base = buildSummativeGradingPrompt({ question, rubric, modelAnswer, answer, sources });
  return base.replace(
    '## Ausgabeformat',
    `## Einspruch des Prüflings (nur als Prüfanlass, NICHT als Bewertungsvorgabe)\n${String(appealReason || '').trim()}\n\n## Ausgabeformat`
  );
}

// ---------------------------------------------------------------------------
// FORMATIVE — personalisation allowed (notes, journal, profile).
// ---------------------------------------------------------------------------
/**
 * The coach answers in structure, not prose.
 *
 * COACH_SYSTEM has demanded "claims mit source_ids" from the beginning — but the
 * answer had no shape to put them in, so the bridge returned bare text and the
 * claims were never sent, let alone checked. A requirement without a slot to
 * fulfil it is a requirement nobody can fail.
 */
const COACH_SCHEMA = `{
  "feedback": "<der sokratische Hinweis, 2-3 Sätze>",
  "claims": [ { "text": "<rechtliche Aussage im Hinweis>", "source_ids": ["<z.B. art-6-abs-3>"] } ],
  "uncertainties": [ "<offene Auslegungsfragen, falls vorhanden>" ]
}`;

export function buildCoachPrompt({ topic, unitContext, userMessage, notes, journal, profileHints, sources }) {
  return [
    topic ? `## Thema\n${topic}` : '',
    unitContext ? `## Einheiten-Kontext\n${unitContext}` : '',
    journal ? `## Lernjournal (bisherige Sitzungen, Kurzfassung)\n${journal}` : '',
    notes ? `## Notizen des Lernenden\n${notes}` : '',
    profileHints ? `## Profil-Hinweise\n${profileHints}` : '',
    sources ? `## Quellenpaket\n${sources}` : '',
    `## Nachricht des Lernenden\n${String(userMessage || '').trim()}`,
    `## Ausgabeformat\n${COACH_SCHEMA}\nAntworte AUSSCHLIESSLICH mit diesem JSON, ohne Text davor oder danach.`,
  ].filter(Boolean).join('\n\n');
}

/** Render objects and arrays readably into the prompt. A persona card used to arrive as "[object Object]". */
export function asText(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(x => '- ' + asText(x)).join('\n');
  return Object.entries(v).filter(([, val]) => val != null && val !== '')
    .map(([k, val]) => `${k}: ${typeof val === 'object' ? JSON.stringify(val) : val}`).join('\n');
}

export function buildBossPersonaPrompt({ personaCard, revealedFacts, conversationPhase, userTurn }) {
  return [
    '## Deine Rolle (spiele sie konsequent; du bist NICHT der Coach und gibst keine Rechtsauskünfte aus eigenem Wissen)',
    asText(personaCard),
    '## Dir bekannter Sachverhalt (NUR diese Fakten existieren — erfinde keine weiteren rechtserheblichen Tatsachen)',
    asText(revealedFacts),
    `## Gesprächsphase\n${conversationPhase}`,
    `## Letzte Äußerung deines Gegenübers\n${String(userTurn || '').trim()}`,
    '## Ausgabeformat',
    '{ "say": "<deine Antwort in der Rolle, 1-4 Sätze>", "pressure_point": "<welchen Prüfaspekt du gerade testest>" }',
  ].join('\n\n');
}

export function buildGeneratePrompt({ blueprint, factsSlice, count }) {
  return [
    '## Aufgabe: Erzeuge Übungsfragen nach Blueprint (NUR formative Nutzung)',
    `Anzahl: ${count || 3}`,
    '## Blueprint (bindend)',
    blueprint,
    '## Fakten-Grundlage (einzige zulässige Quelle — keine Fakten erfinden)',
    factsSlice,
    '## Ausgabeformat',
    '{ "questions": [ { "type": "mc", "stem": "...", "options": ["..."], "correct": [0], "explanation": "...", "source_ids": ["..."], "competency": "K..", "level": "A|B|C" } ] }',
    JSON_ONLY,
  ].join('\n\n');
}

export function buildDiagnosePrompt({ errorHistoryJson, competenciesJson }) {
  return [
    '## Aufgabe: Diagnostiziere Schwächen PRO KOMPETENZ und plane eine Nachschulung',
    '## Fehlerhistorie (strukturiert)',
    errorHistoryJson,
    '## Kompetenzmodell',
    competenciesJson,
    '## Ausgabeformat',
    '{ "weak_competencies": [ { "id": "K..", "level": "A|B|C", "evidence": "<1 Satz>" } ], "plan": [ { "unit": "<unit-id>", "reason": "<1 Satz>" } ], "summary": "<2-3 Sätze für den Lernenden>" }',
    JSON_ONLY,
  ].join('\n\n');
}

// Grading an expert-dialogue transcript: a fresh call in the role of an adjudicator.
export function buildBossJudgePrompt({ scenarioCore, rubric, transcript }) {
  return buildSummativeGradingPrompt({
    question: `Bewerte das folgende Fachgespräch gegen die Rubrik.\n\n## Szenario-Kern\n${asText(scenarioCore)}`,
    rubric: asText(rubric),
    modelAnswer: '',
    answer: `## Gesprächs-Transcript\n${asText(transcript)}`,
  });
}

export function extractJson(text) {
  if (typeof text !== 'string') throw new Error('LLM-Antwort ist kein Text');
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('kein JSON-Objekt in LLM-Antwort');
  const raw = t.slice(start, end + 1);
  try { return JSON.parse(raw); } catch (e) {
    // Repair 1: unescaped quotes and line breaks INSIDE string values
    try { return JSON.parse(repairJson(raw)); } catch { /* weiter */ }
    // Repair 2: the model returned TWO objects (answer plus addendum), which makes
    // lastIndexOf('}') too greedy. Take the first complete object.
    const first = firstBalancedObject(t.slice(start));
    if (first) {
      try { return JSON.parse(first); } catch { try { return JSON.parse(repairJson(first)); } catch { /* aufgeben */ } }
    }
    throw e;
  }
}

/** First brace-balanced {…} from position 0; string literals are skipped. */
function firstBalancedObject(s) {
  let depth = 0, inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return s.slice(0, i + 1); }
  }
  return null;
}

/** Conservative repair: escapes control characters and bare quotes inside strings. */
function repairJson(s) {
  let out = '', inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (esc) { out += c; esc = false; continue; }
    if (c === '\\') { out += c; esc = true; continue; }
    if (c === '"') {
      if (!inStr) { inStr = true; out += c; continue; }
      // The quote only closes if a structural character follows, possibly after whitespace
      const rest = s.slice(i + 1).replace(/^\s*/, '');
      if (rest === '' || ':,}]'.includes(rest[0])) { inStr = false; out += c; }
      else out += '\\"';                       // nacktes Quote im String → escapen
      continue;
    }
    if (inStr && (c === '\n' || c === '\r')) { out += '\\n'; continue; }
    if (inStr && c === '\t') { out += '\\t'; continue; }
    out += c;
  }
  return out;
}

// Personalisation, orchestrated by the application: structured prompts, JSON back.
// HARD surface boundary: a reskin changes ONLY the organisation name, role titles
// and domain vocabulary — never facts, rubrics or difficulty.
export function buildPersonalizationPrompt({ fachprofil, lernprofil, retry_hint }) {
  return [
    'Du personalisierst eine EU-AI-Act-Lernakademie für dieses Nutzerprofil.',
    '## Fachprofil', JSON.stringify(fachprofil),
    '## Lernprofil', JSON.stringify(lernprofil),
    retry_hint ? '## Korrekturhinweis\n' + retry_hint : '',
    '## Aufgabe',
    'Erzeuge: (1) relevanz_overrides — bis zu 8 Artikel/Anhänge, deren Relevanz-Stufe für',
    'dieses Profil von der Behörden-Baseline abweicht (stufe: kern|relevant|landkarte);',
    '(2) beispiel_einkleidungen — 3-6 kurze Beispiel-Texte je Beispiel-Intent-Slot',
    '(intent_id frei wählbar als slot-1..slot-6), im Branchen-Kontext des Profils;',
    '(3) szenario_einkleidungen — für die Szenarien sz-p2-stimmungsradar und sz-capstone-kern',
    'je {scenario_id, org, rolle, domaenenbegriff}: NUR Oberflächen-Merkmale, KEINE Fakten,',
    'KEINE Rubrik, KEINE Schwierigkeitsänderung (harte Grenze);',
    '(4) level_endtitel — trocken-witziger Endtitel (3-60 Zeichen) passend zur Job-Rolle.',
    '## Ausgabeformat',
    '{ "level_endtitel": "...", "relevanz_overrides": [{"ref":"Art. 6","stufe":"kern"}],',
    '  "beispiel_einkleidungen": [{"intent_id":"slot-1","text":"..."}],',
    '  "szenario_einkleidungen": [{"scenario_id":"sz-p2-stimmungsradar","org":"...","rolle":"...","domaenenbegriff":"..."}] }',
    JSON_ONLY,
  ].filter(Boolean).join('\n');
}
