# Demo-ready UI — Design Spec
**Datum:** 2026-05-04

## Wat we bouwen

Een volledige make-over van `index.html` naar een premium B2B demo-pagina in liquid glass stijl, plus kleine aanpassingen aan `features.json`, `.env`, `server.js` en een nieuwe `README.md`. De pipeline-logica blijft volledig ongewijzigd.

---

## Design richting

- **Stijl:** Liquid glass / Apple SaaS — `backdrop-filter: blur`, semi-transparante glasspanelen, subtiele borders
- **Kleuren:** `#04101e` achtergrond, `#B8943F` goud accent, wit voor tekst
- **Iconen:** Lucide Icons via CDN (`unpkg.com/lucide@latest`)
- **Typografie:** `-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI"`
- **Taal:** Volledig Nederlands
- **Geen em dashes** in tekst — gewone zinnen

---

## Pagina-indeling (van boven naar beneden)

### Hero sectie
- Eyebrow badge: "AI visualisatie tool voor installateurs en aannemers" (Lucide `sparkles` icon)
- Headline tweelijnig:
  - Regel 1 wit: **Elk adres**
  - Regel 2 goud: **Een warme lead**
- Subtitel: "Genereer een gepersonaliseerde tuinvisualisatie voor elk klantadres en zet prospects om in concrete gesprekken."

### Input kaart (glass)
- Sectielabel gecentreerd: "Voer een klantadres in"
- Groot adresveld, placeholder "Bijv. Kollenberg 12, Sittard"
- Sectielabel gecentreerd: "Kies een product"
- 3 klikbare feature-kaartjes (geen dropdown):
  - `waves` Zwembad
  - `house` Tuinhuis
  - `sun` Zonnepanelen
  - Geselecteerd kaartje krijgt gouden border + glow
- Gouden knop: "Genereer visualisatie" (Lucide `arrow-right`)

### Voortgang kaart (glass, verschijnt na submit)
- Sectielabel gecentreerd: "Voortgang"
- 6 stappen gecentreerd als blok, elk met dot + tekst:
  1. Adres gevonden
  2. Luchtfoto opgehaald
  3. Perceel geanalyseerd
  4. 3D renders gemaakt
  5. Beste hoek geselecteerd
  6. Visualisatie wordt gemaakt...
- Dot states: `dot-done` (groen check), `dot-active` (gouden glow animatie), `dot-pending` (grijs)
- Live updates via bestaande SSE events

### Resultaat kaart (glass, verschijnt na done)
- Sectielabel gecentreerd: "Resultaat"
- Voor/na slider:
  - Links ("Voor"): gekozen 3D render (`render-{chosen_heading}.png`)
  - Rechts ("Na"): AI-bewerkte versie (`edited.png`)
  - "Voor" en "Na" labels in het afbeeldingsvlak als glass pills
  - Gouden handle met Lucide `move-horizontal`
- Twee knoppen: "Download render" (goud) | "Nieuw adres" (glass)

### Divider
- Subtiele lijn met tekst "Meer mogelijkheden"

### Use-case blok (glass)
- Eyebrow: "Schaal dit proces op"
- Titel: "Van één visualisatie naar honderden gekwalificeerde leads"
- 3 use-case kaartjes met gouden icon-wrap:
  1. `map-pin` Slimme postcode-targeting (WOZ-waarde filter)
  2. `sparkles` Gepersonaliseerde renders op schaal
  3. `mail` Kaart op de deurmat of digitale campagne
- Gouden outline CTA-knop: "Ontdek hoe dit werkt voor uw bedrijf"

---

## Demo modus

- Nieuw endpoint `GET /demo-runs` in `server.js`: leest `output/` directory, retourneert folders die een `edited.png` bevatten
- Toggle in de UI (klein, niet opdringerig) — als aan: dropdown met beschikbare runs
- Selecteren laadt direct: `satellite.jpg`, `render-{chosen_heading}.png` als "voor", `edited.png` als "na"
- Pipeline wordt niet gedraaid

### Gekozen hoek opslaan
- Na de `view_select` stap schrijft `server.js` een `chosen.json` naar de output folder: `{ "heading": 180 }`
- Demo modus leest dit bestand om de juiste render te tonen; fallback naar `render-0.png`

---

## Overige wijzigingen

### features.json
- Verwijder: `deck`, `turf`, `pickleball`
- Behoud: `pool`, `adu`, `solar`
- Labels vernederlandsen: "Zwembad", "Tuinhuis", "Zonnepanelen"
- Emojis: 🏊, 🏡, ☀️ (behouden voor intern gebruik, niet zichtbaar in nieuwe UI)

### .env / .env.example
- `SKIP_VIDEO=true` als standaard

### Git commit
- Alle untracked bestanden stagen en committen
- Message: "feat: complete pipeline with demo-ready UI"

### README.md
- Wat het doet, installatie, env vars, kosten per run

---

## Toekomstige uitbreiding (buiten scope)

Postcode-input + WOZ-filtering + batch pipeline als `/batch` endpoint. Past zonder architectuurwijziging in de bestaande Express server. Uitbreidbaar op Railway.

---

## Technische constraints

- Geen wijzigingen aan `pipeline/*.js` bestanden
- Lucide via CDN (geen npm install)
- `backdrop-filter` werkt op Safari, Chrome, Edge en mobiel
- Mobile-friendly (max-width 500px centered layout)
