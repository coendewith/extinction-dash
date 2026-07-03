# CLAUDE.md — Sixth Mass Extinction Watch

Working notes for this repo. Updated iteratively as the project evolves — when a
decision, quirk, or lesson comes up, record it here so it isn't rediscovered.

## What this is

A public dashboard — "Sixth Mass Extinction Watch". Two tiers:

1. **Curated top matter** — a hero countdown (Vaquita), a Living Planet Index
   trend chart, and a biomass section (Bar-On 2018). Editorial stance: **keep
   measured facts visually separate from modelled projections** (solid vs
   dashed), and never show a fake "days until extinction" number.
2. **The complete Red List explorer** — every IUCN-assessed animal species
   (~88,400), searchable/filterable/paginated live, ranked by extinction risk,
   with a country/region filter. This is the FIG. 02 section.

Originated as a Claude Design (`.dc.html`) mockup of the 24-species version; grew
into the full-dataset explorer.

## Stack & why

- **Next.js 15 (App Router) + React 19 + TypeScript**, deployed on **Vercel**.
- **Supabase (Postgres) IS used** — for the ~88k-species explorer. That volume
  can't ship to the browser, and the ask was fast filtering, so it's server-side:
  indexed queries + pagination + trigram search over PostgREST. (The earlier
  24-species version needed no DB; the full dataset does.)
- **Two data planes:**
  - *Curated* (hero + chart + biomass): still baked JSON committed in the repo
    (`src/data/species.json`, `lpi.json`), IUCN-enriched at build time. The
    24 curated entries also carry editorial fields (windows, last-seen) surfaced
    as rich detail when they appear in the explorer.
  - *Full dataset* (explorer): Supabase `species` + `species_countries` tables,
    queried via `/api/species/search`.
- **Secrets stay server-side.** `IUCN_TOKEN` (build + `/api/species`), and the
  Supabase keys live in env vars. The publishable (anon) key is read-only under
  RLS; only `SELECT` is granted to `anon` in production.

## Architecture

```
scripts/species-seed.mjs   Curated 24 (editorial source of truth)
scripts/compute-lpi.py     LPD CSV → src/data/lpi.json (group trends)
scripts/build-data.mjs     compute-lpi + IUCN v4 enrichment → src/data/species.json
scripts/ingest-iucn.mjs    Harvest ALL ~88k animal species → data/iucn/all-animals.ndjson
scripts/load-supabase.mjs  Bulk-load all-animals.ndjson → Supabase species table
scripts/ingest-countries.mjs  Harvest species↔country occurrence (curated country list)
scripts/load-countries.mjs    Load pairs → Supabase species_countries
src/data/countries.json    Curated country list (dropdown + harvester share it)
src/lib/supabase.ts        Server-side PostgREST search helper (filter/sort/paginate/country join)
src/lib/iucn.ts            Server-only IUCN v4 client (curated overlay)
src/components/Dashboard.tsx   Hero + LPI chart + biomass + sources (curated)
src/components/Explorer.tsx    FIG.02 — the full Supabase-backed species explorer
src/app/api/species/route.ts        Curated overlay (24, live IUCN)
src/app/api/species/search/route.ts Full-dataset search over Supabase
```

Data flow: the page renders the curated top matter from baked JSON; the Explorer
(client) fetches `/api/species/search` for the live 88k dataset (debounced search,
filter chips, country dropdown, pagination). Photos + common names load lazily
from Wikipedia per visible row.

## Commands

```bash
npm run dev        # local dev
npm run build      # production build (lint + typecheck)
npm run data       # regenerate curated src/data/*.json (IUCN + LPD CSV)
npm run harvest    # harvest ALL animal species from IUCN → data/iucn/all-animals.ndjson
npm run load       # bulk-load harvested species → Supabase
npm run harvest:countries  # harvest species↔country occurrence
npm run load:countries     # load country pairs → Supabase
```

Full refresh: `npm run harvest && npm run load` (species), then
`npm run harvest:countries && npm run load:countries`. Harvests are resumable
(page-level checkpoints under `data/iucn/parts/`).

## Data sources & their quirks

- **IUCN Red List API v4** (`https://api.iucnredlist.org/api/v4`, Bearer token).
  The old v3 (`apiv3.iucnredlist.org`) is Cloudflare-blocked and deprecated —
  don't use it. Endpoint: `taxa/scientific_name?genus_name=&species_name=[&infra_name=]`.
  Response has `taxon.sis_id` + an `assessments[]` array; pick the `latest` global
  (scope code `"1"`) assessment. `possibly_extinct` / `possibly_extinct_in_the_wild`
  flags map a `CR` to our `CR (PE)`.
