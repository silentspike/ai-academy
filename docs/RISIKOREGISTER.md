# Risikoregister — AI-Act-Akademie

> Gate-−1-Dokument (Plan §7, §9; Review-2-Format). Jedes akzeptierte Risiko mit Steuerungsfeldern.
> Felder: risk_id · description · likelihood (L/M/H) · impact (L/M/H) · owner · control · residual_risk · acceptance_by · accepted_until · review_trigger · exit_criterion

---

## R01 — Opus-Kontingent erschöpft sich
- description: Jans Abo-Kontingent reicht nicht für hunderte Bewertungen/Woche
- likelihood: M · impact: M · owner: Jan
- control: Prozess-Pool statt Dauerkontext; deterministische Sofort-Prüfung entlastet; Pool-Wachstum senkt Generierungsbedarf
- residual_risk: zeitweise keine LLM-Bewertung bis Kontingent-Reset
- acceptance_by: Jan (Planungsdialog) · accepted_until: Widerruf
- review_trigger: erstes erreichtes Wochenlimit während einer Lernwoche
- exit_criterion: zweites Abo-CLI (codex) als Ausweichpfad aktivieren — API-Keys sind per Direktive 2026-07-25 kein Pfad

## R02 — LLM-/Bridge-Ausfall ohne Fallback
- description: Bei Anbieter-/CLI-Ausfall sind Agent-Funktionen nicht nutzbar; kein Pending-Modus, kein Ersatz-Bewerter
- likelihood: L · impact: M · owner: Jan
- control: systemd Restart=always; deterministische Teile bleiben nutzbar; transaktionale Sicherung schützt Prüfungsantworten (R09 getrennt)
- residual_risk: verlorene Lern-Sessions bei längerem Anbieter-Ausfall
- acceptance_by: Jan, wörtlich „wir gehen davon aus, dass das LLM immer verfügbar ist" (§12 Nr. 7) · accepted_until: Widerruf
- review_trigger: erster Ausfall, der eine geplante Lernsession verhindert
- exit_criterion: entfällt (bewusste Annahme); Neubewertung nur über review_trigger

## R03 — Bewertungs-Drift über Modell-Updates
- description: Opus-Update ändert den Bewertungsmaßstab unbemerkt
- likelihood: M · impact: H (Prüfungsfairness) · owner: Claude (Build) / Jan (Betrieb)
- control: Gold-Set light mit Auto-Sperre bei Toleranz-Überschreitung; Modellversions-Logging je Bewertung; Score-Serien-Trennung
- residual_risk: Drift innerhalb der Toleranzen
- acceptance_by: Jan (Review-2-Runden) · accepted_until: Widerruf
- review_trigger: Gold-Set-Lauf rot ODER Modellwechsel
- exit_criterion: — (Dauerkontrolle)

## R04 — LLM-Fehlbewertung im Einzelfall
- description: Einzelne Freitext-Bewertung falsch trotz korrektem Maßstab
- likelihood: M · impact: M · owner: Claude (Build)
- control: Einspruch mit anker-freier Zweitprüfung; Frage-Aussortierung; summative Prompt-Isolation
- residual_risk: unbemerkte Einzelfehler
- acceptance_by: Jan · accepted_until: Widerruf
- review_trigger: Einspruchsquote > 10 % in einer Woche
- exit_criterion: — (systemisch; Kontrollen dauerhaft)

## R05 — Live generierte Übungsfragen fehlerhaft
- description: Formativ generierte Fragen können Fehler enthalten
- likelihood: M · impact: L (kostet nichts, straffreier Raum) · owner: Claude (Build)
- control: Blueprint-Constraints; summative Prüfungen 100 % validierter Pool; Einspruch als Rückkanal
- residual_risk: vereinzelt verwirrende Übungsfragen
- acceptance_by: Jan · accepted_until: Widerruf
- review_trigger: gehäufte Einsprüche gegen Übungsfragen (>5/Woche)
- exit_criterion: — 

## R06 — Share: Tutoring-Qualität hängt am Fremd-Konto
- description: Auch innerhalb der Frontier-Klasse variiert Qualität (Modell-Generationen)
- likelihood: M · impact: M · owner: Jan (Produkt)
- control: Frontier-Gate (harte Sperre); Self-Check misst konkrete Kombination; Modell-Label auf jedem Ergebnis
- residual_risk: Restvarianz zwischen Frontier-Modellen
- acceptance_by: Jan (Frontier-Beschluss) · accepted_until: Widerruf
- review_trigger: Nutzer-Feedback über unplausible Bewertungen
- exit_criterion: Kalibrierungs-Profile pro Modell (Public-Sprint-Material)

