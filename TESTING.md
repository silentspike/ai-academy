# Prüfstrecke

> Stand: Die Ebenen A und B laufen. Die Ebenen C bis E entstehen gerade; dieser
> Abschnitt wird mit ihnen fortgeschrieben. Was hier steht, ist ausgeführt und
> nachgewiesen — nicht geplant.

## Warum diese Aufteilung

Ein Lernwerkzeug für ein Rechtsgebiet hat zwei Fehlerklassen, die unterschiedlich
geprüft werden müssen: Der Stoff kann falsch sein, und die Bedienung kann kaputt
sein. Die erste Klasse fangen Schema- und Quellenprüfungen ab, die zweite nur eine
echte Bedienung im Browser.

Dazu kommt eine dritte, unangenehme Klasse: Ein Bauteil ist gebaut, geprüft und
funktioniert — ist aber über die Oberfläche gar nicht erreichbar. Solche Lücken
findet kein Modultest. Deshalb prüft die Bedienstrecke nicht gegen eine Liste von
Fällen, sondern zählt selbst alle bedienbaren Elemente je Ansicht und schlägt fehl,
wenn eines nie betätigt wurde.

## Ebenen

| Ebene | Was geprüft wird | Braucht | Läuft in der Prüfstrecke |
|---|---|---|---|
| **A — Modul** | Engine-Logik ohne Oberfläche | nichts | ja |
| **B — Inhalt** | Schema, Pflichtfelder, Fundstellen, Zahlen und Daten | nichts | ja |
| **C — Bedienung** | vollständige Bedienung im Browser, Bildvergleich | Browser, gestubbtes Modell | ja |
| **D — Modell** | Freitextbewertung, Fachgespräch, Einspruch mit echtem Modell | Modellzugang | nein, nur örtlich |
| **E — Maßstab** | Bewertungsmaßstab gegen festbewertete Musterantworten | Modellzugang | nein, nur örtlich |

Die Trennung zwischen C und D ist keine Bequemlichkeit: In der Prüfstrecke gibt es
keinen Modellzugang, und Zugangsschlüssel sind ausgeschlossen. Ebene C prüft deshalb
den vollständigen Bedienweg mit einem vorhersagbaren Ersatzmodell — einschließlich
der vier realen Fehlerbilder, die im Betrieb tatsächlich aufgetreten sind
(Text nach der Antwort, zwei Antwortobjekte, unmaskierte Anführungszeichen,
Zeitüberschreitung). Ebene D prüft örtlich, dass das echte Modell dieselben Formate
bedient.

## Befehle

```bash
# Ebene A — Modultests
node tools/engine-tests.mjs          # Quiz, Widgets, Leitner, Varianten
node tools/gamification-tests.mjs    # Punkte, Stufen, Abzeichen, Wochenziel
node tools/exam-tests.mjs            # Prüfungen, Sperren, schwere Fehler, Nachschulung
node tools/onboarding-tests.mjs      # Einrichtung, Machbarkeitsrechnung
node tools/erhaltung-tests.mjs       # Erhaltungsbetrieb

# Ebene B — Inhaltsprüfungen
node tools/validate-content.mjs      # Schema und Pflichtfelder
node tools/check-questions.mjs       # Zahlen, Daten und Fundstellen gegen die Fristenmatrix
node tools/legal-audit.mjs "Art. 6"  # welche Inhalte hängen an welcher Vorschrift
```

Nachgewiesener Stand: 132 Modultests, 310 von 310 Fragen ohne Befund im
Skript-Abgleich, Schema-Prüfung ohne Fehler.

## Was ein Nachweis ist

| Gilt | Gilt nicht |
|---|---|
| Befehl ausgeführt, Ausgabe vorhanden | „Code gelesen, sieht richtig aus" |
| Bildschirmaufnahme angesehen | Zeilennummern zitiert |
| Messwert erhoben | „Muster ist umgesetzt" |
| Prüflauf mit konkretem Ergebnis | Quelltextdurchsicht ohne Ausführung |

Der Ausgangszustand jeder Zusage ist **ungeprüft**. Kein Befehl bedeutet ungeprüft,
und ungeprüft ist nicht dasselbe wie bestanden.

## Fenstergröße

Bildschirmaufnahmen und Bildvergleiche laufen bei **1920 × 1026**. Das entspricht
einem maximierten Browserfenster auf einem Bildschirm mit 1920 × 1200 abzüglich der
Systemleisten und der Browserleisten.

Wer nur `--start-maximized` setzt, misst weiterhin bei 1280 × 720 — der voreingestellte
Wert wird dadurch nicht abgelöst. Nötig ist zusätzlich `viewport: null`
beziehungsweise eine feste Vorgabe. Ein Wächter bricht jeden Lauf ab, bevor bei
falscher Größe eine einzige Aufnahme entsteht. Der Grund ist unangenehm konkret:
Sämtliche früheren Gestaltungsfreigaben dieses Projekts liefen versehentlich bei
1280 × 720, also auf zwei Dritteln der tatsächlichen Breite.

## Bei Rechtsänderungen

Eine Änderung der Rechtslage ist kein gewöhnlicher Beitrag. Sie entzieht betroffenen
Fragen den Prüfstatus, bindet vorhandene Ergebnisse an einen überholten Stand und
verlangt einen erneuten Maßstabslauf. Der Ablauf steht in `UPDATE-PROZESS.md`.
