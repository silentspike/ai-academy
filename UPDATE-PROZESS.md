# UPDATE-PROZESS.md — Rechts-Update-Governance (Plan #9, volle Ausbaustufe)

> SSOT für den Umgang mit Rechtsänderungen, Leitlinien und Content-Fehlern.
> Rechtsquellen-Hierarchie (bindend): 1. Amtsblatt/Rechtsakt → 2. delegierte/
> Durchführungsrechtsakte → 3. nationale Gesetze → 4. verbindliche Behördenakte →
> 5. offizielle unverbindliche Leitlinien → 6. Entwürfe → 7. Sekundärliteratur →
> 8. **LLM-Ausgabe: niemals Rechtsquelle.** Konflikt → höhere Stufe gewinnt,
> Konflikt wird im Content sichtbar gemacht.

## A. Regel-Review-Zyklus (empfohlen: monatlich + anlassbezogen)

1. **Quellen sichten:** EUR-Lex (neue Rechtsakte zu 2024/1689), Kommissions-
   Leitlinien (bes. Art. 6 Abs. 5), AT-Vollzug (RIS, Sozialversicherungs-Presse).
2. **Betroffenheit ermitteln:** `node tools/legal-audit.mjs "Art. X"` listet
   jedes Content-Objekt mit dieser Rechtsgrundlage (Fragen, Einheiten, Karten,
   Szenarien, Fakten).
3. **Ändern:** betroffene Objekte anpassen; `legal_status` aktualisieren
   (`konsolidiert-<datum>` | `at-vollzug-offen` | `leitlinie-erwartet`);
   `legal_basis[].verified` neu stempeln.
4. **Score-Wirkung (Plan #9h):** Bei inhaltlicher Änderung einer summativen
   Frage: Status auf `retired_or_revised` → Eigenprüfungs-Durchgänge neu →
   erst dann wieder `approved_summative`. Betroffene Kompetenzen im Lernstand
   auf „erneute Bestätigung erforderlich"; alte Ergebnisse behalten ihren
   Rechtsstand-Stempel; Score-Serien trennen sich automatisch über den
   Regime-Schlüssel (Rechtsstand ist Bestandteil).
5. **Change-Log:** Eintrag im `changelog`-Feld der betroffenen Einheit(en) +
   Sammel-Eintrag unten in diesem Dokument.
6. **Gates:** `node tools/validate-content.mjs` und
   `node tools/check-questions.mjs` müssen grün sein; bei Prompt-/Modellwechsel
   zusätzlich `node tools/gold-set-run.mjs` (Auto-Sperre beachten).

## B. Incident-Prozess: falscher Rechtsinhalt in bereits absolvierter Einheit

Der gefährlichste Fall — Reihenfolge ist verbindlich:

1. **Sperren:** Objekt sofort aus dem aktiven Lernpfad nehmen
   (`status: retired_or_revised` / Einheit `hidden: true`).
2. **Summativ-Entzug:** Alle Fragen mit derselben fehlerhaften Aussage verlieren
   `approved_summative` (Registerabfrage über legal-audit, nicht Volltextsuche).
3. **Lernstände markieren:** Betroffene Kompetenz(en) auf „erneute Bestätigung
   erforderlich"; absolvierte Tests behalten Ergebnis + Stempel, zählen aber
   nicht mehr für das Examens-Gate, bis die Korrektureinheit bestanden ist.
4. **Korrektureinheit:** kurze Einheit „Korrektur: <Thema>" mit dem richtigen
   Stand + ausdrücklichem Hinweis, WAS vorher falsch gelehrt wurde (Umlern-Anker).
5. **Release + Changelog:** Korrektur-Release; Eintrag hier unter C mit
   Ursache, Umfang, betroffenen Objekt-IDs.
6. **Ursachen-Doku:** Wie ist der Fehler durch die Eigenprüfung gekommen?
   Prozess-Härtung im Prüfprotokoll nachziehen (docs/REVIEW-PROCESS.md).

## C. Change-Log (Sammelstellen)

| Datum | Anlass | Betroffene Objekte | Aktion |
|---|---|---|---|
| 2026-07-24 | Baseline: Arbeitskonsolidierung Stamm + VO 2026/1744 | gesamter Content | Erstaufbau, Rechtsstand `konsolidiert-2026-07-27` |
| 2026-07-25 | Oberflächen-Neutralisierung (§5.2) | 106 Content-Stellen | Reale Organisations-Einkleidung → fiktive ÖSVA, keine Rechtsaussage geändert |

## D. Wiedervorlage-Trigger (stehend)

- EUR-Lex publiziert die **konsolidierte Fassung** der VO 2024/1689 →
  Arbeitskonsolidierung vollständig gegenprüfen (Stichproben reichen NICHT).
- **Art.-6-Abs.-5-Leitlinien** der Kommission erscheinen → Phase-3-Einheiten
  + Einstufungs-Fragen reviewen (`legal-audit "Art. 6"`).
- **AT-Durchführungsgesetz** → gesamtes `at-vollzug-offen`-Segment auflösen
  (`node tools/legal-audit.mjs --status at-vollzug-offen`).
- **2.12.2026** (neue Verbote + Alt-Generator-Frist) → Fristen-Formulierungen
  von Zukunft auf Gegenwart umstellen.
