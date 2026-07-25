# SETUP-AGENT.md — Setup-&-Verify-Contract (Plan §5.6, Stufe 3)

> **An den einrichtenden LLM-Agent:** Dieses Dokument ist dein Arbeitsauftrag.
> Richte die AI-Act-Akademie auf diesem Rechner ein und verifiziere JEDEN
> Checklisten-Punkt mit dem angegebenen Kommando gegen den Erwartungswert.
> Du bist erst fertig, wenn alle Pflicht-Punkte ✓ sind.

## Sicherheitsregeln (bindend, v3.2)

1. KEINE privilegierten Befehle (sudo/Admin) ohne Einzelbestätigung des Nutzers.
2. Keine stillen Änderungen an Systemkonfigurationen; jede veränderte Datei
   vorher sichern (`cp X X.bak-akademie`) und dem Nutzer den Rollback nennen.
3. ALLE Kommandos vor Ausführung anzeigen.
4. Keine Firewall-/Proxy-Öffnungen nach extern — die Bridge lauscht NUR auf 127.0.0.1.
5. Keine API-Schlüssel in Chat, Logs oder Protokolle schreiben. Schlüssel nur in
   Umgebungsvariable oder Datei mit Modus 600.
6. Least Privilege: alles als normaler Benutzer; kein root nötig.

## Zielbild

`node bridge/bridge.mjs` läuft, served die App auf einem Loopback-Port,
ein unterstütztes Frontier-CLI (`claude` oder `codex`) ist eingeloggt,
der In-App-Self-Check ist grün.

## Schritte

1. Voraussetzung Node ≥ 20 prüfen (Checkliste V1).
2. Release-ZIP entpacken bzw. Repo clonen; ins Verzeichnis wechseln.
3. LLM-Zugang wählen:
   - Claude-Abo: `claude`-CLI installieren (`npm i -g @anthropic-ai/claude-code`), einloggen.
   - ChatGPT-Abo: `codex`-CLI installieren, einloggen.
   (API-Keys werden bewusst NICHT unterstützt — Zugang nur über Abo/OAuth der CLI;
   gesetzte Provider-Keys ignoriert die Bridge.)
4. Bridge starten: `node bridge/bridge.mjs` — sie druckt die URL mit Pairing-Token.
5. URL im Browser öffnen → Self-Check ausführen.
6. Optional (Linux): systemd-Autostart via `bridge/ai-act-akademie.service` (Vorlage).

## Verify-Checkliste (maschinell prüfbar — Kommando → Erwartungswert)

| # | Prüfpunkt | Kommando | Erwartungswert |
|---|---|---|---|
| V1 | Node-Version ausreichend | `node --version` | Ausgabe beginnt mit `v2` und Major ≥ 20 |
| V2 | Projektdateien vollständig | `node --check bridge/bridge.mjs && echo OK` | `OK` |
| V3 | Frontier-CLI vorhanden | `claude --version \|\| codex --version` | Exit-Code 0, Versionsstring |
| V4 | Bridge startet und antwortet | `node bridge/bridge.mjs & sleep 3; curl -s http://127.0.0.1:8791/api/health` | JSON mit `"ok":true` |
| V5 | CLI-Login aktiv | `curl -s -X POST http://127.0.0.1:8791/api/auth-check -H "X-Bridge-Token: $TOKEN"` | JSON mit `"ok":true` |
| V6 | Probe-Bewertung E2E < 120 s | `time curl -s -X POST http://127.0.0.1:8791/api/grade -H "Content-Type: application/json" -H "X-Bridge-Token: $TOKEN" -d '{"question":"Nennen Sie das Kapitel der Verbote.","rubric":"[{\"krit\":\"Kapitel II\",\"punkte\":1}]","answer":"Kapitel II","kind":"exercise"}'` | JSON mit `"score"`, real < 120 s |
| V7 | App lädt im Browser | `curl -s http://127.0.0.1:8791/ \| grep -c "AI-Act-Akademie"` | ≥ 1 |
| V8 | Persistenz schreibbar | `curl -s -X PUT http://127.0.0.1:8791/api/progress -H "Content-Type: application/json" -H "X-Bridge-Token: $TOKEN" -d '{"setup_probe":true}' && curl -s http://127.0.0.1:8791/api/progress -H "X-Bridge-Token: $TOKEN" \| grep -c setup_probe` | ≥ 1 |
| V9 | Loopback-only (Sicherheit) | `ss -tlnp \| grep 8791` | Bind ausschließlich auf `127.0.0.1` |
| V10 | Kein Secret im Health | `curl -s http://127.0.0.1:8791/api/health \| grep -ciE "key\|token"` | `0` |

`$TOKEN` = der beim Bridge-Start gedruckte Pairing-Token (bzw. `BRIDGE_TOKEN`-Env).
Port kann abweichen — den tatsächlich gedruckten Port verwenden.

**Abbruchregel:** Scheitert ein Punkt nach 3 Reparaturversuchen, dokumentiere
Punkt + Fehlermeldung + versuchte Fixes und übergib an den Nutzer
(TROUBLESHOOT-AGENT.md hilft beim Reparaturfall).
