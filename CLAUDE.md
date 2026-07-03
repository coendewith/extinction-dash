# CLAUDE.md — Sixth Mass Extinction Watch

Working notes for this repo. Updated iteratively as the project evolves — when a
decision, quirk, or lesson comes up, record it here so it isn't rediscovered.

## What this is

A public dashboard — "Sixth Mass Extinction Watch" — that tracks a curated
watchlist of imperilled species alongside global abundance trends (Living Planet
Index) and biomass scale (Bar-On et al. 2018). Editorial stance: **keep measured
facts visually separate from modelled projections** (solid vs dashed, everywhere),
and never show a fake "days until extinction" number.

Originated as a Claude Design (`.dc.html`) mockup; this repo is the real,
deployable implementation of that design.

## Stack & why

- **Next.js 15 (App Router) + React 19 + TypeScript**, deployed on **Vercel**.
- **No database (no Supabase).** The dataset is tiny (24 curated species) and
  editorial. A build-time pipeline bakes everything to JSON committed in the
  repo, and one serverless route overlays live IUCN data. A DB would add a
  moving part with no payoff. Revisit only if the watchlist grows into the
  hundreds or needs user-generated content.
- **Secrets stay server-side.** `IUCN_TOKEN` is used only in the build script
  and the `/api/species` route. It is never imported into a client component.

## Architecture

```
scripts/species-seed.mjs   Editorial source of truth (24 species, curated fields)
scripts/compute-lpi.py     Reads the LPD CSV → src/data/lpi.json (group trends)
scripts/build-data.mjs     Runs compute-lpi + IUCN v4 enrichment → src/data/species.json
src/data/*.json            Generated, committed. The app imports these directly.
src/lib/                   types, species/chart/biomass logic, server-only iucn client
src/components/Dashboard.tsx   The whole UI (client component, ported from the .dc.html)
src/app/page.tsx           Server component: imports JSON, renders <Dashboard/> (SSG)
src/app/api/species/route.ts   Serverless: baked JSON + live IUCN overlay (24h ISR)
```

Data flow: `page.tsx` renders fully from baked JSON (site works even if the API
or IUCN is down). After mount, `Dashboard` fetches `/api/species` to refresh
statuses live; on failure it silently keeps the baked data. A "LIVE / SNAPSHOT"
badge in the nav reflects which is in use.

## Commands

```bash
npm run dev        # local dev
npm run build      # production build (also runs lint + typecheck)
npm run data       # regenerate src/data/*.json (needs IUCN_TOKEN + the LPD CSV)
npm run data:lpi   # just recompute LPI trends from the CSV
```

`npm run data` is the refresh path: it recomputes LPI trends (if the CSV is
present under `data/lpi/`) and re-queries IUCN for every species. Commit the
regenerated JSON.

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

### Review process note
Before the public deploy, an adversarial review workflow (4 dimensions ×
find→verify) surfaced 19 candidates, 9 confirmed and fixed (all above). It
confirmed the IUCN token never reaches the browser. Re-run that kind of pass
after any substantial change.

## Deployment

- GitHub: `coendewith/extinction-dash`. Vercel team: `coendewiths-projects`.
- **Set `IUCN_TOKEN` in Vercel project env vars** (Production + Preview). Without
  it the site still works but serves the build-time snapshot (badge shows SNAPSHOT).
- `data/` raw sources (CSV/zip/pdf) are gitignored; the generated `src/data/*.json`
  is committed, so Vercel builds without needing the raw files.
