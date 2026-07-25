# AI-Academy — Projekt-Leitfaden für Agenten und Mitwirkende

Interaktives Lerntraining zum EU AI Act (VO 2024/1689 in der Fassung der VO 2026/1744)
mit LLM-Tutor. Diese Datei ist der verbindliche Arbeitsrahmen für alle, die am Repo
arbeiten — Menschen wie Agenten.

---

## Grundsätze

- **Content ist Daten, nie Code.** Die Engine interpretiert Schemata; neue Phasen,
  Einheiten oder Ländermodule sind JSON-Dateien, kein Engine-Eingriff.
- **Dependency-frei zur Laufzeit.** App und Bridge laufen ohne `node_modules`.
  `npm install` wird ausschließlich für die Test-Suite gebraucht (devDependencies).
- **Deterministischer Kern, LLM nur wo nötig.** Alle eindeutigen Formate bewertet
  JavaScript sofort; das LLM liefert Erklärtiefe, Freitext-Bewertung und Dialog.
- **Das LLM ist nie Rechtsquelle.** Rechtliche Aussagen stützen sich auf das
  mitgelieferte Quellenpaket und werden als `claims` mit `source_ids` belegt.
- **Nur Abo/OAuth, keine API-Keys.** Der Zugang läuft über die lokal installierte
  CLI (`claude`, `codex`). Ein Key-Pfad darf nicht zurückkehren; CI prüft darauf.

## Aufbau

```
public/     SPA-Shell — einziger Webroot
app/        Engine (Router, Quiz, Widgets, Dialog, Leitner, Gamification, Dashboard)
content/    Lerninhalte als JSON; Schema in content/SCHEMA.md
bridge/     dependency-freier Node-Daemon: liefert die App aus und spricht mit der CLI
tutor/      Prompt-Builder — summative Builder nehmen Notizen/Historie gar nicht an
tools/      Validatoren, Unit-Test-Suiten, Release-Builder, Gold-Set-Runner
tests/e2e/  Playwright-Suite (Fixtures, Harness, Specs)
docs/       Zweckbestimmung, Bedrohungsmodell, Risikoregister, Cut-Score-Blueprint
```

## Betrieb

```bash
node bridge/bridge.mjs                 # startet Bridge + liefert die App aus
node bridge/bridge.mjs --no-llm        # nur ausliefern (Prüfungen bleiben gesperrt)
```

Lokal alternativ über einen vorhandenen Webserver unter `public/` — **niemals einen
eigenen HTTP-Server starten**, wenn schon einer läuft.

## Tests

```bash
npm run test:unit      # Engine, Gamification, Examen, Onboarding, Erhaltung
npm run test:e2e       # Playwright, deterministisch, gestubbtes LLM
npm run test:all
```

**Viewport-Regel (verbindlich).** Screenshots und visuelle Prüfungen laufen bei
**1920 × 1026** — das ist ein maximiertes Browserfenster auf 1920 × 1200 abzüglich
Systemleisten und Browser-Chrome. `--start-maximized` allein genügt **nicht**:
Playwright erzwingt sonst weiter seinen Standard-Viewport von 1280 × 720. Erforderlich
ist zusätzlich `viewport: null` (lokal, sichtbar) beziehungsweise ein fest gesetzter
Viewport (CI, Baselines). Ein Guard bricht jeden Lauf ab, bevor ein Screenshot bei
falscher Größe entsteht.

**Coverage statt Checkliste.** Die Suite enumeriert alle interaktiven Elemente je Route
selbst und schlägt fehl, wenn eines nie betätigt wurde. Neue Bedienelemente werden damit
automatisch erfasst — eine Testliste würde sie übersehen.

**Echte Klicks.** Interaktion wird geklickt, nicht per `eval` aufgerufen, und jeder Klick
prüft über `elementFromPoint`, dass das Element wirklich erreichbar und nicht überlagert
ist. Funktionierende, aber unklickbare Elemente sind eine reale Fehlerklasse.

## Inhalte ändern

Jedes Content-Objekt trägt `legal_basis` (Fundstelle inklusive Fassung) und
`legal_status`. Die Schema-Validierung lässt Inhalte ohne Rechtsquelle nicht durch.
Summative Fragen durchlaufen den Statusprozess bis `approved_summative`; eine
Rechtsänderung entzieht diesen Status. Der Ablauf steht in `UPDATE-PROZESS.md`,
Abfragen liefert `tools/legal-audit.mjs`.

## Was nie ins Repo gehört

Lernstände und Profile (`data/`), Zugangsdaten jeder Art, interne Arbeits- und
Abnahmedokumente, personen- oder organisationsbezogene Bezüge in Beispielen. Beispiele
verwenden ausschließlich erfundene Organisationen. Zwei Prüfschritte wachen darüber; das
Muster für geschützte Begriffe steht bewusst nicht im Repo, sondern kommt aus einem
Geheimnis beziehungsweise einer lokalen, nicht versionierten Datei.

Nicht geschützt ist der **Name des Urhebers**. Die Lizenzen verlangen einen
Urheberrechtsvermerk, und er steht ohnehin in jedem Commit. Das Schutzmuster deckt
Arbeitgeberbezug, Dienstvorschriften und örtliche Zugangsmerkmale ab — nicht die
Urheberschaft.

## Kurzübersicht der Befehle

