# Wie die Inhalte geprüft wurden

Dieses Dokument beschreibt, auf welchem Weg die rechtlichen Aussagen dieses Trainings
entstanden sind und geprüft wurden. Es ist die Erklärung hinter den Feldern
`legal_basis`, `legal_status` und `review_protocol`, die jedes Inhaltsobjekt trägt.

Der Text ist bewusst nüchtern und benennt auch die Grenzen des Verfahrens. Wer den
Stoff im Beruf verwendet, soll wissen, worauf er sich stützt.

## Ausgangslage

Am 24.7.2026 wurde die Verordnung (EU) 2026/1744 im Amtsblatt veröffentlicht; sie
ändert die Verordnung (EU) 2024/1689 an über vierzig Stellen und trat am 27.7.2026 in
Kraft. Eine amtliche konsolidierte Fassung lag zum Zeitpunkt der Erstellung nicht vor.

Daraus folgt die Bezeichnung, die dieses Projekt durchgehend verwendet: Die Inhalte
beruhen auf einer **redaktionellen Arbeitskonsolidierung** beider Amtsblatttexte. Das
ist keine amtliche konsolidierte Fassung und wird nirgends als solche bezeichnet.

## Rangfolge der Quellen

Bei Widersprüchen gewinnt die höhere Stufe, und der Widerspruch wird sichtbar gemacht
statt stillschweigend aufgelöst:

1. Amtsblatt und sonstige verbindliche Rechtsakte
2. Delegierte Rechtsakte und Durchführungsrechtsakte
3. Nationale Gesetze
4. Verbindliche Behördenakte
5. Offizielle unverbindliche Leitlinien
6. Entwürfe
7. Sekundärliteratur
8. **Ausgabe eines Sprachmodells — niemals eine Rechtsquelle**

Stufe 8 ist der Grund, warum der Tutor seine rechtlichen Aussagen als Behauptungen mit
Quellenkennung ausgibt und die Anwendung prüft, ob diese Kennungen existieren und zum
Rechtsstand passen. Unbelegte Artikel- oder Fristenangaben werden unterdrückt oder
sichtbar als nicht verifiziert gekennzeichnet.

## Zeitliche Dimensionen

Fast jede Aussage im AI Act hat ein „ab wann", und oft mehr als eines. Deshalb tragen
Inhaltsobjekte neben der Fundstelle Felder für Geltungsbeginn, Übergangsregel,
Altbestandsregel, Auslöser einer wesentlichen Änderung, Akteurs- und Systembezug sowie
ein Ablaufdatum.

Praktische Folge für Prüfungsaufgaben: Ein Fall, der kein Datum für Inverkehrbringen
oder Inbetriebnahme nennt, hat keine eindeutige Lösung. „Für eine belastbare Einstufung
fehlen Informationen" ist dann die richtige Antwort — und wird als solche gewertet.

## Der Freigabeweg einer Prüfungsfrage

Eine Frage darf erst in Kapitelprüfungen und Abschlussprüfung erscheinen, wenn sie
diesen Weg vollständig durchlaufen hat:

| Stufe | Bedeutung |
|---|---|
| `agent_generated` | erzeugt, noch ohne Belegung |
| `source_linked` | jede richtige **und jede falsche** Antwortmöglichkeit ist gegen eine konkrete Fundstelle begründet, im Datensatz hinterlegt |
| `reviewed` | zwei getrennte Prüfdurchgänge bestanden (siehe unten) |
| `approved_summative` | freigegeben für Prüfungen |
| `retired_or_revised` | zurückgezogen oder überarbeitet |

Eine beanstandete Frage verliert den Status sofort. Ebenso verlieren ihn alle Fragen,
die von einer Rechtsänderung betroffen sind — das ist der Kern des Ablaufs in
`UPDATE-PROZESS.md`.

## Die zwei Prüfdurchgänge

**Erster Durchgang — maschineller Abgleich.** Ein Skript prüft jede zähl- und datierbare
Angabe gegen das Quellenregister: Artikelnummern, Absätze, Fristen, Fundstellenformate.
Das objektiviert alles, was objektivierbar ist. Ausführbar mit
`node tools/check-questions.mjs`; der aktuelle Stand ist 310 von 310 Fragen ohne Befund.

**Zweiter Durchgang — inhaltliche Zweitdurchsicht.** Getrennt vom Erstellungsvorgang und
zeitlich davon abgesetzt wird jede Frage gegen den Volltext beider Amtsblatttexte
gelesen. Geprüft wird, ob die Aussage trägt, ob die falschen Antwortmöglichkeiten
tatsächlich falsch sind und ob die Begründung die Fundstelle wirklich stützt.

Jede Frage verweist über `review_protocol` auf den Abschnitt des Prüfprotokolls, unter
dem sie behandelt wurde, etwa `eigenpruefung#block31`.

## Grenzen des Verfahrens — ausdrücklich

Dies ist eine **Eigenprüfung**, keine unabhängige Freigabe. Es gab weder eine
juristische Vier-Augen-Kontrolle durch eine zweite Person noch eine Prüfung durch ein
zweites Modell. Das war eine bewusste Entscheidung des Auftraggebers; hier wird sie
benannt statt beschönigt.

Was das Verfahren leistet: Es macht alles Zählbare objektiv prüfbar und entkoppelt die
inhaltliche Durchsicht vom Erstellungsvorgang. Was es nicht leistet: die Unabhängigkeit,
die eine externe fachliche Freigabe hätte.

Die Prüfprotokolle selbst sind interne Arbeitsdokumente und nicht Teil dieses
Repositories. Sie enthalten Bezüge, die nicht veröffentlicht werden. Die Kennungen in
`review_protocol` bleiben trotzdem sinnvoll: Sie zeigen, dass jede Frage einem konkreten
Prüfabschnitt zugeordnet ist, und sie erlauben eine gezielte Nachfrage.

## Was Sie selbst prüfen können

```bash
node tools/validate-content.mjs        # Schema und Pflichtfelder
node tools/check-questions.mjs         # Zahlen, Daten, Fundstellen
node tools/legal-audit.mjs "Art. 6"    # welche Inhalte hängen an welcher Vorschrift
node tools/legal-audit.mjs --status at-vollzug-offen
```

Der letzte Aufruf ist besonders aufschlussreich: Er listet alle Aussagen, deren
nationale Umsetzung noch offen ist. Diese Stellen sind in der Oberfläche eigens
gekennzeichnet, weil sie sich am ehesten ändern.

## Wenn Sie einen Fehler finden

Bitte über die Meldevorlage „Inhaltlichen oder rechtlichen Fehler melden". Nötig sind
Fundstelle in der Anwendung, die beanstandete Aussage und ein Beleg mit Artikel, Absatz
und Fassung. Solche Meldungen haben Vorrang vor allem anderen: Eine falsche
Rechtsaussage in einem Lernwerkzeug wird zu einer falschen Auskunft im Beruf.
