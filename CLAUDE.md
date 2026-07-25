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

Lernstände und Profile (`data/`), Secrets jeder Art, interne Arbeits- und
Abnahmedokumente, personen- oder organisationsbezogene Bezüge in Beispielen. Beispiele
verwenden ausschließlich fiktive Organisationen. Zwei CI-Schritte wachen darüber; das
Muster für geschützte Begriffe steht bewusst nicht im Repo, sondern kommt aus einem
Secret beziehungsweise einer lokalen, nicht versionierten Datei.

## Commits

Deutsch, im Imperativ, eine abgeschlossene Änderung pro Commit. Umlaute werden
ausgeschrieben (ä ö ü ß), nicht umschrieben. Vor einem Commit laufen mindestens
Syntax-Check und Schema-Validierung; bei Änderungen an Engine oder UI zusätzlich die
betroffene E2E-Spec.
