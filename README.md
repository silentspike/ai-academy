# AI-Academy

[![checks](https://github.com/obtFusi/ai-academy/actions/workflows/ci.yml/badge.svg)](https://github.com/obtFusi/ai-academy/actions/workflows/ci.yml)
[![Code: Apache-2.0](https://img.shields.io/badge/Code-Apache--2.0-blue.svg)](LICENSE)
[![Inhalte: CC BY 4.0](https://img.shields.io/badge/Inhalte-CC%20BY%204.0-lightgrey.svg)](LICENSE-CONTENT)
[![Rechtsstand](https://img.shields.io/badge/Rechtsstand-27.7.2026-green.svg)](docs/INTENDED-PURPOSE.md)

Interaktives Lerntraining zum **EU AI Act** — Verordnung (EU) 2024/1689 in der Fassung
der Verordnung (EU) 2026/1744 („Digital Omnibus"), Zielrechtsstand 27.7.2026. Mit
eingebettetem Tutor, verteilter Wiederholung, Kompetenzmodell, Fachgesprächen gegen
einen simulierten Gesprächspartner und einem Prüfungssystem aus geprüftem Fragenbestand.

Läuft vollständig auf dem eigenen Rechner. Es gibt keinen Dienst, kein Konto und keine
zentrale Datenhaltung; das Sprachmodell wird über die eigene Anmeldung angebunden.

![Übersicht](docs/screenshots/dashboard.webp)

> **Wofür es bestimmt ist:** persönliche, freiwillige, nicht formale Weiterbildung.
> **Wofür nicht:** Personalentscheidungen, Leistungsbeurteilungen, formale Abschlüsse,
> akkreditierte Zertifizierungen. Ergebnisse sind ein persönlicher, unbeaufsichtigter
> Lernnachweis — kein Zeugnis. Einzelheiten in [docs/INTENDED-PURPOSE.md](docs/INTENDED-PURPOSE.md).

## Warum es das gibt

Der Verordnungstext umfasst mehr als 140 Amtsblattseiten und verweist massiv auf sich
selbst. Ihn zu lesen erzeugt keine anwendbare Kompetenz — gebraucht wird die Fähigkeit,
einen konkreten Fall einzustufen, die Einstufung zu begründen und Einwände zu parieren.
Genau darauf ist das Training ausgelegt: Aufgabe zuerst, Erklärung danach, jede Aussage
mit Fundstelle, und Prüfungen, die eine Aussage verlangen statt Wiedererkennen.

Erschwerend kommt hinzu, dass sich der Rechtsstand am 24.7.2026 verschoben hat. Wer
weiterhin die alten Fristen lernt, gibt im Beruf falsche Auskunft. Das Training ist
durchgehend auf dem geänderten Stand gebaut, und die Änderung selbst ist Lernstoff.

## Voraussetzungen

- **Node.js ab Version 20** — die einzige Laufzeit. Die Bridge kommt ohne
  Abhängigkeiten aus.
- **Ein Abo bei einem Spitzenmodell**: Claude (Pro oder Max, über die `claude`-Anwendung)
  oder ChatGPT (über die `codex`-Anwendung). Der Zugang läuft ausschließlich über die
  Anmeldung dieser Anwendungen. **Schlüssel für Programmierschnittstellen werden bewusst
  nicht unterstützt**, andere Modellklassen ebenfalls nicht — die Selbstprüfung sperrt
  Prüfungen sonst.
- **Browser**: Chrome, Firefox, Edge oder Safari auf dem Desktop.

## Loslegen

### Fertiges Paket

```bash
# Release entpacken, dann:
node bridge/bridge.mjs
```

Die Bridge nennt eine Adresse samt Kopplungsmerkmal. Im Browser öffnen, Selbstprüfung
abwarten, Einrichtung durchlaufen (Fach- und Lernprofil), loslernen.

### Aus dem Quellstand

```bash
git clone https://github.com/obtFusi/ai-academy.git
cd ai-academy
node bridge/bridge.mjs                # liefert Anwendung und Schnittstelle gemeinsam aus
node bridge/bridge.mjs --no-llm       # nur ansehen, ohne Modellanbindung
```

### Mit einem Agenten einrichten

Wer ohnehin mit einem Agenten arbeitet, gibt ihm [SETUP-AGENT.md](SETUP-AGENT.md).
Das ist ein Einrichtungsauftrag mit maschinell prüfbarer Abnahmeliste — der Agent ist
erst fertig, wenn jeder Punkt nachgewiesen ist. Für Störungen gibt es
[TROUBLESHOOT-AGENT.md](TROUBLESHOOT-AGENT.md).

### Hinter einem eigenen Webserver

Der Webbereich ist `public/`. Die Anwendung ermittelt ihren Schnittstellenpfad
dokumentrelativ, also `<basis>/api/` — dieser Pfad muss an die Bridge weitergereicht
werden. `data/` liegt strukturell außerhalb des Webbereichs und darf nie erreichbar sein.

## Was enthalten ist

Zehn Phasen und ein Abschluss: Fundament, Verbote, Einstufung, Pflichten, Transparenz,
Universalmodelle, Aufsicht, Randwissen, Ländermodul Österreich, Auslegung.

310 geprüfte Kernfragen, Fachgespräche mit vorgegebenem Sachverhalt, zweiteilige
Kapitelprüfungen (ohne und mit Verordnungstext), eine Abschlussprüfung aus geschlossenem
Teil und Fallarbeit, verteilte Wiederholung mit Behaltensstufen, ein Kompetenzbild über
achtzehn benannte Fähigkeiten und ein Erhaltungsbetrieb nach bestandener Prüfung.

![Fristen im Zeitverlauf](docs/screenshots/einheit-fristen.webp)

## Aufbau

| Verzeichnis | Inhalt |
|---|---|
| `public/` | Anwendungsgerüst — der einzige Webbereich |
| `app/` | Engine: Steuerung, Aufgaben, Widgets, Dialog, Wiederholung, Auswertung |
| `content/` | Lerninhalte als Daten; Schema in [content/SCHEMA.md](content/SCHEMA.md) |
| `bridge/` | Abhängigkeitsfreier Dienst: liefert die Anwendung aus, spricht mit dem Modell |
| `tutor/` | Erzeugung der Anweisungen; für Prüfungen ohne Notizen und Verlauf |
| `tools/` | Prüfwerkzeuge, Modultests, Paketbau |
| `docs/` | Zweckbestimmung, Bedrohungsmodell, Risiken, Herleitung der Bestehensgrenze |

Der Tutor ist **Erklärer und Bewerter auf Basis mitgelieferter Quellen — niemals selbst
Rechtsquelle**. Jede rechtliche Aussage trägt eine Fundstelle; unbelegte Behauptungen
des Modells werden unterdrückt oder sichtbar gekennzeichnet.

## Prüfen und Mitwirken

```bash
npm run test:unit      # Modultests
npm run test:content   # Schema, Fundstellen, Zahlen und Daten
npm run test:all
```

Einzelheiten in [TESTING.md](TESTING.md). Für Beiträge gilt
[CONTRIBUTING.md](CONTRIBUTING.md) — für Inhalte mit Rechtsbezug strenger als für Code:
Ohne Fundstelle kommt eine Aussage nicht durch die Schema-Prüfung.

Schwachstellen bitte nicht über öffentliche Meldungen, sondern nach
[SECURITY.md](SECURITY.md).

## Rechtlicher Hinweis

Wie die Inhalte geprüft wurden — und wo die Grenzen des Verfahrens liegen — steht in
[docs/PRUEFPROZESS.md](docs/PRUEFPROZESS.md).

Die Lerninhalte sind eine redaktionelle Arbeitskonsolidierung beider Amtsblatttexte —
keine amtliche konsolidierte Fassung und keine Rechtsberatung. Jedes Inhaltsobjekt trägt
Rechtsgrundlage und Status. Der Rechtsstand ändert sich; der Ablauf dafür steht in
[UPDATE-PROZESS.md](UPDATE-PROZESS.md).

## Lizenz

Programmcode unter [Apache-2.0](LICENSE), Lerninhalte und Bildmaterial unter
[CC BY 4.0](LICENSE-CONTENT). Zitate aus dem Amtsblatt der Europäischen Union sind
gemeinfrei und mit Quellenangabe frei verwendbar.
