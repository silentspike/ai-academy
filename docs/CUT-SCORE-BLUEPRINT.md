# Cut-Score-Blueprint — Kapiteltests & Examen (Plan #10, Review-2 P0-7)

> Version 1.0.0 (an `BLUEPRINT_VERSION` in `app/exam-core.js` gekoppelt — Änderung = neue Score-Serie, #17).
> Zweck: Der 80-%-Cut-Score wird hier BEGRÜNDET statt nur mit „üblich" behauptet.

## 1. Aufgabenanalyse — was die Prüfungen messen

Die Prüfungen messen die Auskunfts- und Einstufungsfähigkeit eines KI-Spezialisten
im Behörden-Betreiber-Kontext. Aus den Tätigkeiten (Gate-0-Kompetenzmodell,
`content/competencies.json`) folgt das Mengengerüst:

| Format | Kapiteltest | Examen Teil A | misst |
|---|---|---|---|
| Stufe A (erinnern) | 25 % | 15 % | Fakten-/Fristen-/Fundstellenwissen |
| Stufe B (anwenden) | 50 % | 50 % | Subsumtion, Pflichten-Zuordnung, Prozess |
| Stufe C (Grenzfall) | 25 % | 35 % | Abgrenzung, unvollständige Information, Mehrfachrollen |

Kapiteltests sind **zweiteilig** (#10): Teil 1 „Triage" Closed Book (Kernrisiko,
Rolle, nächste notwendige Frage, offensichtliches Verbot — die Meeting-Situation),
Teil 2 „Quellenarbeit" Open Book (Fundstelle finden, Voraussetzungen prüfen,
Ergebnis dokumentieren — die Schreibtisch-Situation).

## 2. Warum 80 % (PASS_SCORE = 0.8)

1. **Fehlerfolgen-Argument:** Eine falsche Einstufungs-Auskunft ist im Zielkontext
   ein potenzieller Compliance-Vorfall. Die tolerierbare Fehlquote liegt deutlich
   unter „Mehrheit richtig"; 80 % entspricht höchstens einer falschen von fünf
   Auskünften — die zudem durch die Critical-Error- und Kern-Minima-Regeln
   (unten) nicht in den kritischen Kategorien liegen darf.
2. **Mengengerüst-Argument:** Bei 25/50/25 (A/B/C) kann ein Prüfling mit 80 %
   nicht bestehen, indem er nur A- und B-Stufen beherrscht (max. 75 %) — der
   Cut erzwingt nachgewiesene Grenzfall-Kompetenz.
3. **Konvention als Plausibilisierung, nicht Begründung:** Große
   Zertifizierungsanbieter liegen bei 70–80 %; wir wählen die Oberkante wegen 1.

## 3. Mindestleistung je kritischer Kompetenz (KERN_MIN = 0.5)

Kern-Kompetenzen (`kern: true` in competencies.json): **K03 Einstufung,
K04 Verbote, K05 Rollen, K06 Fristen, K08 Betreiberpflichten** — die fünf
Kompetenzen, deren Ausfall im Beruf unmittelbar schadensträchtig ist.

Regel: Liegt in einem Test die Quote einer Kern-Kompetenz (bei ≥ 2 gestellten
Fragen) unter 50 %, ist der Test unabhängig vom Gesamtscore nicht bestanden
(`kern_mindestleistung`). Begründung: 80 % Gesamt können eine blinde Stelle in
einer einzelnen kritischen Kompetenz maskieren (z. B. alle Fristen-Fragen falsch,
Rest perfekt). Der Wert 0.5 ist bewusst als Untergrenze (nicht 0.8) gesetzt:
Er fängt Totalausfälle, ohne bei kleiner Fragenzahl (2–3 je Kompetenz) statistisch
überempfindlich zu werden; die eigentliche Kompetenz-Härtung leistet das
Examens-Gate (Retention „behalten" je Kern-Kompetenz, §3 Retention-Modell).

## 4. Examens-Gate (#12 + Retention)

Teil A + Teil B (Capstone) erfordern: alle Kapiteltests P1–P9 real bestanden
UND jede Kern-Kompetenz auf Retention-Stufe „behalten" (7-Tage-Bestätigung) —
ein Intensivtag kann keinen Scheinfortschritt in die Examensfreigabe tragen.
Max. 1 Antritt pro Kalendertag.

## 5. Zeitpilot

Teil A: 40 Fragen / 60 min = 90 s/Frage (MC ~45 s, Zuordnung ~90 s, Fall ~2 min,
Freitext ~4 min — Summe ≈ 52 min + Puffer). Der Wert wird beim ersten echten
Durchlauf (Abnahme-Session) gegen die Ist-Zeiten geprüft und hier fortgeschrieben.
Teil B: 1 Fall / ~30 min Open Book (Methodik + Fundstellen + Schlussfolgerung
nach Rubrik des Capstone-Kerns `sz-capstone-kern`).

## 6. Score-Serien (#17)

Ein Ergebnis ist nur innerhalb desselben Bewertungsregimes vergleichbar.
Regime-Schlüssel: Rechtsstand · Content-Version · Prompt-/Rubrik-Version ·
Modell · Blueprint-Version. Jede Änderung eröffnet eine neue Serie
(first/latest/best getrennt, sichtbare Trennlinie „Bewertungsverfahren geändert").
