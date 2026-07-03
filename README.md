# Sixth Mass Extinction Watch

A public dashboard tracking a curated watchlist of imperilled species alongside
global wildlife-abundance trends and biomass scale — with **measured facts kept
visually separate from modelled projections** (solid vs dashed), and no fake
"days until extinction" countdown.

**Live:** deployed on Vercel · **Design:** ported from a Claude Design mockup.

## Sections

- **Trends** — a per-taxonomic-class abundance index (1970 = 100) computed from
  ~32k population time series in the Living Planet Database 2024. Scrub any year;
  toggle groups and the projection. Honest caveat: this unweighted cut runs
  milder than WWF/ZSL's *weighted* global figure (−73%, 1970–2020), and that's
  explained inline.
- **Watchlist** — 24 species, status synced from the IUCN Red List (API v4),
  photos loaded live from Wikipedia, deep links to Wikipedia / GBIF / IUCN.
  Searchable, filterable and sortable, with an expandable detail per species.
- **Biomass** — global biomass by mass (Bar-On et al. 2018): livestock + humans
  are ~96% of mammal biomass; wild mammals are a rounding error.
- **Sources / Method** — what's measured vs modelled, and the data pipeline.

## Data sources

| Source | Used for |
| --- | --- |
| [IUCN Red List API v4](https://api.iucnredlist.org) | Conservation status, Criterion E, assessment links |
| [Living Planet Database 2024](https://www.livingplanetindex.org) (WWF/ZSL) | Abundance-trend index |
| [GBIF](https://www.gbif.org) | Occurrence / species links |
| [Bar-On et al. 2018 (PNAS)](https://www.pnas.org/doi/10.1073/pnas.1711842115) | Global biomass distribution |
| [Wikipedia REST](https://en.wikipedia.org/api/rest_v1/) | Species photos |

## Develop

```bash
npm install
cp .env.example .env.local     # add your IUCN_TOKEN
npm run dev                    # http://localhost:3000
```

## Refresh the data

```bash
# Put the Living Planet Database public CSV under data/lpi/ (see .gitignore),
# then regenerate the committed JSON:
npm run data
```

This recomputes the LPI trends and re-queries IUCN for every species, writing
`src/data/lpi.json` and `src/data/species.json`.

## Architecture

Next.js (App Router) on Vercel, no database. A build-time pipeline bakes all data
to committed JSON; the `/api/species` serverless route overlays live IUCN status
while keeping the `IUCN_TOKEN` server-side. See [CLAUDE.md](./CLAUDE.md) for the
full design notes, decisions and data quirks.

## Environment

| Var | Purpose |
| --- | --- |
| `IUCN_TOKEN` | IUCN Red List API v4 token. Server-side only. Without it the site serves the build-time snapshot. |

---

*An independent conservation-status monitor. Not affiliated with the
organisations linked above. Figures combine measured records with clearly-marked
modelled projections.*
