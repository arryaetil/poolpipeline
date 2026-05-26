# BackyardAI

Een AI-aangedreven tuinvisualisatietool voor installateurs en aannemers. Voer een adres in, kies een product (zwembad, tuinhuis of zonnepanelen), en het systeem genereert automatisch een gepersonaliseerde visualisatie van de tuin op dat adres.

De tool haalt een satellietfoto op, analyseert het perceel via AI, maakt 3D renders vanuit vier richtingen via Google Photorealistic 3D Tiles, selecteert de beste hoek, en bewerkt de afbeelding met AI om het gekozen product toe te voegen.

## Screenshot

_Schermafbeelding volgt na eerste live demo._

## Installatie

```bash
git clone <repo-url>
cd poolpipeline
npm install
cp .env.example .env
# Vul je API-sleutels in .env in
node server.js
```

Open `http://localhost:3000` in je browser.

## Environment variables

| Variabele | Beschrijving | Vereist |
|---|---|---|
| `MAP_PROVIDER` | Geocoding-provider (`mapbox` standaard, `google` alleen legacy) | Nee |
| `MAPBOX_TOKEN` | Mapbox token voor geocoding en satellietbeelden | Ja |
| `MAX_API_CALLS_PER_DAY` | Harde daglimiet voor externe geocoding calls (standaard: `100`) | Nee |
| `API_MIN_INTERVAL_MS` | Minimale pauze tussen externe geocoding calls (standaard: `1000`) | Nee |
| `API_USAGE_TIMEZONE` | Timezone voor daglimiet-reset (standaard: `Europe/Amsterdam`) | Nee |
| `GOOGLE_KEY` | Alleen nog nodig als `MAP_PROVIDER=google` legacy wordt gebruikt | Nee |
| `OPENROUTER_KEY` | OpenRouter API-sleutel (Claude voor analyse en beeldbewerking) | Ja |
| `PORT` | Serverpoort (standaard: `3000`) | Nee |
| `SKIP_VIDEO` | Videogeneratie overslaan (`true` / `false`, standaard: `true`) | Nee |

## Kosten per run

| Stap | Geschatte kosten |
|---|---|
| Mapbox geocoding + satellietfoto | afhankelijk van Mapbox plan/usage |
| Google 3D Tiles (4 renders) | ~$0.10 |
| Claude analyse (2 calls) | ~$0.05 |
| AI beeldbewerking | ~$0.04 |
| Videogeneratie (uitgeschakeld) | $0.00 |
| **Totaal** | **~$0.20 per adres** |

## Demo modus

Zet de "Demo modus" toggle aan om een eerder gegenereerd resultaat te laden zonder de pipeline te draaien. Handig als internetverbinding traag is tijdens een presentatie.

## Tests

```bash
npm test
```

Veilige geocoding smoke test, met maximaal 5 adressen:

```bash
npm run test:geocoding
```