| Zweck | Befehl |
|---|---|
| Anwendung ausliefern (mit Modell) | `node bridge/bridge.mjs` |
| Anwendung ausliefern (ohne Modell) | `node bridge/bridge.mjs --no-llm` |
| Modultests | `npm run test:unit` |
| Bedienstrecke | `npm run test:e2e` |
| Alles | `npm run test:all` |
| Syntax aller Quelldateien | `npm run check` |
| Schema der Inhalte | `node tools/validate-content.mjs` |
| Zahlen und Fundstellen der Fragen | `node tools/check-questions.mjs` |
| Was hängt an einer Vorschrift | `node tools/legal-audit.mjs "Art. 6"` |
| Bewertungsmaßstab prüfen | `node tools/gold-set-run.mjs` (nur örtlich, Modellzugang nötig) |
| Auslieferungspaket bauen | `node tools/build-release.mjs --version vX.Y.Z` |

## Feste Regeln

**Niemals**

- Eine Datei ändern, ohne sie vorher gelesen zu haben.
- Eine Zusage als erfüllt melden, ohne den Befehl ausgeführt und die Ausgabe gesehen zu haben.
- Eine Schwelle, einen Grenzwert oder eine Prüfung anpassen, damit ein Lauf grün wird.
- Zugangsdaten, Lernstände oder interne Arbeitsdokumente versionieren.
- Einen Pfad für Schlüssel von Programmierschnittstellen wieder einführen.
- Eine rechtliche Aussage ohne Fundstelle einbauen.
- Echte Organisationen in Beispielen verwenden.
- Bildschirmaufnahmen bei anderer als der festgelegten Fenstergröße beurteilen.

**Immer**

- Nach einer Änderung an Engine oder Oberfläche: die betroffene Bedienstrecke laufen lassen.
- Nach einer Änderung an Inhalten: Schema-Prüfung und Fragenabgleich.
- Bei einer Rechtsänderung: `UPDATE-PROZESS.md` befolgen, betroffenen Fragen den Prüfstatus entziehen.
- Bei Wechsel von Modell oder Vorlagen: Maßstabslauf, bevor wieder summativ bewertet wird.
- Den Nachweis mitliefern: Befehl und tatsächliche Ausgabe.

## Ablauf einer Änderung

1. **Vorbereitung** — Betroffene Dateien lesen. Klären, ob die Änderung Inhalte,
   Engine oder beides betrifft. Bei Rechtsbezug zuerst die Fundstelle prüfen.
2. **Umsetzung** — Eine abgeschlossene Änderung. Keine Platzhalter, keine
   Ersatzimplementierungen, keine später nachzureichenden Teile.
3. **Nachweis** — Prüfungen ausführen. Bei sichtbaren Änderungen: Aufnahme machen
   **und ansehen**. Erst danach gilt die Änderung als fertig.
4. **Festschreiben** — Ein Commit je abgeschlossener Änderung, `CHANGELOG.md`
   ergänzen, bei Verhaltensänderung die Dokumentation nachziehen.

## Meldungen und Kennzeichnung

Kennzeichen nach Bedeutung: `type:bug` · `type:feature` · `type:content` ·
`type:legal` · `type:docs` · `type:security`, dazu `priority:critical|high|normal|low`
und `status:triage|in-progress|blocked|done`.

Meldungen zu Inhalten mit Rechtsbezug erhalten mindestens `priority:high` — eine
falsche Rechtsaussage kann dazu führen, dass jemand im Beruf falsch berät.

## Nachweispflicht

Der Ausgangszustand jeder Zusage ist **ungeprüft**. Ein Nachweis besteht aus
ausgeführtem Befehl und tatsächlicher Ausgabe, aus einer angesehenen
Bildschirmaufnahme oder aus einem erhobenen Messwert. Nicht als Nachweis gelten:
zitierte Zeilennummern, „Code gelesen", „Muster vorhanden", Quelltextdurchsicht ohne
Ausführung. Was nicht geprüft wurde, wird als ungeprüft benannt — mit Angabe, warum.

## Versionierung

Semantische Versionierung. Zusätzlich gilt für dieses Projekt:

- **Hauptversion** — Bruch im Format der Lernstände oder im Schema der Inhalte.
- **Nebenversion** — neue Inhalte, neue Funktionen, **jede Änderung des Rechtsstands**.
- **Korrekturversion** — Fehlerbehebungen ohne Formatänderung.

Jedes Prüfungsergebnis speichert Rechtsstand, Inhaltsversion, Bewertungsvorlage und
Modellversion. Ergebnisse aus verschiedenen Bewertungsregimen werden nie zu einem
gemeinsamen Bestwert vermischt.

## Commits

Vorsilbe nach der verbreiteten Konvention, Beschreibung auf Deutsch mit Umlauten:
`feat` · `fix` · `docs` · `style` · `refactor` · `perf` · `test` · `build` · `ci` ·
`chore` · `revert` · `deps` · `security` · `content` · `legal`.

Eine abgeschlossene Änderung pro Commit. Der Text nennt, was sich ändert **und
warum** — bei Fehlerbehebungen auch, wodurch der Fehler entstand. Vor dem Commit
laufen Syntaxprüfung und, bei Inhaltsänderungen, die Schema-Prüfung; der Haken unter
`scripts/pre-commit.sh` erledigt das.
