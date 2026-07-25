# Änderungen

Alle bedeutsamen Änderungen an diesem Projekt werden hier festgehalten.
Das Format folgt [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
die Versionierung folgt [Semantic Versioning](https://semver.org/lang/de/).

Rechtsänderungen werden gesondert ausgewiesen: Sie können den Prüfstatus von Fragen
entziehen und bereits erreichte Ergebnisse an einen überholten Rechtsstand binden.

## [Unveröffentlicht]

### Hinzugefügt
- Eigenständiges, öffentliches Repository mit frischer Historie
- Lizenzen: Apache-2.0 für den Programmcode, CC BY 4.0 für die Lerninhalte
- Pflichtdokumente für den öffentlichen Betrieb: Sicherheitsrichtlinie,
  Mitwirkungsleitfaden, Verhaltenskodex, Vorlagen für Meldungen und Pull Requests

### Geändert
- Der Pfad zur Programmierschnittstelle wird dokumentrelativ bestimmt statt fest
  verdrahtet. Die Anwendung läuft damit an beliebiger Stelle, nicht nur im
  Wurzelverzeichnis.
- Bildmaterial auf WebP umgestellt und auf die tatsächlich benötigte Auflösung
  gebracht: 182 MB auf 5,4 MB, gemessene Bildähnlichkeit im Mittel 42,7 dB.
- Die Fristenprüfung liest die Rechtsstandsdaten aus `content/`, nicht mehr aus
  einem internen Arbeitsbereich.

### Behoben
- Die Beschriftungen der Fristen-Ansicht überlagerten sich im dichten Bereich
  2026–2027 und waren unlesbar. Die Textbreite wird jetzt nach dem Einhängen ins
  Dokument gemessen statt geschätzt.
- Die Abzeichen-Galerie lud ins Leere, weil Kennungen und Dateinamen auseinanderliefen.

### Rechtsstand
- Zielrechtsstand 27.7.2026: Verordnung (EU) 2024/1689 in der Fassung der
  Verordnung (EU) 2026/1744. Unverändert gegenüber dem Vorgängerstand.