- **Living Planet Database 2024** (public release, ~35k population time series,
  under `data/lpi/`). Big CSV; gitignored. Year columns 1950–2020; taxonomy in
  `Class`. Fish spans several classes (Actinopteri, Elasmobranchii, Myxini, …).
- **Bar-On, Phillips & Milo 2018** (PNAS) — global biomass. All figures in
  `src/lib/biomass.ts` are from Table 1 and verified against the paper.

## Decisions & lessons (append as they come up)

- **Displayed IUCN status = the curated seed, not the raw live category.** The
  watchlist tracks specific taxa/subpopulations that the species-level API
  doesn't always match: Yangtze finless porpoise (API returns species-level EN;
  we track the CR Yangtze subpopulation), Northern white rhino (API `CR (PE)` vs
  the widely-cited EW), Amur leopard (subspecies → API returns NE, no separate
  assessment). 21/24 match the live category exactly, which validates the
  curation. The live data still populates the IUCN metadata + canonical
  assessment link, and `iucn.matchesSeed` records every divergence. Never let a
  raw API category silently overwrite a deliberately-chosen editorial one.
- **The LPI chart is an *unweighted* per-class index — labelled as such.** A
  naive geometric mean across taxonomic classes shows only ~27% decline (birds
  flat, some reptiles rising) because the LPD over-samples well-monitored
  temperate populations. WWF/ZSL's headline *weighted* global figure is a 73%
  decline (1970–2020) because losses concentrate in freshwater (−85%) and the
  tropics. Both are surfaced so the difference is explicit — don't "fix" the
  reptile line upward-trend; it's real for what it measures. Reproducing the
  official weighted index needs the realm/system weighting scheme (out of scope).
- **Projections are near-term (to 2035) and tightly capped.** Extrapolating
  unweighted class means further isn't defensible. Underlying data ends 2020, so
  observed/modelled split is at 2020 (the `.dc.html` said 2024 — corrected).
- **Hydration:** the live countdown uses `Date.now()`, which differs between SSR
  and client. Fixed with `suppressHydrationWarning` on the time-derived digits
  (invisible one-frame correction). Any new time/random-dependent SSR content
  needs the same treatment or a mount gate.
- **`next@15.3.1` had a critical CVE (CVE-2025-66478)** → pinned to `15.5.20`.
  Two remaining moderate `postcss` advisories are transitive via Next and only
  "fixable" by downgrading to Next 9 (worse); not exploitable here.
- **Sparse-data honesty (LPI):** a group's index is only drawn *observed* up to
  its last adequately-sampled year (`observedEnd` per group, gated on
  `MIN_SPECIES` contributing species). Amphibian data thins to ~zero after 2017,
  so the old code held the index flat at a single-population spike (28.6) through
  2020 and drew it solid — a fake "measurement". Now amphibians observe to 2017
  (index 19, a real ~81% decline) and go dashed/modelled after. Any new group
  with a thin tail is handled the same way; the chart reads `group.observedEnd`.
- **Durations use calendar arithmetic**, not a fixed 365.25-day year — else the
  YR/DAY split (e.g. the Vaquita countdown) drifts a day off the real calendar.
  See `calendarSplit` in `src/lib/species.ts`.
- **Icons are self-hosted** via `@phosphor-icons/web` (imported as
  `@phosphor-icons/web/{regular,bold,fill}` — the package's `exports` map, NOT
  `/src/.../style.css`, which webpack can't resolve). They were on unpkg (no
  production SLA). **Google Fonts is intentionally kept as an external `<link>`:**
  Google runs it as a reliable production service, and migrating to `next/font`
  would rename the font families and break the hard-coded `font-family="Space Mono"`
  attributes on the SVG `<text>` elements. Acceptable, deliberate trade-off.
- **The nav LIVE/SNAPSHOT badge reads the API's `live` flag** (`j.live === true`),
  not merely the presence of a species array — otherwise it falsely claims live
  IUCN sync when the route served the build-time snapshot (no token / IUCN down).

### Scaling to all species (the full explorer)

- **`latest=true` is the critical query param.** The IUCN list endpoints
  (`/taxa/class/{C}`, `/taxa/kingdom/ANIMALIA`, `/countries/{cc}`) return EVERY
  historical + regional assessment by default — birds are 936 pages that way,
  mostly old reassessments (`latest:false`). Adding `?latest=true` drops those
  server-side (birds → 118 pages, ~8×). Always harvest with it. We still keep
  only global scope (`scopes[].code === "1"`) client-side so each species has one
  canonical global-category row.
