# Sicherheit

## Schwachstellen melden

Melden Sie vermutete Schwachstellen **nicht über öffentliche Issues**, sondern über
die private Meldefunktion von GitHub:

**Repository → Security → Report a vulnerability**

Bitte geben Sie an: betroffene Version oder Commit, Betriebsart (Bridge direkt oder
hinter einem Webserver), Schritte zur Reproduktion und die aus Ihrer Sicht mögliche
Auswirkung. Ein Nachweis in Form eines minimalen Reproduktionsfalls hilft sehr.

### Reaktionszeiten

| Schritt | Zusage |
|---|---|
| Eingangsbestätigung | innerhalb von 5 Werktagen |
| Erste Einschätzung | innerhalb von 10 Werktagen |
| Behebung oder Zeitplan | abhängig vom Schweregrad, Rückmeldung in jedem Fall |

Dies ist ein privat gepflegtes Projekt ohne Servicevertrag. Die Zusagen sind ernst
gemeint, aber es gibt keine Rufbereitschaft.

## Was in den Geltungsbereich fällt

Das Programm läuft vollständig auf dem Rechner der Nutzerin oder des Nutzers. Es gibt
keinen betriebenen Dienst, kein Nutzerkonto und keine zentrale Datenhaltung. Relevant
sind daher vor allem:

- **Die Bridge** (`bridge/bridge.mjs`) — bindet ausschließlich an die lokale
  Rückschleife, verlangt ein beim Start erzeugtes Kopplungsmerkmal, prüft die
  Herkunft jeder Anfrage exakt, begrenzt Größe, Dauer und Rate und ruft ausschließlich
  fest hinterlegte ausführbare Dateien mit fest hinterlegten Argumenten auf. Es gibt
  keine Auswertung durch eine Shell.
- **Behandlung der Modellantworten** — Ausgaben des Sprachmodells gelten als nicht
  vertrauenswürdige Daten und werden nie ungeprüft als Markup eingefügt.
- **Trennung von Daten und Auslieferung** — Lernstände, Profile und Protokolle liegen
  strukturell außerhalb des ausgelieferten Verzeichnisses und sind über HTTP nicht
  erreichbar.
- **Protokolle** — werden bereinigt geschrieben; Antworttexte erscheinen nicht im
  Klartext, und der Zustandsbericht enthält kein Geheimnis.

## Was nicht in den Geltungsbereich fällt

- Schwachstellen in den verwendeten Kommandozeilenwerkzeugen oder beim Anbieter des
  Sprachmodells — bitte dort melden.
- Angriffe, die vollen Zugriff auf das Benutzerkonto voraussetzen: Wer lokal
  Dateien schreiben kann, kann das Programm ohnehin verändern.
- Der Umstand, dass Freitexte an den Anbieter des verbundenen Modells übertragen
  werden. Das ist die bewusste Bauweise; die Oberfläche weist an jedem Freitextfeld
  darauf hin.
- Fehler in Lerninhalten. Die gehören in ein reguläres Issue, nicht in eine
  Sicherheitsmeldung.

## Zugangsdaten

Das Programm verarbeitet **keine Schlüssel für Programmierschnittstellen**. Der Zugang
zum Sprachmodell läuft ausschließlich über die Anmeldung der jeweiligen
Kommandozeilenanwendung. Ein Eingabefeld für Schlüssel existiert nicht, und die
Prüfstrecke lehnt die Wiedereinführung entsprechender Umgebungsvariablen ab.

Sollten Sie dennoch irgendwo ein Geheimnis in diesem Repository finden, ist das ein
Fehler — bitte melden Sie ihn über den oben genannten Weg.

## Unterstützte Versionen

Gepflegt wird jeweils der Hauptzweig. Es gibt keine Rückportierung in ältere Stände.
