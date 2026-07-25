# Datenfluss- und DSGVO-Rollenmatrix

> Gate-−1-Dokument (Plan §5.0, §9). Ersetzt die frühere Formulierung „null DSGVO-Verantwortung" durch eine belegte Prüfung pro Betriebsmodus.
> Grundsatz: Die Verantwortlichkeits-Rolle folgt funktional daraus, wer Zwecke und wesentliche Mittel einer Verarbeitung festlegt — nicht aus dem Satz „läuft lokal".

## 1. Erfasste Datenkategorien (produktweit)

| Kategorie | Beispiele | Personenbezug |
|---|---|---|
| Profil | Name (optional), Organisationstyp, Job-Rolle, Lernziele/Termine | ja (Nutzer) |
| Lernstand | Antworten, Scores, Leitner-Zustände, Retention-Stufen, XP | ja (Verhaltensdaten des Nutzers) |
| Notizen | Freitext des Nutzers | ja; potenziell Dritte, wenn Nutzer sie erwähnt |
| Tutor-Transcripte | Dialoge, Freitext-Antworten, Bewertungen | ja |
| Einsprüche | Begründungen + Zweitbewertungen | ja |
| Technik-Logs | Modellversion, Latenz, Fehler (redigiert, ohne Klartext-Antworten per Default) | gering |
| Exporte/Snapshots | JSON-Export des Lernstands; Diagnose-Export | ja (aggregiert) |

## 2. Rollenmatrix pro Betriebsmodus

| # | Betriebsmodus | Datenflüsse | Rolle Jan (Autor) | Rolle Nutzer/Org | LLM-Anbieter |
|---|---|---|---|---|---|
| 1 | **Jan lokal mit Bridge** | Browser ↔ lokale Bridge ↔ claude-CLI ↔ Anthropic. Persistenz: `data/` lokal | Betroffener UND Verantwortlicher seiner eigenen Verarbeitung (Haushaltsnähe; eigene Daten) | — | Anthropic verarbeitet Prompt-Inhalte gemäß deren Bedingungen (Consumer-Abo) |
| 2 | **Share ohne LLM-Verbindung** (nur deterministische Teile) | alles lokal im Browser (localStorage); KEIN externer Fluss | **Keine Rolle**: Jan erhält keine Daten, kein Rückkanal existiert | Nutzer verarbeitet eigene Daten lokal | keiner |
| 3 | **Share mit Abo/CLI/Key** | Browser ↔ lokale Bridge des Nutzers ↔ CLI/API des Nutzer-Kontos | **Keine Rolle**: Jan ist reiner Software-Autor ohne Zugriff, ohne Konto-Beziehung, ohne Telemetrie | Nutzer ist Verantwortlicher seiner Verarbeitung; bei beruflicher Nutzung ggf. seine Organisation | Anbieter des NUTZER-Kontos (Anthropic/OpenAI) gemäß dessen Vertrag |
| 4 | **Diagnose-Export** | Nutzer erzeugt lokal eine JSON-Datei und gibt sie SELBST weiter (z. B. an seinen eigenen Agent) | Keine Rolle, solange der Export nicht an Jan gesendet wird; WENN ein Nutzer ihn Jan schickt (Support-Fall), wird Jan für diese Datei Verantwortlicher (Zweck: Fehleranalyse; Löschung nach Abschluss) | Nutzer entscheidet über Weitergabe | — |
| 5 | **Support-/GitHub-Issue-Fall** | Nutzer postet Inhalte in ein Issue | Jan wird Verantwortlicher für im Issue enthaltene Personendaten (Zweck: Support); Hinweis in Issue-Vorlage: keine Lernstände/Transcripte/Personendaten posten, Diagnose-Export vorher redigieren | Nutzer | GitHub als Plattform |

## 3. Produktseitige Pflichten (alle Modi)

- **Transparenz:** Datenschutz-Hinweis vor erster LLM-Interaktion (was geht wohin); Banner an Freitextfeldern: keine echten Personendaten Dritter / Organisations-Interna eingeben.
- **Datenminimierung:** Es wird nur erhoben, was die Lernfunktion braucht; keine Telemetrie, kein Rückkanal, keine Konten.
- **Löschfunktion:** Vollständiges Zurücksetzen des Lernstands (data/ bzw. localStorage) per Knopfdruck; Exporte löscht der Nutzer selbst (Hinweis im Export-Dialog).
- **Aufbewahrung:** Lokale Daten leben bis zur Löschung durch den Nutzer; die App erzwingt keine Cloud-Kopien.
- **Export-Warnung:** Der JSON-Export enthält personenbezogene Lerndaten — Warnhinweis beim Export („enthält deine Antworten und Notizen — gib die Datei nur weiter, wenn du das willst").
- **Log-Redaktion:** Prompt-Logs per Default ohne Klartext-Antworten; Vollmitschnitt nur bewusst aktivierbar (Debug) und im Diagnose-Export redigiert.
- **Keine Secrets in Datenpfaden:** Es existieren keine Provider-API-Keys im Produkt (nur CLI-OAuth, Direktive 2026-07-25); das Pairing-Token erscheint nie in localStorage, Export, Diagnose-Export oder Log.

## 4. Später-Prüfpunkt

Bei institutionellem Einsatz (Organisation rollt die Akademie für Mitarbeiter aus) ändern sich Zweck und Rollen → dann prüfen: Verantwortlichkeit der Organisation, Auftragsverarbeitung, Erforderlichkeit einer Datenschutz-Folgenabschätzung. Dieser Fall ist von der Zweckbestimmung (docs/INTENDED-PURPOSE.md) derzeit ausgeschlossen.
