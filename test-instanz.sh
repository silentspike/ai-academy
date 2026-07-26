#!/bin/bash
# test-instanz.sh — eine zweite Akademie mit eigenem Lernstand.
#
# Warum getrennte Prozesse und nicht umschaltbare Lernstaende in einer Instanz:
# Ein Umschalter entscheidet zur Laufzeit, in welche Datei geschrieben wird, und
# wenn er einmal nicht greift, landet ein Testlauf im echten Lernstand — also
# genau der Schaden, den er verhindern soll. Zwei Prozesse mit getrennten
# Verzeichnissen koennen das nicht: Die Trennung ist strukturell, nicht logisch.
#
#   ./test-instanz.sh                    startet eine Testinstanz
#   ./test-instanz.sh --zuruecksetzen    wirft den Teststand weg und startet neu
#   ./test-instanz.sh --store <pfad>     anderer Ablageort
#   ./test-instanz.sh --kein-browser     Adresse nur ausgeben, nichts oeffnen
#
# Der laufende Betrieb auf Port 8791 bleibt unberuehrt.

set -euo pipefail
cd "$(dirname "$0")"

STORE="${AKADEMIE_TEST_STORE:-$PWD/data-test}"
ZURUECKSETZEN=0
# Browser oeffnen ist fuer den Empfaenger gedacht, der nach dem Doppelklick nicht
# Port und Kopplungsmerkmal abtippen will. Wer die Instanz von aussen steuert —
# playwright-cli, ein Testlauf — bekommt sonst ein zweites Fenster dazu, das
# niemand angefordert hat.
BROWSER=--open
while [ $# -gt 0 ]; do
  case "$1" in
    --zuruecksetzen) ZURUECKSETZEN=1; shift ;;
    --kein-browser) BROWSER=""; shift ;;
    --store) STORE="$2"; shift 2 ;;
    -h|--help) sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unbekannte Option: $1"; exit 2 ;;
  esac
done

STORE="$(realpath -m "$STORE")"

# Schutz vor dem einen Fehler, der wehtut: Der echte Lernstand darf niemals das
# Ziel einer Testinstanz sein — weder direkt noch als uebergeordnetes Verzeichnis.
ECHT="$(realpath -m "${AKADEMIE_STORE:-$PWD/data}")"
if [ "$STORE" = "$ECHT" ] || [ "$STORE" = "${ECHT%/}/store" ] || case "$ECHT" in "$STORE"/*) true;; *) false;; esac; then
  echo "ABBRUCH: $STORE ist der echte Lernstand (oder enthaelt ihn)." >&2
  echo "Eine Testinstanz darf ihn nicht als Ablage verwenden — dafuer gibt es sie." >&2
  exit 1
fi

if [ "$ZURUECKSETZEN" = "1" ] && [ -d "$STORE" ]; then
  echo "Teststand wird verworfen: $STORE"
  rm -rf "$STORE"
fi
mkdir -p "$STORE"

# Eigenes Kopplungsmerkmal, nicht das des Betriebs: Ein durchgereichtes Token
# waere ein gemeinsamer Zustand zwischen zwei Dingen, die getrennt sein sollen.
TOKEN="$(node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))")"

echo
echo "  Testinstanz — eigener Lernstand, eigener Port."
echo "  Ablage:  $STORE"
echo "  Betrieb: unberuehrt (Port 8791, $ECHT)"
echo
echo "  Zum Beenden: Strg+C. Zum Wegwerfen: ./test-instanz.sh --zuruecksetzen"
[ -z "$BROWSER" ] && echo "  Kein Browser wird geoeffnet — Adresse steht unten." 
echo

# Port 0 = das Betriebssystem waehlt einen freien. Kein fester Zweitport, der
# irgendwann mit etwas anderem kollidiert.
BRIDGE_TOKEN="$TOKEN" exec node bridge/bridge.mjs --store "$STORE" --port 0 $BROWSER