- **Rate limit is on burst/concurrency, not steady rate.** ~3–4 req/s sequential
  is fine; concurrency >1 or parallel probing triggers 429s. Harvest sequentially
  (~260 ms pacing) with exponential backoff. Don't run two harvests at once, and
  don't hammer the API with probes while a harvest runs (same token/IP bucket).
- **Harvests are page-level resumable** (`data/iucn/parts/<taxon>.progress.json`).
  A 429/network drop resumes mid-taxon. `per_page` is capped at 100 (bigger is
  ignored). Group comes from the class/phylum queried (list items carry no
  taxonomy); enumerate classes for fine vertebrate groups + phyla as a net.
- **Country filter** = `species_countries(sis_id, country_code)` with a FK to
  `species`, harvested per country from `/countries/{cc}`. The search API
  inner-joins it: `species?...&species_countries!inner(country_code)&species_countries.country_code=eq.NL`.
  Countries are a curated set (`src/data/countries.json`, ~60) to keep the harvest
  bounded — extend the list + re-run `harvest:countries` to add more.
- **Bulk load** goes through PostgREST with a TEMPORARY anon insert/update RLS
  policy, then those policies are DROPPED before deploy (never ship a public
  anon-writable table). The MCP doesn't expose the service_role key, hence this
  dance. Load order matters: species before species_countries (FK).
- **common_name is null in the DB** for the bulk (per-species enrichment = 88k
  calls). The UI fills common names + photos from Wikipedia per visible row, so
  search matches SCIENTIFIC names only. Enriching common names for the threatened
  subset into the DB is the obvious future improvement (would make common-name
  search work).

### Per-row richness at scale (trend, sparkline, population) & what's NOT available

- The explorer rows show a **population-trend arrow + abundance sparkline** and
  rank by **closeness to extinction** (severity: CR possibly-extinct = 100 … EX = 1,
  so soonest-to-vanish leads, already-extinct sinks). Sort headers: RISK (severity),
  SPECIES (name), ASSESSED (year).
- **Trend** is measured IUCN `population_trend` where enriched, otherwise an
  ILLUSTRATIVE trajectory derived from category (threatened→declining, LC→stable,
  EX/EW→gone, DD→unknown). A `·` after the label marks illustrative. This mirrors
  the original design's illustrative sparklines. `trendInfo()` in Explorer.tsx.
- **Enrichment** (`enrich-trend.mjs` → `data/iucn/detail.json` → `load-detail.mjs`):
  fetches each species' `/assessment/{id}` for the critical tier (CR (PE), CR, EW,
  EX ≈ 4.9k) and captures real `population_trend`, structured `population_size`, and
  a one-sentence `population_summary`. ~30 min at concurrency 3. Widen tiers via
  args (`node scripts/enrich-trend.mjs EN VU`). 88k full enrichment is infeasible
  (~hours) — that's why only the top of the ranking is enriched.
- **What IUCN does NOT provide structurally** (so we do NOT show it for the full
  dataset, only for the curated 24): last-sighting date, projected extinction date,
  recovery date. These were hand-authored editorial windows. For the full list the
  honest signal is category + trend + population; the detail panel says so. Never
  fabricate a per-species extinction year (the design's "no fake days-left" ethos).
- **Loading enriched data / countries** needs writes, but the table is public-read
  RLS with NO write policy in production. Load via a brief temp-policy window
  (add `temp bulk load`/`temp bulk update` → run loader → drop), always dropping
  before leaving it live. `load-detail.mjs` PATCHes via JSON body (no SQL escaping).

### Review process note
Before the public deploy, an adversarial review workflow (4 dimensions ×
find→verify) surfaced 19 candidates, 9 confirmed and fixed (all above). It
confirmed the IUCN token never reaches the browser. Re-run that kind of pass
after any substantial change.

## Deployment

- **Live:** https://extinction-dash.vercel.app
- GitHub: `coendewith/extinction-dash` (auto-deploys on push to `main`).
  Vercel team: `coendewiths-projects`.
- **Set `IUCN_TOKEN` in Vercel project env vars** (Production + Preview). Without
  it the site still works but serves the build-time snapshot (badge shows SNAPSHOT).
- `data/` raw sources (CSV/zip/pdf) are gitignored; the generated `src/data/*.json`
  is committed, so Vercel builds without needing the raw files.
