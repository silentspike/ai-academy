# TROUBLESHOOT-AGENT.md — Reparatur-Contract („Support ohne Support", Plan §5.6)

> **An den reparierenden LLM-Agent:** Der Nutzer gibt dir einen Diagnose-Export
> (JSON aus der App: Self-Check → „Diagnose exportieren") und/oder eine
> Fehlerbeschreibung. Diagnostiziere systematisch entlang dieser Tabelle;
> es gelten die Sicherheitsregeln aus SETUP-AGENT.md unverändert.

## Diagnose-Export lesen

Der Export enthält: `selfcheck` (letzte Ergebnisse), `health` (Bridge-Zustand),
`storageBackend`, `appVersion`, `errors` (letzte Konsolenfehler), KEINE Lernstände
im Klartext, KEINE Schlüssel. Beginne immer mit: Welcher Self-Check-Punkt ist rot?

## Symptom → Prüfung → Fix

| Symptom | Prüfung (Kommando) | Wahrscheinlicher Fix |
|---|---|---|
| App lädt nicht (Browser-Fehlerseite) | `curl -s http://127.0.0.1:<port>/api/health` | Bridge nicht gestartet → `node bridge/bridge.mjs`; Port-Konflikt → anderen Port: `--port 0` (zufällig) |
| „Bridge nicht erreichbar" in der App | Browser-Konsole: 403? | Falscher/fehlender Pairing-Token → App über die von der Bridge GEDRUCKTE URL öffnen (Token in der URL) |
| „kein LLM verbunden" | `claude --version; codex --version` | CLI fehlt → installieren; danach `auth-check` (SETUP V5) |
| auth-check `ok:false` | CLI direkt testen: `claude -p "Sag OK"` | CLI-Login abgelaufen → CLI-Login-Flow erneut ausführen |
| Prüfungen gesperrt: „Frontier" | `/api/health` → Feld `model` | Nicht unterstütztes Modell konfiguriert → auf Claude/GPT-Frontier wechseln (docs/INTENDED-PURPOSE.md §3) |
| Prüfungen gesperrt: HTTP 423 | `cat data/store/summative_lock.json` | Gold-Set-Sperre aktiv → `node tools/gold-set-run.mjs` GRÜN laufen lassen (Modell-/Promptwechsel prüfen) |
| Bewertung hängt/Timeout | `tail data/log/bridge-log.jsonl` | Ein LLM-Aufruf zur Zeit (Queue) — laufenden Lauf abwarten; bei Dauer-Hang Bridge neu starten (Antwort bleibt transaktional erhalten, „Bewertung neu anstoßen") |
| Lernstand weg (Safari) | Backend im Self-Check: `localStorage`? | Safari räumt localStorage → Export/Import-Routine nutzen; besser Bridge-Store |
| Import schlägt fehl | JSON-Datei valide? `python3 -m json.tool export.json` | Beschädigten Export nicht importieren; letzten funktionierenden nehmen |
| systemd-Dienst startet nicht (Linux) | `systemctl --user status ai-act-akademie` | Pfade in der Unit an Installationsort anpassen; `systemctl --user daemon-reload` |

## Eskalation

Wenn nichts greift: (1) `node bridge/bridge.mjs` im Vordergrund starten und die
ERSTE Fehlerzeile sichern, (2) Diagnose-Export + diese Zeile + OS/Node-Version
zusammenstellen, (3) dem Nutzer als Issue-Text übergeben. Keine Spekulation als
Tatsache ausgeben; ungelöste Punkte klar als ungelöst benennen.
