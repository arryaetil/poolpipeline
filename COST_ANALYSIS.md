# Kostenplaatje — PoolPipeline Schaal

*Gegenereerd: 18 mei 2026*

---

## Aannames per run

| Component | Detail | Tokens |
|---|---|---|
| Satelliet JPEG (1024×1024) | Claude: ~6.500 tokens | Gemini: ~1.000 tokens |
| Cesium render PNG (1280×720) | Claude: ~9.700 tokens | Gemini: ~1.500 tokens |
| ViewSelect input | 1 satelliet + 4 renders | Claude: ~45.700 / Gemini: ~7.000 |
| Opties gegenereerd | 6 parallelle Gemini edits | — |

---

## Scenario A — Budget 2D ⭐⭐

**Mapbox 2D oblique renders, alles Gemini Flash**

| Stap | Model | Kosten/run |
|---|---|---|
| 6× Renders (Mapbox 2D oblique) | Mapbox Static API | $0.004 |
| Satelliet analyse | Mapbox Static API | $0.001 |
| Geocoding | Google Maps | $0.005 |
| Analysis | Gemini 2.0 Flash ($0.10/M) | $0.001 |
| ViewSelect | Gemini 2.0 Flash ($0.10/M) | $0.005 |
| 6× Edit | Gemini 2.5 Flash Image ($0.30/M) | $0.033 |
| **Totaal** | | **~$0.049 (~€0.045)** |

*Geen Cesium Ion kosten. Lagere visuele kwaliteit (2D satelliet i.p.v. 3D renders).*

---

## Scenario B — Balanced ⭐⭐⭐

**2D Mapbox renders, Gemini 2.5 Flash analyse, Flash Image edits**

| Stap | Model | Kosten/run |
|---|---|---|
| 6× Renders (Mapbox 2D oblique) | Mapbox Static API | $0.004 |
| Satelliet + geocoding | Google/Mapbox | $0.006 |
| Analysis | Gemini 2.5 Flash ($0.30/M) | $0.003 |
| ViewSelect | Gemini 2.5 Flash ($0.30/M) | $0.014 |
| 6× Edit | Gemini 3.1 Flash Image ($0.50/M) | $0.041 |
| **Totaal** | | **~$0.068 (~€0.062)** |

*Betere analyse dan A, nog steeds 2D renders. Goede prijs/kwaliteit voor hoog volume.*

---

## Scenario C — Smart 3D ⭐⭐⭐⭐

**3D Cesium renders, Gemini Flash analyse, Gemini 3 Pro Image edits**

| Stap | Model | Kosten/run |
|---|---|---|
| 4× Cesium 3D renders | Google Tiles API (~$6/1000 sessies) | $0.024 |
| Satelliet + geocoding | Google/Mapbox | $0.006 |
| Analysis | Gemini 2.0 Flash ($0.10/M) | $0.001 |
| ViewSelect | Gemini 2.0 Flash ($0.10/M) | $0.005 |
| 6× Edit | Gemini 3 Pro Image ($2/M) | $0.162 |
| **Totaal** | | **~$0.198 (~€0.18)** |

*3D render kwaliteit, slimme kostenbesparing op analyse/viewselect. Aanbevolen voor schaal.*

---

## Scenario D — Premium (huidig) ⭐⭐⭐⭐⭐

**3D Cesium renders, Claude Opus 4.5 overal**

| Stap | Model | Kosten/run |
|---|---|---|
| 4× Cesium 3D renders | Google Tiles API | $0.024 |
| Satelliet + geocoding | Google/Mapbox | $0.006 |
| Analysis | Claude Opus 4.5 ($5/M) | $0.055 |
| ViewSelect | Claude Opus 4.5 ($5/M) | $0.232 |
| 6× Edit | Gemini 3 Pro Image ($2/M) | $0.162 |
| **Totaal** | | **~$0.479 (~€0.44)** |

*Hoogste kwaliteit analyse en beeldkeuze. Huidige setup.*

---

## Schaaltabel (variabele kosten, excl. vaste infra)

| Runs/dag | Runs/maand | A Budget 2D | B Balanced | C Smart 3D | D Premium |
|---|---|---|---|---|---|
| 10 | 300 | €14 | €19 | €54 | €132 |
| 50 | 1.500 | €68 | €93 | €270 | €660 |
| 100 | 3.000 | €135 | €186 | €540 | €1.320 |
| 250 | 7.500 | €338 | €465 | €1.350 | €3.300 |
| 500 | 15.000 | €675 | €930 | €2.700 | €6.600 |
| 1.000 | 30.000 | €1.350 | €1.860 | €5.400 | €13.200 |

---

## Vaste maandelijkse kosten

| Service | Laag volume | Middel volume | Hoog volume |
|---|---|---|---|
| **Hosting** (Railway/Render) | €20/maand | €50/maand | €100-200/maand |
| **Cesium Ion** (alleen 3D) | Free (demo) | €25/maand (Indie) | €450/maand (Pro) |
| **Mapbox** | Free tier | €50/maand | €200+/maand |
| **Google Maps** | Free tier ($200 credit) | €30/maand | €100+/maand |

---

## Aanbeveling per use case

| Use case | Scenario | Reden |
|---|---|---|
| Demo / pilot | **D Premium** | Beste kwaliteit, kosten zijn bijzaak |
| Startende klanten (< 50/dag) | **C Smart 3D** | 3D kwaliteit, 60% goedkoper dan D |
| Hoog volume (> 500/dag) | **B Balanced** | 2D is acceptabel, enorme kostenbesparing |
| Bulk / batch campagnes | **A Budget 2D** | Maximale marge, snelste verwerking |

---

## Migrate van D naar C (quick win)

Enkel twee modelwijzigingen in de code:

```
analysis.js:    anthropic/claude-opus-4.5  →  google/gemini-2.0-flash-001
viewSelect.js:  anthropic/claude-opus-4.5  →  google/gemini-2.0-flash-001
```

**Resultaat:** €0.44 → €0.18 per run (-60%), zelfde 3D render en edit kwaliteit.
