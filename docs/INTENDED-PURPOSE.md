# Zweckbestimmung & AI-Act-Selbsteinordnung der AI-Act-Akademie

> Gate-−1-Dokument (Plan §5.0, §9). Verbindlich für Produkt, README und Lernnachweis.
> Stand: 2026-07-24 · Zielrechtsstand des Produkts: VO (EU) 2024/1689 idF VO (EU) 2026/1744 (27.7.2026)

## 1. Intended-Purpose-Erklärung (Zweckbestimmung)

Die AI-Act-Akademie ist bestimmt für **persönliche, freiwillige, nicht formale Weiterbildung** zum EU AI Act.

Sie ist **NICHT bestimmt** für:
- Zulassungsentscheidungen jeder Art
- formale Bildungsabschlüsse oder deren Bewertung
- Personalentscheidungen (Einstellung, Beförderung, Kündigung)
- Leistungsbeurteilungen von Beschäftigten
- Recruiting oder Bewerber-Screening
- akkreditierte Zertifizierungen oder deren Vorbereitung mit Nachweisanspruch

**Nutzungsbeschränkung:** Ergebnisse der Akademie (Scores, Lernnachweise, Kompetenzprofile) dürfen nicht als alleinige oder maßgebliche Grundlage für Beschäftigungs-, Ausbildungs-, Zugangs- oder sonstige Entscheidungen über natürliche Personen verwendet werden.

**Änderungsvorbehalt:** Sobald Arbeitgeber, Bildungseinrichtungen oder Zertifizierer die Ergebnisse einsetzen wollen, liegt eine geänderte Zweckbestimmung vor — dann ist eine **neue Produkt- und Compliance-Bewertung erforderlich** (insb. gegen Anhang III Nr. 3 und Nr. 4 der VO 2024/1689).

## 2. AI-Act-Selbsteinordnung

**Einordnung:** Die Akademie ist eine selbstbestimmt genutzte, nicht formale Lern-App ohne akkreditierten Abschluss. Nach der Kommissions-Auslegung zum Hochrisiko-Anwendungsfall „allgemeine und berufliche Bildung" fällt eine solche Anwendung **nicht** unter Anhang III Nr. 3 — im Gegensatz zu institutionell eingesetzten KI-Bewertungen, deren Ergebnisse in formale Beurteilungen einfließen. Die Zweckbestimmung in Abschnitt 1 ist die Grenze, die diese Einordnung trägt; ihre Einhaltung ist Produkt-Pflicht, nicht Empfehlung.

**Transparenzpflichten (Art. 50 VO 2024/1689):** Der LLM-Tutor interagiert unmittelbar mit Menschen. Deshalb gilt produktweit:
- VOR der ersten Tutor-Interaktion informiert die App klar: Es antwortet ein KI-System; genutzter Provider/Adapter; welche Daten übertragen werden; dass LLM-Bewertungen streuen können.
- JEDE Bewertung trägt ein Label: `Bewertungstyp: deterministisch | LLM-unterstützt · Modell · Rubrikversion · Rechtsstand`.
- Deterministische und LLM-generierte/-bewertete Inhalte sind durchgängig unterscheidbar.

**LLM-Rolle:** Das LLM ist Erklärer und Bewerter auf Basis mitgelieferter, versionierter Quellen — **niemals selbst Rechtsquelle** (Rangstufe 8 der Quellenhierarchie, siehe `docs/REVIEW-PROCESS.md`).

## 3. Frontier-Gate-Definition (Auftraggeber-Beschluss, Plan §5.4)

**Unterstützte Modelle:** ausschließlich Frontier-Modelle von **Anthropic (Claude)** und **OpenAI (ChatGPT)** — ausschließlich via `claude`-CLI oder `codex`-CLI (Abo/OAuth; API-Keys werden bewusst nicht unterstützt).

**Durchsetzung (harte Sperre, kein bloßer Hinweis):**
1. Der Self-Check führt Probe-Bewertungen gegen bekannte Musterantworten durch (Mini-Gold-Set).
2. Nicht unterstützte oder durchgefallene Modelle → deutliche Meldung „nicht unterstützt — Ergebnisse wären unzuverlässig" und **Sperre aller summativen Funktionen** (Kapiteltests, Examen, Lernnachweis). 
3. Es gibt keinen Degradations-Modus und keine Warnung-mit-Weiter-Button für summative Funktionen.

**Nicht unterstützt (bewusst, Plan §8):** Google Gemini, lokale Modelle (Ollama etc.), sonstige Anbieter, API-Keys jeder Art (Direktive 2026-07-25: nur Abo/OAuth).

## 4. Lernnachweis-Charakter

Das Abschlussdokument heißt **„Persönlicher Lernnachweis"** und trägt auf der VORDERSEITE:

> Persönlicher, unbeaufsichtigter Lernnachweis. Identität und Prüfungsbedingungen wurden nicht durch eine unabhängige Stelle verifiziert. Teile der Bewertung sind KI-unterstützt. Kein akkreditiertes Zertifikat; nicht für Personal- oder Zulassungsentscheidungen bestimmt.

Kein Element des Dokuments darf kryptografische Sicherung oder Fremdverifikation suggerieren.
