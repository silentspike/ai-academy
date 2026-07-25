# DESIGN-SYSTEM — AI-Act-Akademie

> Verbindliche Design-Referenz (Plan §6.3). JEDE UI-Komponente wird gegen dieses Dokument
> gebaut und in Screenshot-Reviews dagegen geprüft. Änderungen nur mit Begründung + Changelog.
> Art Direction: **„Premium Dark + verspielte Momente"** — Register 1 (Lern-/Prüfinhalte):
> Linear/Stripe-Klasse, ruhig, präzise. Register 2 (Belohnung/Charaktere): darf ausbrechen.
>
> **VISUELLE LEITREFERENZ (Gate 2a, User-gewählt): `assets/design-referenz-final.png`** —
> bei jedem Widerspruch zwischen Text und Referenzbild gewinnt das Referenzbild.

## 1. Farb-Token

Alle Farben NUR über CSS-Custom-Properties (`app/styles.css`). Keine Hex-Werte in Komponenten.

| Token | Wert | Verwendung |
|---|---|---|
| `--bg` | `#0b0d13` | Seiten-Grund (v2: tiefer, wärmer-neutral) |
| `--bg-deep` | `#060810` | Icon-Rail, Vertiefungen, Code-Flächen |
| `--panel` | `#10131c` | Karten, Panels (Layer 1) |
| `--panel-2` | `#161a26` | erhöhte Flächen (Layer 2: Hover, Popover, Pills) |
| `--line` | `#20242f` | Hairline-Borders |
| `--line-strong` | `#2e3342` | aktive Borders |
| `--text` | `#e8eaf0` | Primärtext |
| `--dim` | `#9aa1af` | Sekundärtext |
| `--faint` | `#5d6472` | Tertiär (Meta, Platzhalter) |
| `--emerald` | `#3ddc97` | Erfolg, Fortschritt, Lernkurve, „richtig", Radar |
| `--gold` | `#e8b04b` | **v2 NEU — warmer Sekundär-Akzent**: Wortmarke, Ziele, Aufhol-Zahlen, Highlights |
| `--violet` | `#8b7cf6` | XP, aktive Auswahl (Phase-Pill), Kern-Zahlen |
| `--cyan` | `#22d3ee` | zurückgenommen: Fokus-Ringe, Links, vereinzelte Glows |
| `--amber` | `#fbbf24` | Warnung, „teilweise", ⚠-Rechtsstand |
| `--red` | `#f87171` | Fehler, „falsch", Critical Error |
| `--grad-brand` | `linear-gradient(100deg,#f0c674,#e8874b 60%,#8b7cf6 130%)` | **v2: warme Wortmarke** (gold→orange, violetter Ausklang) |
| `--grad-reward` | `linear-gradient(90deg,var(--gold),var(--violet))` | Register-2-Momente |

**Risikofarb-Logik (produktweit fix):** verboten `--red` · Hochrisiko `#fb923c` (`--risk-high`) · Transparenzpflicht `--amber` · minimal/keine spezifische Pflicht `--emerald` · GPAI `--violet`. Diese fünf Farben bedeuten IMMER Risikostufe.

