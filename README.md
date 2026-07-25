# AI-Act-Akademie

Interaktives Lerntraining für den **EU AI Act** — VO (EU) 2024/1689 in der Fassung
der VO (EU) 2026/1744 („Digital Omnibus"), **Zielrechtsstand 27.7.2026** — mit
eingebettetem LLM-Tutor, Spaced Repetition, Kompetenzmodell, Bosskampf-Fachgesprächen
und Prüfungssystem mit validiertem Fragenpool.

> **Zweckbestimmung:** persönliche, freiwillige, nicht formale Weiterbildung.
> NICHT bestimmt für Personalentscheidungen, formale Abschlüsse oder akkreditierte
> Zertifizierungen — Details: `docs/INTENDED-PURPOSE.md`. Ergebnisse sind ein
> persönlicher, unbeaufsichtigter Lernnachweis, kein Zertifikat.

## Voraussetzungen

- **Node.js ≥ 20** (einzige Laufzeit — die Bridge ist dependency-frei)
- Ein **Frontier-LLM-Abo**: Claude (Pro/Max, via `claude`-CLI) oder
  ChatGPT (via `codex`-CLI) — Zugang ausschließlich über Abo/OAuth der CLI;
  API-Keys werden bewusst NICHT unterstützt. Andere Modelle ebenfalls nicht —
  der Self-Check sperrt Prüfungen sonst hart (`docs/INTENDED-PURPOSE.md` §3).
- Browser: Chrome, Firefox, Edge oder Safari (Desktop).

## Weg 1 — Release-Paket (empfohlen)

1. Release-ZIP laden und entpacken.
2. Starten: `scripts/start.sh` (Linux/macOS) bzw. `scripts/start.bat` (Windows) —
   oder direkt `node bridge/bridge.mjs`.
3. Die Bridge druckt eine URL mit Pairing-Token — im Browser öffnen.
4. Self-Check → Onboarding (Fach- und Lernprofil, Personalisierung) → lernen.

Der Fortschritt liegt lokal (Bridge-Store `data/` bzw. Browser-localStorage mit
Export/Import als Safari-Sicherheitsnetz). Nichts verlässt deinen Rechner außer
den Tutor-Anfragen an DEINEN LLM-Anbieter.

## Weg 2 — Abo + Bridge (Power-User / Agent-Setup)

Du hast ein Claude- oder ChatGPT-Abo und einen LLM-Agenten (z. B. Claude Code):
Gib deinem Agenten die Datei **`SETUP-AGENT.md`** — sie ist ein
Setup-&-Verify-Contract mit maschinell prüfbarer Checkliste (V1–V10).
Der Agent richtet Bridge + CLI-Zugang ein und ist erst fertig, wenn alles ✓ ist.
Reparaturfälle: **`TROUBLESHOOT-AGENT.md`** + Diagnose-Export aus dem Self-Check.

## Weg 3 — Entwickler

```bash
git clone <repo> && cd ai-act-akademie
node bridge/bridge.mjs            # served App + API same-origin auf 127.0.0.1
node tools/validate-content.mjs   # Content-Schema-Gate
node tools/engine-tests.mjs && node tools/exam-tests.mjs   # Unit-Tests
```

Architektur: dependency-freies Vanilla-JS-Frontend (`app/`), Content als
JSON-Daten mit Claims-Register (`content/`, Schema: `content/SCHEMA.md`),
Local Bridge (`bridge/bridge.mjs`) als einziger LLM- und Storage-Transport.
Rechts-Updates: **`UPDATE-PROZESS.md`** (Registerabfragen via
`tools/legal-audit.mjs`). Bewertungsmaßstab-Wache: `tools/gold-set-run.mjs`
(Auto-Sperre bei Drift). Releases: `tools/build-release.mjs`.

## Was drin ist

10 Phasen + Finale (Fundament → Verbote → Einstufung → Pflichten → Transparenz →
GPAI → Aufsicht → Randwissen → Ländermodul AT → Auslegung), 310 validierte
Kernfragen (Statusprozess mit dokumentierter Eigenprüfung), Bosskampf-Fachgespräche
mit deterministischer Szenario-Engine, zweiteilige Kapiteltests, Abschlussexamen
(Closed-Book-Teil + Open-Book-Capstone), Leitner-Wiederholung mit
Retention-Stufen, Kompetenz-Radar (K01–K18), Erhaltungsmodus nach Bestehen.

## Rechtlicher Hinweis

Die Lerninhalte sind eine redaktionelle **Arbeitskonsolidierung** beider
Amtsblatt-Texte — keine amtliche konsolidierte Fassung und keine Rechtsberatung.
Jedes Content-Objekt trägt Rechtsgrundlage und Status (`konsolidiert-2026-07-27` /
`at-vollzug-offen`); LLM-Ausgaben sind niemals Rechtsquelle.