## R07 — Kein Gratis-/Niedrigschwellen-Pfad (Gemini/Ollama gestrichen)
- description: Nutzer ohne Claude/ChatGPT-Zugang sind ausgeschlossen
- likelihood: sicher (by design) · impact: L (Adoption) · owner: Jan
- control: dokumentierte Anforderung im README; Zielgruppen-Annahme: AI-Act-Lernende haben Frontier-Zugang
- residual_risk: kleinere Reichweite der Share-Version
- acceptance_by: Jan („nur Claude+ChatGPT, harte Sperre") · accepted_until: Widerruf
- review_trigger: Public-Release-Planung
- exit_criterion: bewusste Erweiterungs-Entscheidung (neues Gate: Bewertungs-Vergleichbarkeit)

## R08 — Komplett-Lieferung gefährdet 1.9.-Lernstart
- description: EINE Gesamtlieferung in ~5 Wochen; wenn ein Teil hakt, wartet alles (Review 2 empfahl Staffelung — abgelehnt)
- likelihood: M · impact: H (Lernziel) · owner: **Jan (explizit Risiko-Owner laut Plan §7)**
- control: interne Gate-Reihenfolge; vertikaler Durchstich vor Content-Masse; im Konfliktfall wird Share-/Design-Scope geschoben, nie Content-Qualität
- residual_risk: späterer Lernstart
- acceptance_by: Jan („Komplett-Lieferung behalten") · accepted_until: 2026-08-15 (implizite Nachprüfung: reicht die Zeit?)
- review_trigger: 15.8.2026 erreicht ohne abgeschlossenes Gate 2 → User informieren, Scope-Entscheidung anbieten
- exit_criterion: Übergabe erfolgt

## R09 — Datenverlust bei Bewertungsaufrufen
- description: Timeout/Absturz während Examens-Freitext vernichtet Antwort + Tagesversuch
- likelihood: M · impact: H · owner: Claude (Build)
- control: transaktionale Sicherung (Antwort persistiert VOR Aufruf; Status incomplete_pending_retry; Versuch nicht verbraucht)
- residual_risk: minimal (Schreibfehler auf Disk)
- acceptance_by: — (Kontrolle verpflichtend, kein akzeptiertes Restrisiko)
- review_trigger: jeder aufgetretene pending_retry-Fall wird geloggt
- exit_criterion: — (Dauerkontrolle)

## R10 — Safari-localStorage-Räumung (Share)
- description: Safari löscht localStorage aggressiver → Lernstand-Verlust
- likelihood: M (bei Safari-Nutzern) · impact: M · owner: Claude (Build)
- control: Export/Import-Button; proaktiver Export-Hinweis nach großen Sessions
- residual_risk: Verlust zwischen Exporten
- acceptance_by: Jan · accepted_until: Widerruf
- review_trigger: —
- exit_criterion: —

## R11 — Freitexte gehen an den LLM-Anbieter
- description: Nutzer-Eingaben verlassen das Gerät Richtung Anthropic/OpenAI
- likelihood: sicher (by design) · impact: M (abhängig vom Inhalt) · owner: Nutzer (Verhalten) / Claude (Aufklärung)
- control: Transparenz-Hinweis vor erster Interaktion; Banner an Freitextfeldern (keine Personendaten Dritter/Interna); Log-Redaktion
- residual_risk: Nutzer ignoriert Banner
- acceptance_by: Jan · accepted_until: Widerruf
- review_trigger: —
- exit_criterion: —

## R12 — Rechtsstand ändert sich erneut
- description: Weitere Omnibus-Pakete, Leitlinien, AT-Vollzugsakte ändern den Stoff (ist WÄHREND der Planung passiert)
- likelihood: H · impact: H (Kern des Produkts) · owner: Jan (Betrieb) / Claude (Build der Governance)
- control: volle Update-Governance (#9): Claims-Register, legal-audit, Review-Zyklus, Change-Log, ⚠-Labels; Rechtsänderung wirkt auf Scores (Summativ-Entzug, Serien-Trennung); Incident-Prozess
- residual_risk: Zeitfenster zwischen Rechtsänderung und Einpflege
- acceptance_by: Jan (volle Governance beauftragt) · accepted_until: Widerruf
- review_trigger: jede neue AI-Act-relevante Veröffentlichung im Amtsblatt/RTR
- exit_criterion: — (Dauerprozess, UPDATE-PROZESS.md)

## R13 — Konsolidierung von Hand (keine amtliche konsolidierte Fassung verfügbar)
- description: Arbeitskonsolidierung Artikel für Artikel gegen zwei Amtsblatt-Texte; Fehlerrisiko
- likelihood: M · impact: H · owner: Claude (Gate 0)
- control: vollständiges Änderungsregister statt Zusammenfassung; Zweitmodell-Kreuzprüfung jeder summativ-relevanten Aussage; Kennzeichnung „redaktionelle Arbeitskonsolidierung"
- residual_risk: Einzelfehler bis zum Erscheinen der amtlichen Konsolidierung
- acceptance_by: Jan („voll konsolidieren") · accepted_until: Erscheinen der EUR-Lex-Konsolidierung
- review_trigger: EUR-Lex publiziert konsolidierte Fassung → legal-audit-Abgleich aller Claims
- exit_criterion: Abgleich gegen amtliche Konsolidierung abgeschlossen

## R14 — KI-Bildserie inkonsistent / Higgsfield-Credits reichen nicht
- description: Serienkonsistenz bei KI-Bildern ist iterativ; 1000 Credits (Stand Planung) könnten knapp werden
- likelihood: M · impact: L (kosmetisch) · owner: Claude (Build)
- control: Style-Manual + Referenzbild-Workflow; Entwürfe auf günstigem Modell (Nano Banana 2), final Pro; Credit-Stand wird VOR jeder Serie geprüft; Engpass wird GEMELDET statt still degradiert
- residual_risk: Bildwelt als Nachlieferung (SVG-Platzhalter-Notfallpfad)
- acceptance_by: Jan · accepted_until: Widerruf
- review_trigger: Credits < 200 vor einer geplanten Serie
- exit_criterion: Bildwelt vollständig in assets/

## R15 — Volles Motion-Design: Bauzeit + schwache Hardware
- description: Motion-Programm kostet Zeit und kann auf schwachen GPUs ruckeln
- likelihood: M · impact: L · owner: Claude (Build)
- control: nur transform/opacity (GPU-Pfad); prefers-reduced-motion; Screenshot-/Live-Reviews decken Ausreißer früh auf
- residual_risk: Ruckeln auf sehr alter Hardware
- acceptance_by: Jan (Design erfolgskritisch) · accepted_until: Widerruf
- review_trigger: sichtbares Ruckeln in einer Review
- exit_criterion: —

## R16 — WCAG-Level-A-Gap in v1 (Tastatur/DnD-Alternative abgelehnt)
- description: v1 ist nicht voll tastaturbedienbar; Drag&Drop ohne Nicht-Zieh-Alternative
- likelihood: sicher (by design) · impact: L (Einzelnutzer) / H (bei Public-Release) · owner: Jan
- control: ehrliche Nicht-Konformitäts-Dokumentation (#41); Pflicht-Schließung vor Public-Release in §8 verankert
- residual_risk: keins für Jans Nutzung; Public-Release blockiert bis Schließung
- acceptance_by: Jan („Ohne Tastatur/DnD-Alternative") · accepted_until: Public-Flip
- review_trigger: Start des Public-Sprints
- exit_criterion: WCAG-A-Konformität der Kernbedienung nachgewiesen

## Nachtrag 2026-07-25 — Plan-Abweichung: „vorgewärmter Prozess-Pool" (#22)

**Plan-Zusage:** „Die Bridge verwaltet benannte Sessions plus einen vorgewärmten
Prozess-Pool für alle frischen Aufrufe" (#22, §6.1) — Zweck: CLI-Startlatenz sparen.

**Befund (Messung 2026-07-25):** Technisch nicht umsetzbar wie beschrieben. Die
`claude`-CLI im `-p`-Modus nimmt den Prompt als Argument entgegen und beendet sich
nach der Antwort; es gibt keinen Prozess, der „warm" auf einen späteren Prompt
warten könnte. Ein Pool könnte nur leere Prozesse vorhalten, die sofort wieder
terminieren.

**Messung des tatsächlichen Anteils:**
- Voller summativer Aufruf (Bewertung mit Rubrik): 23,6–39,3 s
- Trivial-Aufruf über die Bridge (`auth-check`, „Sag OK"): 10,7–16,5 s
- CLI direkt ohne Bridge, Trivial-Prompt: 2,5 s

⇒ Die Startkosten des Prozesses selbst liegen bei ~2–3 s; der weit überwiegende
Teil der Wartezeit ist Modell-Inferenz, die kein Pool verkürzt. Der erwartete
Nutzen der Zusage ist also klein.

**Entscheidung:** Nicht gebaut; stattdessen bleibt die Ein-Aufruf-Queue (`queueChain`)
mit Tiefenbegrenzung. Dokumentiert als bewusste Abweichung — Owner: Auftraggeber,
Review-Trigger: falls die CLI künftig einen persistenten Server-Modus anbietet.
