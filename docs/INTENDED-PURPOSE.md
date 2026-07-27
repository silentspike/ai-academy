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

**Nutzungsbeschränkung:** Die Akademie ist nicht bestimmt für den Einsatz durch
Bildungseinrichtungen oder Arbeitgeber zur Bewertung von Personen — auch nicht zur Steuerung
eines Lernprozesses innerhalb eines Programms einer solchen Einrichtung. Ihre Ergebnisse
(Scores, Lernnachweise, Kompetenzprofile) dürfen nicht als Grundlage für Beschäftigungs-,
Ausbildungs- oder Zugangsentscheidungen über natürliche Personen verwendet werden.

*Die Reihenfolge ist nicht beliebig:* Der erste Satz benennt das Kriterium, an das der AI Act
anknüpft (Zweckbestimmung und Einsatzkontext), der zweite eine Folge davon. Frühere Fassungen
nannten nur die Folge — das las sich, als sei erst die Entscheidung über eine Person der
Auslöser. Anhang III Nr. 3 lit. b greift bereits eine Stufe davor.

**Änderungsvorbehalt:** Sobald Arbeitgeber, Bildungseinrichtungen oder Zertifizierer die Ergebnisse einsetzen wollen, liegt eine geänderte Zweckbestimmung vor — dann ist eine **neue Produkt- und Compliance-Bewertung erforderlich** (insb. gegen Anhang III Nr. 3 und Nr. 4 der VO 2024/1689).

## 2. AI-Act-Selbsteinordnung

**Einordnung:** Die Akademie ist eine selbstbestimmt genutzte, nicht formale Lern-App ohne
akkreditierten Abschluss. Sie fällt nach hiesiger Auslegung **nicht** unter Anhang III Nr. 3
der VO (EU) 2024/1689. Die Begründung — und ihre Grenze — im Einzelnen:

**Wortlaut.** Anhang III Nr. 3 lit. b erfasst „KI-Systeme, die bestimmungsgemäß für die
Bewertung von Lernergebnissen verwendet werden sollen, einschließlich des Falles, dass diese
Ergebnisse dazu dienen, den Lernprozess natürlicher Personen in Einrichtungen oder Programmen
aller Ebenen der allgemeinen und beruflichen Bildung zu steuern". **Der Hauptsatz nennt keine
Einrichtung.** Die Akademie bewertet Lernergebnisse. Vom Wortlaut des Hauptsatzes allein ist
sie also nicht ohne Weiteres ausgenommen — das ist offen auszusprechen, statt es zu glätten.

**Systematik.** Die übrigen Buchstaben derselben Nummer knüpfen ausdrücklich an Einrichtungen
an: lit. a „Zuweisung natürlicher Personen zu Einrichtungen aller Ebenen der allgemeinen und
beruflichen Bildung", lit. c „im Rahmen von oder innerhalb von Einrichtungen", lit. d ebenso.
Die Überschrift der Nummer lautet „Allgemeine und berufliche Bildung".

**Erwägungsgrund 56** trägt die Einordnung am deutlichsten. Er begründet die Einstufung damit,
dass die erfassten Systeme „in der allgemeinen oder beruflichen Bildung eingesetzt werden" und
„über den Verlauf der Bildung und des Berufslebens einer Person entscheiden und daher ihre
Fähigkeit beeinträchtigen können, ihren Lebensunterhalt zu sichern". Genau dieses Merkmal
fehlt hier: Eine Person lernt freiwillig für sich; über nichts wird entschieden, kein Zugang
gewährt oder verwehrt, kein Niveau festgestellt, das irgendwo gilt.

**Was daraus folgt.** Die Einordnung hängt nicht am Produkt, sondern an seiner Verwendung.
Sie trägt, solange die Zweckbestimmung aus Abschnitt 1 eingehalten wird — und sie fällt, sobald
eine Bildungseinrichtung oder ein Arbeitgeber die Akademie einsetzt, um Personen zu bewerten.
Dafür braucht es keine Personalentscheidung: Nach lit. b genügt es, dass die Ergebnisse den
Lernprozess in einem Programm einer Einrichtung steuern. Die Nutzungsbeschränkung ist deshalb
keine Empfehlung, sondern das, was die Einordnung überhaupt trägt.

**Verbindlichkeitsstatus dieser Einordnung** (Quellenhierarchie, Plan §4.1 #9): Sie stützt sich
auf Verordnungstext (Stufe 1) und Erwägungsgrund, nicht auf eine verbindliche Behördenentscheidung
und nicht auf offizielle Leitlinien der Kommission zu Anhang III. Erscheinen solche Leitlinien,
ist diese Einordnung erneut zu prüfen — Wiedervorlage im Update-Prozess.

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
