# Threat-Model: Local Bridge & App

> Gate-−1-Dokument (Plan §5.4-Härtung, §9, Review-2 P0-11). Verbindliche Sicherheitsanforderungen für `bridge/bridge.mjs` und die App. Jede Anforderung wird in §10 (Plan) als beobachtbares Verhalten verifiziert.

## 1. Schutzgüter

1. **OAuth-Sessions** der CLIs (Konto-Missbrauch, Kosten) — API-Keys existieren im Produkt nicht (Direktive 2026-07-25)
2. **Lernstand & Transcripte** in `data/` (Personendaten, §DATENSCHUTZ-ROLLENMATRIX)
3. **Bewertungs-Integrität** (Prüfungen dürfen nicht manipulierbar/verzerrbar sein)
4. **System des Nutzers** (die Bridge startet lokale Prozesse — darf nie zum RCE-Vektor werden)

## 2. Angreifer-/Fehlermodelle

| ID | Szenario | Weg |
|---|---|---|
| T1 | Bösartige Webseite im selben Browser ruft die lokale Bridge auf | DNS-Rebinding, CSRF-artige fetch-Aufrufe auf 127.0.0.1 |
| T2 | Fremdes lokales Dokument (file:/data:-Origin `null`) spricht die Bridge an | CORS-Fehlkonfiguration (`Origin: null` erlaubt) |
| T3 | LLM-Ausgabe enthält aktiven Inhalt | unbereinigtes `innerHTML` → XSS im App-Kontext |
| T4 | Prompt-Injection in Bewertungs-Pfaden | Nutzer-Notizen/Profil-Freitexte in summativen Prompts |
| T5 | Lokale Konfiguration beeinflusst den Prüfer | CLAUDE.md/AGENTS.md/globale Instruktionen im CLI-Arbeitsverzeichnis |
| T6 | Key-/Datenleck über Hilfskanäle | /health, Logs, Diagnose-Export, Fehlermeldungen |
| T7 | Ressourcen-Missbrauch | ungebremste Requests → Abo-Kontingent leer / DoS lokal |
| T8 | Shell-Injection über Bridge-Parameter | String-Interpolation in Kommandos |
| T9 | Datenverlust bei Bewertungsaufruf | Absturz/Timeout vernichtet Prüfungsantwort |
| T10 | Webroot-Fehlkonfiguration | data/, Keys, Bridge-Interna über HTTP abrufbar |

## 3. Verbindliche Kontrollen

| Kontrolle | Adressiert | Umsetzung |
|---|---|---|
| **Loopback-only**: Bridge bindet ausschließlich 127.0.0.1 | T1 | `server.listen(port, '127.0.0.1')`; kein 0.0.0.0 |
| **Pairing-Token**: beim Start erzeugt, in die ausgelieferte App injiziert; jeder API-Request trägt es; Requests ohne/mit falschem Token → 403 | T1, T2 | zufälliges Token pro Lauf; nie in URL (Header) |
| **Same-Origin-Architektur**: Bridge served die App selbst; App und API eine Origin; kein `Access-Control-Allow-Origin: null`, kein Wildcard | T2 | Static-Serving von public/; exakte Origin-/Host-Prüfung |
| **Host-Header-Prüfung** gegen DNS-Rebinding | T1 | nur `127.0.0.1:<port>`/`localhost:<port>` akzeptiert |
| **LLM-Ausgabe = untrusted**: nie unbereinigt in `innerHTML`; textContent bzw. Sanitizer; CSP mit engem `connect-src`/`script-src` | T3 | App-weit; CSP-Header von der Bridge gesetzt |
| **Summative Prompt-Isolation**: getrennte Prompt-Builder; summativ = Frage+Rubrik+Antwort, sonst nichts | T4 | tutor/prompts.mjs (Builder ohne Notizen-Parameter); Prompt-Log-Inspektion |
| **Umgebungs-Isolation summativer CLI-Aufrufe**: leeres Arbeitsverzeichnis, globale Instruktionen deaktiviert | T5 | eigenes Temp-Workdir pro Aufruf; CLI-Flags/Env gegen Instruktions-Ladung |
| **Executable-Whitelist**: feste Liste (claude, codex) mit festen Argument-Mustern; keine Shell-Interpolation (spawn mit Array-Args, nie sh -c mit Nutzerdaten) | T8 | bridge.mjs |
| **Secret-Hygiene**: Keys nur aus Env/Config-Datei (chmod 600); nie in /health, Logs, Exporten, Fehlermeldungen | T6 | Redaktions-Layer vor jedem Log/Response |
| **Limits**: Request-Größe, Timeout, Rate (Queue: 1 LLM-Anfrage zur Zeit + Backlog-Deckel) | T7 | bridge.mjs Request-Queue |
| **Transaktionale Sicherung**: summative Antwort wird VOR dem LLM-Aufruf persistiert; Fehler → `incomplete_pending_retry`, Versuch nicht verbraucht | T9 | Store-Write vor Aufruf; expliziter Retry-Endpunkt |
| **Webroot-Trennung**: nginx-Symlink zeigt NUR auf public/; data/, bridge/, tutor/ außerhalb; Verifikation per curl → 404 | T10 | Infrastruktur + §10-Test |

## 4. Bewusste Nicht-Kontrollen (dokumentiert)

- **Kein Schutz gegen den Nutzer selbst** (Anti-Cheat/Proctoring abgewählt — Plan #18): Der Nutzer kann seinen eigenen Lernstand editieren; es gibt kein fremdes Gut zu schützen.
- **Kein Ausfall-Fallback** (Plan #25): Verfügbarkeits-Annahme des Auftraggebers; nur Datenintegrität (T9) wird geschützt, nicht Verfügbarkeit.
- **Kein Netzwerk-Hardening über Loopback hinaus** (keine TLS auf 127.0.0.1): lokaler Einzelplatz-Betrieb.
