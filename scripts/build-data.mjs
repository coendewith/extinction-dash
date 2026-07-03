// Build step: enrich the curated watchlist with live IUCN Red List data and
// write src/data/species.json (committed, served by /api/species).
//
//   1. runs compute-lpi.py to regenerate src/data/lpi.json from the LPD CSV
//      (skipped automatically if the CSV isn't present locally)
//   2. for each species, queries IUCN Red List API v4 for the current category,
//      possibly-extinct flags, SIS id and canonical assessment URL
//   3. falls back to the seed's status if a lookup fails, so the build never
//      breaks on a flaky network or a name IUCN doesn't resolve
//
// Requires IUCN_TOKEN in the environment (see .env.example). Run: npm run data

import { SPECIES_SEED } from "./species-seed.mjs";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, "src", "data", "species.json");
const LPI_CSV = join(ROOT, "data", "lpi", "LivingPlanetIndex_2024_PublicData", "LPD_2024_public.csv");

// Load IUCN_TOKEN from env or .env.local (no dependency on dotenv).
function loadToken() {
  if (process.env.IUCN_TOKEN) return process.env.IUCN_TOKEN;
  const envPath = join(ROOT, ".env.local");
  if (existsSync(envPath)) {
    const m = readFileSync(envPath, "utf8").match(/^\s*IUCN_TOKEN\s*=\s*(.+)\s*$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  return null;
}

const IUCN_BASE = "https://api.iucnredlist.org/api/v4";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function iucnLookup(sci, token) {
  // sci may be "Genus species" or "Genus species subspecies".
  const parts = sci.trim().split(/\s+/);
  const [genus, species, infra] = parts;
  const qs = new URLSearchParams({ genus_name: genus, species_name: species });
  if (infra) qs.set("infra_name", infra);
  const url = `${IUCN_BASE}/taxa/scientific_name?${qs.toString()}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const assessments = json.assessments || [];
  // Prefer the global (scope code "1") latest assessment; else any latest; else first.
  const latest =
    assessments.find((a) => a.latest && (a.scopes || []).some((s) => s.code === "1")) ||
    assessments.find((a) => a.latest) ||
    assessments[0];
  if (!latest) return null;
  let code = latest.red_list_category_code;
  if (code === "CR" && (latest.possibly_extinct || latest.possibly_extinct_in_the_wild)) code = "CR (PE)";
  return {
    sisId: json.taxon?.sis_id ?? null,
    iucnCategory: code,
    yearPublished: latest.year_published ?? null,
    possiblyExtinct: !!latest.possibly_extinct,
    possiblyExtinctInWild: !!latest.possibly_extinct_in_the_wild,
    iucnUrl: latest.url || (json.taxon?.sis_id ? `https://www.iucnredlist.org/species/${json.taxon.sis_id}` : null),
  };
}

async function main() {
  const token = loadToken();

  // 1) LPI trends
  if (existsSync(LPI_CSV)) {
    try {
      console.log("Computing LPI trends from LPD CSV...");
      execFileSync("python3", [join(ROOT, "scripts", "compute-lpi.py")], { stdio: "inherit" });
    } catch (e) {
      console.warn("compute-lpi.py failed, keeping existing lpi.json:", e.message);
    }
  } else {
    console.log("LPD CSV not present locally — keeping committed src/data/lpi.json.");
  }

  // 2) IUCN enrichment
  const out = [];
  let enriched = 0;
  for (const s of SPECIES_SEED) {
    let live = null;
    if (token) {
      try {
        live = await iucnLookup(s.sci, token);
        await sleep(150); // be polite to the API
      } catch (e) {
        console.warn(`  IUCN lookup failed for ${s.sci}: ${e.message}`);
      }
    }
    // The curated seed status is the displayed badge: it is chosen for the exact
    // taxon/subpopulation the watchlist tracks (e.g. the CR Yangtze finless
    // porpoise subpopulation, not the EN species). We attach live IUCN metadata
    // for the canonical assessment link + official category, and only trust the
    // live category as a real value (never NE/DD) when recording whether it agrees.
    const liveValid = live && !["NE", "DD"].includes(live.iucnCategory);
    const iucnUrl =
      live?.iucnUrl ||
      (live?.sisId ? `https://www.iucnredlist.org/species/${live.sisId}` : null) ||
      `https://www.iucnredlist.org/search?query=${encodeURIComponent(s.sci)}`;
    out.push({
      ...s,
      status: s.status, // primary badge: curated, taxon-correct
      iucn: {
        sisId: live?.sisId ?? null,
        category: liveValid ? live.iucnCategory : null,
        yearPublished: live?.yearPublished ?? null,
        possiblyExtinct: !!live?.possiblyExtinct,
        possiblyExtinctInWild: !!live?.possiblyExtinctInWild,
        matchesSeed: liveValid ? live.iucnCategory === s.status : null,
        url: iucnUrl,
      },
    });
    if (liveValid) enriched++;
    const tag = liveValid ? (live.iucnCategory === s.status ? "live ✓" : `live≠seed: ${live.iucnCategory}`) : "seed";
    console.log(`  ${s.common.padEnd(26)} ${s.status.padEnd(8)} (${tag})`);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source: "Curated watchlist enriched with IUCN Red List API v4",
    count: out.length,
    enrichedFromIucn: enriched,
    species: out,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(payload, null, 2));
  console.log(`\nWrote ${OUT} — ${out.length} species, ${enriched} enriched from IUCN.`);
  if (!token) console.warn("No IUCN_TOKEN found — statuses fell back to the seed. Set IUCN_TOKEN to enrich.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
