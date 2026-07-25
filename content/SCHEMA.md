# Content-Schema (SSOT) — AI-Act-Akademie

> Verbindlich für ALLE Dateien unter `content/`. Maschinell geprüft durch
> `tools/validate-content.mjs` (CI-Gate: Content ohne Rechtsquelle failt).
> Rechtsstand aller Inhalte: **Arbeitskonsolidierung 27.7.2026** (siehe docs/REVIEW-PROCESS.md).

## Gemeinsame Pflichtfelder (jedes Content-Objekt)

| Feld | Typ | Regel |
|---|---|---|
| `id` | string | eindeutig innerhalb der Datei, kebab-case |
| `legal_basis` | **Claims-ARRAY** | ≥1 Claim; Aussagen-Ebene, nicht Objekt-Ebene (Plan #9f) |
| `legal_status` | enum | `konsolidiert-2026-07-27` \| `at-vollzug-offen` \| `leitlinie-erwartet` |
| `competency` | string | `K01`–`K18` (aus `competencies.json`) |

### Claim (Element von `legal_basis`)

```json
{
  "ref": "Art. 5 Abs. 1 lit. f",             // Fundstelle bis Absatz/Satz
  "instrument": "VO 2024/1689 idF 2026/1744", // Fassung
  "applies_from": "2025-02-02",               // optional; Pflicht bei zeitabhängigen Aussagen
  "transition_rule": "u1",                    // optional; Verweis auf fristen-uebergangsmatrix
  "actor_scope": "betreiber|anbieter|alle",   // optional
  "verified": "eigenpruefung-2026-07-24"      // Protokoll-Anker (Eigenprüfung, KEIN Zweitmodell — Direktive)
}
```

## `units/p{n}-*.json` — Einheit

`{ id, phase, title, competency, level, blocks[], legal_basis, legal_status, change_log[] }`
- `blocks[]`: `{ type: 'problem'|'worked_example'|'concept'|'check'|'quelle'|'erwg'|'merkbild'|'widget', ... }`
  - `problem`: Einstiegsfrage VOR der Theorie (Problem-first §3); `worked_example` für Einsteiger-Profile
  - `concept`: `html` (2–4 Absätze, JEDES Amtsdeutsch-Wort im Glossar)
  - `check`: eingebettete Frage (Frage-Schema, formativ, `confidence: true`)
  - `quelle`: Originaltext-Box `{ ref, text, changed_by_omnibus: bool }` — trägt `data-hilfsmittel`
  - `erwg`: Auslegungs-Box `{ nr, text }`
  - `widget`: `{ widget: 'timeline'|'pyramid'|'annex3'|'roleswitch'|'assignment', payload }`

## `questions-core.json` — Frage (Pool)

`{ id, type: mc|multi|case|freetext, prompt, scenario?, options[], insufficient_info?, trap?,
   critical_error?, competency, level, legal_basis, legal_status, status, review_protocol? }`
- `options[]`: `{ id, text, correct, rationale, source_ref }` — **jede richtige UND falsche Option
  gegen eine konkrete Fundstelle begründet** (#15a)
- `status` (Statusprozess #15): `agent_generated → source_linked → reviewed → approved_summative`
  (oder `retired_or_revised`). **Summative Verwendung NUR bei `approved_summative`.**
- `reviewed` erfordert BEIDE Eigenprüfungs-Durchgänge (getrennt, protokolliert in
  Protokoll `eigenpruefung#<anker>`, siehe docs/REVIEW-PROCESS.md): (i) Skript-Abgleich prüfbarer Angaben, (ii) Volltext-Zweitdurchsicht.
- `trap` (Fangfrage): `{ is_trap: true, note }` — Quote pro summativem Test ≤15 % (#13)
- `critical_error`: `{ option_ids[], reason, requires_complete_facts: true }` — eng gefasst (#16a)
- mc/case: **genau 1** `correct:true`; multi: ≥2; „Für eine belastbare Einstufung fehlen
  Informationen" ist als reguläre (auch richtige) Option zulässig (#13)

## `facts-db.json`

`{ facts: [Fact], relevanz_matrix: { rollen: {...}, artikel: [{ ref, titel, kategorien[], relevanz: { betreiber_behoerde: kern|kompakt|karte } }] } }`
- Fact (Varianten-Engine-Futter): `{ id, kind: frist|zuordnung|definition|schwelle, statement,
  subject, correct, distractor_pool[], invertible, negation?, distractor_truths?, prompt?,
  competency, level, legal_basis, legal_status }`

## `flashcards.json` · `glossary.json` · `scenarios.json` · `archetypes.json` · `blueprints.json` · `goldset.json`

- Karte: `{ id, front, back, competency, level, legal_basis, legal_status }`
- Glossar: `{ term, aliases[], simple, memory_hook, legal_basis }`
- Szenario (Schicht 1, §5.2): `{ id, title, rubric_id, rubric[], persona_archetype, facts[]
  (released_at_phase!), phases[], goals[] (matcher = Regex), critical_errors[], competency,
  legal_basis, legal_status }` — Sachverhalt DETERMINISTISCH, LLM formuliert nur Persona.
- Archetyp (Schicht 2): `{ id, name, dynamik, ton, typische_zuege[] }` — branchenunabhängig.
- Blueprint (Live-Generierung, NUR formativ): `{ id, pattern, constraints, competency, level }`
- Goldset: `{ id, question_id, answer_text, target_score, target_verdict, anchor_level,
  holdout: bool }` — Holdout fließt NIE in Prompt-Entwicklung (#27a).

## Profile

- Repo enthält KEINE echten Profile. `tests/fixtures/profile-beispielbank.json` = einziges Fixture.
- Kurator-Profil: `data/profiles/<name>.json` (Dateiname ist Nutzersache) (gitignored, außerhalb Webroot; §5.1).

## Änderungs-Governance (#9)

Jede Einheit trägt `change_log[]: { date, was, quelle }`. Rechtsänderung ⇒ betroffene Fragen
verlieren `approved_summative` sofort (`retired_or_revised`), Score-Serien werden getrennt (#17).