**Beherrschungs-Skala der Heatmap (v2, aus Referenz):** Sehr sicher `--emerald` · Sicher `#8fd977` (hellgrün) · Unsicher `--gold`/amber · Kritisch `--red` · **Ungelernt `#3a3f4c` (neutral-grau)** — mit Legende unter der Landkarte, Summenzeile („119 Artikel") und Stand-Datum.

**Kontrast-Minima:** Fließtext ≥ 7:1 (`--text` auf `--panel` = 12.6:1 ✓), Sekundärtext ≥ 4.5:1 (`--dim` auf `--panel` = 5.6:1 ✓). Statusfarben nie als einziger Informationsträger (immer + Icon/Text).

## 2. Typografie

WOFF2 lokal aus `assets/fonts/` (280 KB gesamt, kein CDN). Fallback-Stacks pflicht.

| Rolle | Font | Gewichte | Verwendung |
|---|---|---|---|
| Display | **Space Grotesk** | 400/500/700 | H1–H3, Zahlen (XP, Score, Timer), Level-Titel, Zeremonien |
| Text/UI | **Inter** | 400/500/600/700 | Fließtext, Buttons, Formulare, Navigation |
| Mono | **JetBrains Mono** | 400/700 | Artikel-Zitate, Fundstellen-Badges, Rechtsstand-Label — „Rechtstext als Quellcode" (#5-Didaktik) |

**Skala** (rem; Basis 16px): `--fs-xs .75` · `--fs-sm .85` · `--fs-base 1` · `--fs-lg 1.15` · `--fs-xl 1.4` · `--fs-2xl 1.8` · `--fs-hero 2.6`. Zeilenhöhe: Text 1.65, Headings 1.2, Mono 1.55. Fließtext-Maß: max 68ch.

## 3. Spacing & Layout

4px-Grid: `--sp-1 .25rem` bis `--sp-8 4rem` (0.25/0.5/0.75/1/1.5/2/3/4). Karten-Padding `--sp-5` (1.5rem). Karten-Radius `--r-card 14px`, Kontrollen `--r-ctl 8px`, Pills `999px`.
Layout (v2, aus Referenz): **Doppel-Sidebar** — schmale **Icon-Rail 64px** (`--bg-deep`; oben Logo-Monogramm, darunter Bereichs-Icons: Home, Lernen, Statistik, Badges, Dialoge, Erhaltung; unten Einstellungen) + **Inhalts-Sidebar 300px** (Wortmarke im Brand-Verlauf, Sektions-Label in gesperrten Versalien z. B. „LERNSTRUKTUR", Phasen-Liste). **Phasen-Zeilen-Anatomie:** abgeschlossen = grüner Ring mit Häkchen · aktiv = Pill mit Nummern-Kreis, violettem Hintergrund-Hauch und Chevron rechts · offen = leerer Ring; unter jeder Zeile eine dünne Fortschritts-Unterlinie; „Wiederholung" mit Zähler-Badge, „Examen" mit Schloss, abgetrennt durch Hairline.
**Topbar (v2):** jede Metrik als eigene Pill (`--panel-2`, Icon + Wert): XP (violett) · Level+Titel · Wochenziel mit **5-Punkte-Anzeige** (gefüllt/leer) · Zieltermin (gold) · Rechtsstand als Mono-Pill; rechts Suche, Benachrichtigung, Nutzer-Avatar.
**Karten-Header-Anatomie (v2):** kleines Duotone-Icon + Titel (Display-Font) + Untertitel (`--dim`, klein) links · Kebab-Menü (⋮) und ggf. Info-Icon/Zeitraum-Dropdown rechts.
Hauptbereich als 2-Spalten-Dashboard-Grid (breite Spalte ~62 %, schmale ~38 %). Desktop-first ≥ 1280px (Mobile bewusst abgewählt, #31).
**Flächentiefe statt Schatten-Stapel:** Layer über Farbe (`--panel` → `--panel-2`) + 1px-Border; genau EIN Glow-Schatten für fokussierte Elemente: `0 0 0 1px var(--line-strong), 0 0 24px -8px rgba(34,211,238,.25)`.

## 4. Komponenten-Zustände

Jede interaktive Komponente definiert ALLE Zustände: `default · hover · active · focus-visible · disabled · locked` (Prüfungs-Schloss) — plus fachliche Zustände `correct · partial · wrong · critical`.

| Zustand | Regel |
|---|---|
| hover | Border → `--line-strong`, Fläche → `--panel-2`, Transition 120ms |
| focus-visible | 2px Outline `--cyan`, Offset 2px — NIE outline:none ohne Ersatz |
| disabled | Opacity .45, cursor not-allowed |
| locked | Schloss-Icon + `--faint`; Tooltip nennt die Freischalt-Bedingung |
| correct | Border+Icon `--emerald`, Fläche `rgba(52,211,153,.08)` |
| partial | analog `--amber` |
| wrong | analog `--red`; niemals Konfetti/Belohnungssprache |
| critical | `--red` + gefüllter Banner „Kritischer Fehler" + Erklärlink |

Bewertungs-Label (Art.-50-Pflicht, §5.0): an JEDER Bewertung, Mono, `--faint`:
`deterministisch` bzw. `LLM-unterstützt · <modell> · Rubrik <version> · Rechtsstand 27.7.2026`.

## 5. Motion-Timing

Nur `transform` + `opacity`. `prefers-reduced-motion: reduce` → alle Nicht-Feedback-Animationen aus, Feedback instant.

| Kurve | Wert | Einsatz |
|---|---|---|
| `--ease-out` | `cubic-bezier(.16,1,.3,1)` | Einblendungen, Panels |
| `--ease-snap` | `cubic-bezier(.34,1.56,.64,1)` | Antwort-Feedback („satisfying snap"), Badges |
| `--ease-lin` | `linear` | Fortschrittsringe, Timer |

Dauern: Micro (Hover) **120ms** · Feedback-Snap **240ms** · Panel/Route **320ms** · Staggered-Reveal **60ms/Element, max 8** · Zeremonie GROSS **1200ms** Choreo · Sitzungsstart-Sequenz **≤1500ms**, überspringbar (Klick/Esc/Enter).
Hintergrund (Layer, §6.3): Aurora-Blobs 90–140s Loop, translate/scale ≤ 6%, opacity ≤ .5 — „kaum merklich".

## 6. Icon-Konstruktionsregeln (eigenes Set, Duotone-Glow)

Generiert aus `tools/build-icons.mjs` (SSOT: `ICONS`-Definition dort) — Konsistenz per Skript erzwungen.

- ViewBox **24×24**, Grid 2px, Eckenradien 2px
- **Kontur:** `stroke: currentColor`, width **1.6**, round caps/joins, `fill: none`, Klasse `.ico-line`
- **Duotone-Fläche:** Sekundärform mit `fill: currentColor`, **opacity .18**, Klasse `.ico-fill`
- Farbe kommt IMMER vom Kontext (`currentColor`); aktive Zustände: Elternelement setzt `--emerald`/`--cyan` + Glow `filter: drop-shadow(0 0 6px rgba(52,211,153,.45))` via Klasse `.ico-glow`
- Zustands-Varianten (aktiv/inaktiv/gesperrt) über CSS, NICHT über separate SVG-Dateien
- Benennung: `icon-<domäne>-<name>.svg` (`nav-` `st-` `act-` `fach-`)

## 7. Bild-Style-Manual (KI-Illustrationswelt, Register 2)

Produktion: Higgsfield — Entwürfe **Nano Banana 2**, final **Nano Banana Pro 2K**; Charakter-Konsistenz via Referenzbild (erst Figur etablieren → Freigabe → Varianten als Image-to-Image).

**Basis-Prompt (jede Generierung beginnt so):**
> Stylized semi-realistic digital illustration with a subtle comic edge, confident clean shapes, soft cel shading. Dark tech atmosphere: deep navy-black background (#0a0e17 family), rim lighting in emerald green (#34d399) and cyan (#22d3ee), gentle glow accents, no pure black. Professional, modern, slightly playful — never childish, never corporate-stocky. No text, no watermark.

- **Charaktere (6–8, Archetypen §5.2):** Hüftbild vor neutral-dunklem Hintergrund, 3/4-Ansicht, Blick zur Kamera; realistische Büro-Kleidung; Ausdrucksvarianten: neutral / skeptisch / zufrieden / nachbohrend. Vielfalt in Alter/Geschlecht/Erscheinung über die Crew hinweg. Format 3:4, 2K.
- **Phasen-Cover (10):** szenische Illustration ohne Personen-Fokus, je ein Leitmotiv (z. B. P2 Verbote: rote Barriere-Lichtlinien; P3 Einstufung: leuchtende Weggabelung), Emerald/Cyan-Licht + je EINE Akzentfarbe aus der Risikofarb-Logik wo passend. Format 16:9, 2K.
- **Badges (~20):** emblematisch, rundes Medaillon auf dunklem Grund, zentrales Symbol, metallisch-glühende Ränder (Emerald→Cyan-Verlauf), KEIN Text im Bild. Format 1:1, 1K.
- **Hero (1):** Weite Komposition „Lernreise durch Rechts-Architektur" — abstrakte Paragraphen-/Ebenen-Landschaft in Aurora-Licht. 21:9, 2K.

**Nicht erlaubt:** EU-Logos/Flaggen-Imitate, echte Personen-Ähnlichkeit, Text im Bild, Fotorealismus (Verwechslungsgefahr), grelle Vollfarben außerhalb der Palette.

**Coach-/Dialog-Karte (v2, aus Referenz):** Avatar-Portrait links (rund oder weich freigestellt), Sprechblase rechts in `--panel-2` mit persönlicher, kurzer Ansprache; Signatur-Zeile kursiv („— Dein Coach" / Charaktername); Zeremonien-/Motivationstexte dürfen hier Register 2 nutzen (Herz, Konfetti-Momente). Charakter-Illustrationen: semi-realistischer painterly-Grad wie die Coach-Figur der Referenz (etwas realistischer als die Erstentwürfe, weiterhin klar illustriert, dunkle Palette + Emerald-Rim-Light).

**Material-Regeln (v2.1, aus Iterations-Loop mit User):** Jede Karte/Pill trägt einen subtilen vertikalen Verlauf (`--grad-card`: oben heller, unten dunkler) + 1px-Top-Innenlicht (`inset 0 1px 0 rgba(255,255,255,.045)`) — nie flache Füllungen. Radar-Fläche als Glas-Verlauf (hell-türkis oben → tiefes transparentes Grün), Kontur mit hellem Verlaufs-Stroke. **Artikel-Landkarte ist ein MOSAIK**: variable Kachelgrößen (1×1 dominant, vereinzelt 2×1/1×2/2×2, große Kacheln nie am Gruppenende), Per-Kachel-Verlauf mit Innenlicht, Kapitel-Cluster farblich homogen mit ~18 % Ausreißern, 2 ausgewogene Reihen über die volle Kartenbreite. **Fonts final:** Brand = Fraunces (Wortmarke; A-Monogramm kursiv), Display-Zahlen = Poppins, UI/Kartentitel = Inter (600), Zitate = JetBrains Mono, Signaturen = Caveat. Charaktere painterly (07-coach als Stil-Anker).

**Layout- und Kompositions-System (v3.0, aus externem Design-Review — VERBINDLICH):**
- **App-Gehäuse:** gesamtes Interface in einer Shell (margin 12, radius 16, Navy-Radial + vertikaler Verlauf, feiner Rahmen, Innenlicht, Tiefenschatten zum Seitenhintergrund) — nichts schwebt frei
- **Grid:** Rail 64px über volle Höhe · Topbar 58px über Sidebar UND Content (eine durchgehende Zeile!) · Sidebar 260px · Dashboard-Grid 1.22fr/1fr (≈55:45), Reihen 1.12fr/.88fr, rechte untere Zelle 104px + Rest — alle Karten enden auf gemeinsamer Grundlinie, keine Leerflächen
- **Topbar-Module:** einheitlich 40px hoch, Radius 10, gleiche Border-Helligkeit, Top-Aufhellung, tabellarische Ziffern; Suche/Glocke als runde 38px-Controls mit Fläche+Border; Avatar 36px mit Ring + violettem Umgebungs-Glow
- **Rail:** aktiv = VIOLETT (Verlaufs-Fläche + linke Leucht-Markierung) — Gold bleibt Zielen/Lernwerten vorbehalten
- **Sidebar kompakt:** Zeilen 12.5px/450, Ringe 1.25rem dezent, Unterlinien 1.5px/78%, Micro-Labels 10px/600/.14em Versalien
- **Coach-Karte:** freigestellte Figur (Cutout, drop-shadows warm+dunkel) überlappt die Karte; Text als Glas-Panel (blur 16, rgba-Fläche) — nie Bild-im-Rechteck
- **Landkarte:** 13px-Zellen, 3.5px-Gaps, fließende Formationen mit space-evenly über die Kartenfläche, je 2 Farbnuancen pro Stufe, Lichtkante pro Zelle
- **Radar:** 4 feine Ringe, Glow-Unterlinie + 1.4px-Hauptlinie mit Vertikal-Verlauf, Halo-Punkte, Soll-Linie kontrastarm gestrichelt
- **Typo-Staffelung:** Logo 25px/600/-0.025em (Verlauf #987cff→#ba8fd8→#e5b45f) · Card-Title 16px/650/-0.012em · Subtitle 12px rgba(218,226,240,.48) · Sidebar 12.5px/450 · Micro 10px/600/.14em
- **Palette entsättigt:** mint #65d8b2 · safe #9dcc9b · amber #e1ad58 · coral #d97568 · unknown #414956 · violet #8a70ef; Hintergrund-Raster ≤2.5% + Maske + Noise-Layer

---
Changelog:
- v3.1 (2026-07-24) — zweites externes Review umgesetzt: App-Gesamthöhe ≤800px (Shell 768px, vertikal zentriert); Topbar als durchgehendes Instrumentenband (Status-Module wachsen, keine Lücke vor Rechtsstand); Lernkurve datenkorrekt (W+4 = 68 %, Soll ≈ 90 %); aktive Phase VIOLETT (Gold nur Ziele/Kennzahlen); Sidebar-Footer (Wiederholung/Examen unten via margin-top:auto); Coach-Porträt 57 % + Panel-Überlappung + Fade-Maske; Fällige Karten zweistufig (Titel oben, Kennzahlen unter Labels, 3-Karten-Stapel); Landkarte ≥85 % einheitliche Zellen mit Durchmischungs-Sprenkeln; Radar gestaffelt (5 Ringe, Soll-Kontur .42, Glow 7px/.15, Linie 1.5); Rail-Aktiv subtil (Linie+Halo statt gefülltem Quadrat); SVG-Markenlogo; Text-Token aufgehellt (--dim #949dac, --faint #68717f)
- v3.0 (2026-07-24) — externes Design-Review vollständig umgesetzt (P0: Grid/Gehäuse/Coach/Grundlinien; P1: Material/Dichte/Radar; P2: Typo/Farben/Mikrodetails); Preview v4 als Referenz-Implementierung
- v2.1 (2026-07-24) — Material-Regeln aus 7 visuellen Iterations-Loops gegen die Leitreferenz (Karten-Gradients, Glas-Radar, Mosaik-Landkarte, Poppins/Fraunces/Caveat, painterly Coach)
- v2.0 (2026-07-24) — **User-Referenzbild als Leitreferenz übernommen (Gate 2a):** wärmere Palette (Gold-Sekundärakzent, warme Wortmarke, Violett für Auswahl/XP, Cyan zurückgenommen), Doppel-Sidebar (Icon-Rail + Inhalts-Sidebar), Phasen-Zeilen-Anatomie mit Häkchen/Pill/Chevron, Topbar-Pills mit Punkte-Wochenziel, Karten-Header-Anatomie, gruppierte Heatmap mit 5-Stufen-Beherrschungs-Skala, Chart-Detailgrad (Soll-Konturen, Wert-Badges, Achsen), Fällige-Karten-Zahlendesign, Coach-Karten-Anatomie, painterly-Grad der Charaktere.
- v1.0 (2026-07-24) — Initialfassung aus Plan §6.3 + Design-Runden.
