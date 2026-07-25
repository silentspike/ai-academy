# Critical-Error-Gates — vorab veröffentlichte Liste (Plan #16a, v3.2 eng gefasst)

> Diese Liste ist Teil der Prüfungsordnung der Akademie und wird VOR der ersten
> Prüfung veröffentlicht (verlinkt aus Examen und Kapiteltests). Ein Critical
> Error führt unabhängig von der Punktzahl zum Nichtbestehen des Tests/Examens —
> mit gezielter Nachschulung statt Strafe.

## Die fatalen Fehler

| # | Fehler | Warum fatal |
|---|---|---|
| CE1 | Eine verbotene Praxis (Art. 5) als zulässig eingestuft | Im Beruf ein unmittelbarer Rechtsverstoß mit Sanktions- und Grundrechtsfolgen |
| CE2 | Ein eindeutiges Hochrisiko-System als „ohne spezifische Pflichten" eingestuft | Überspringt das gesamte Pflichtenprogramm (Art. 8–27, 43–49) |
| CE3 | Die FRIA-Pflicht (Art. 27) verneint, wo sie eindeutig greift | Grundrechtsschutz-Instrument der öffentlichen Hand entfällt |
| CE4 | Art. 4a als Pauschal-Erlaubnis für besondere Datenkategorien behandelt | Kernstelle des Omnibus; Fehllesung wäre ein DSGVO-/AI-Act-Doppelverstoß |
| CE5 | Verbots-Zeitschicht ignoriert („gilt ja noch nicht"), obwohl der Tatbestand bereits scharf ist | Stamm-Verbote gelten seit 2.2.2025 — Terminverwechslung legalisiert Verbotenes |

## Eingrenzung (v3.2 — schützt vor dem Gegenteil-Unrecht)

Ein Critical Error greift **NUR**, wenn:

1. der Sachverhalt **alle notwendigen Informationen** enthält
   (`requires_complete_facts: true` an der Frage — vom Schema-Validator erzwungen), und
2. die Rechtslage hinreichend **eindeutig** ist.

Bei unvollständigen oder umstrittenen Fällen ist „Für eine belastbare Einstufung
fehlen Informationen" eine mögliche **richtige** Antwort und niemals ein Critical
Error. „Hochrisiko nicht erkannt" ist nicht fatal, wenn die Zweckbestimmung im
Fall fehlte.

## Technische Umsetzung

- Fragen tragen `critical_error: { option_ids: [...], reason, requires_complete_facts: true }`.
- Deterministische Formate: Wahl einer gelisteten Option → `critical: true`
  (`app/exam-core.js`, `gradeAnswer`).
- Freitext/Capstone: Der Prüfer-Prompt setzt `critical_error` NUR bei den hier
  definierten Fehlern, nie für bloße Unvollständigkeit (Kalibrier-Regel 4,
  `tutor/prompts.mjs`); die Gold-Set-Metrik T3 (falsche Critical-Errors = 0)
  überwacht das bei jedem Lauf.
- Auswertung: `evaluateTest` → `passed: false, reason: 'critical_error'` +
  Nachschulungsstrecke für die betroffene Kompetenz.
