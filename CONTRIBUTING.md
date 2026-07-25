# Mitwirken

Danke für Ihr Interesse. Dieses Projekt ist ein Lernwerkzeug für ein Rechtsgebiet —
deshalb gelten für Inhalte strengere Regeln als für Code.

## Einstieg

```bash
git clone https://github.com/silentspike/ai-academy.git
cd ai-academy
node bridge/bridge.mjs --no-llm      # Anwendung ausliefern, ohne Modellanbindung
```

Für die Prüfstrecke zusätzlich:

```bash
npm ci
npx playwright install chromium firefox
npm run test:all
```

Die Anwendung selbst kommt ohne Abhängigkeiten aus. `npm ci` installiert
ausschließlich Werkzeuge für die Prüfstrecke; ausgeliefert wird davon nichts.

## Was besonders willkommen ist

- **Belegte Korrekturen am Rechtsstoff.** Das ist der wertvollste Beitrag.
- **Weitere Ländermodule.** Phase 9 ist bewusst austauschbar aufgebaut.
- **Fehler in der Bedienung**, besonders solche, die nur an bestimmten
  Fenstergrößen oder in bestimmten Browsern auftreten.
- **Verbesserungen an der Barrierefreiheit.** Die erste Fassung erhebt bewusst
  keinen Konformitätsanspruch; Tastaturbedienung und eine Alternative zum Ziehen
  und Ablegen sind offene Punkte.

## Regeln für Inhalte

Jede rechtliche Aussage braucht eine Fundstelle. Ohne die Felder `legal_basis` und
`legal_status` kommt ein Inhalt nicht durch die Schema-Prüfung — das ist keine
Konvention, sondern erzwungen.

- **Fundstelle bis zum Absatz**, mit Angabe der Fassung. „Art. 6" genügt nicht;
  „Art. 6 Abs. 3 in der Fassung der Verordnung (EU) 2026/1744" genügt.
- **Rangfolge der Quellen beachten**: Amtsblatt vor delegierten Rechtsakten vor
  nationalem Recht vor Behördenakten vor unverbindlichen Leitlinien vor Entwürfen
  vor Sekundärliteratur. Die Ausgabe eines Sprachmodells ist niemals eine
  Rechtsquelle.
- **Zeitbezug angeben.** Fast jede Aussage im AI Act hat ein „ab wann", oft mehrere
  je nach Anhang, Altbestand und Verwender. Prüfungsfälle nennen ein Datum, sonst
  ist „nicht abschließend bestimmbar" die richtige Lösung.
- **Keine echten Organisationen.** Beispiele und Szenarien verwenden erfundene
  Einrichtungen. Das gilt auch für Fälle, die einer realen Organisation nur ähneln.
- **Fragen für Prüfungen** durchlaufen einen eigenen Freigabeweg. Ein Beitrag kann
  eine Frage vorschlagen; den Prüfstatus vergibt der Betreuer nach eigener Prüfung
  gegen die Primärquelle.

## Regeln für Code

- **Keine Abhängigkeiten zur Laufzeit.** Wer eine braucht, begründet sie im Pull
  Request. Die Bewahrung dieser Eigenschaft hat Vorrang vor Bequemlichkeit.
- **Nachweis statt Behauptung.** In den Pull Request gehört der ausgeführte Befehl
  mit seiner Ausgabe. „Getestet" ohne Ausgabe zählt nicht.
- **Bei Änderungen an der Oberfläche** gehört eine Bildschirmaufnahme dazu — bei
  1920 × 1026, der Größe, für die die Prüfstrecke ausgelegt ist.
- **Deutsche Sprache** in Kommentaren, Dokumentation und Commit-Texten, mit
  Umlauten. Kennungen im Code bleiben englisch, wo das der umgebende Code so hält.

## Commit-Texte

Vorsilbe nach der verbreiteten Konvention, Beschreibung auf Deutsch:

```
feat:     neue Funktion
fix:      Fehlerbehebung
docs:     nur Dokumentation
style:    Formatierung ohne Verhaltensänderung
refactor: Umbau ohne Verhaltensänderung
perf:     Leistungsverbesserung
test:     Prüfstrecke
build:    Bauvorgang oder Abhängigkeiten
ci:       Arbeitsabläufe
chore:    Sonstiges
revert:   Rücknahme
deps:     Abhängigkeiten
security: Sicherheitsbehebung
content:  Lerninhalte
legal:    Rechtsstand und Fundstellen
```

Beispiel:

```
fix: Beschriftungen der Fristen-Ansicht überlagerten sich

Im dichten Bereich 2026–2027 waren sie unlesbar. Breite wird jetzt nach dem
Einhängen ins Dokument gemessen statt geschätzt.
```

## Zweige

```
feat/kurze-beschreibung
fix/kurze-beschreibung
content/kurze-beschreibung
legal/kurze-beschreibung
```

Der Hauptzweig ist geschützt. Änderungen laufen über Pull Requests; die Prüfstrecke
muss grün sein.

## Verhalten

Es gilt der [Verhaltenskodex](CODE_OF_CONDUCT.md).
