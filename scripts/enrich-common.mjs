// Backfill common (vernacular) names so the explorer can be searched by common
// name ("dolphin", "eagle", …), not just scientific name. IUCN's list endpoints
// omit common names, so we fetch each species' taxa record. Full 88k is
// infeasible; default to the threatened + extinct tiers (the dashboard's focus).
// Writes data/iucn/common.json: sisId -> commonName. Resumable.
//
// Widen/narrow via args: node scripts/enrich-common.mjs CR "CR (PE)" EN VU NT EX EW

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const NDJSON = join(ROOT, "data", "iucn", "all-animals.ndjson");
const OUT = join(ROOT, "data", "iucn", "common.json");
const B = "https://api.iucnredlist.org/api/v4";
const CONCURRENCY = 3;
const REQ_DELAY = 110;

function token() {
  if (process.env.IUCN_TOKEN) return process.env.IUCN_TOKEN;
  const p = join(ROOT, ".env.local");
  if (existsSync(p)) { const m = readFileSync(p, "utf8").match(/^\s*IUCN_TOKEN\s*=\s*(.+)\s*$/m); if (m) return m[1].trim().replace(/^["']|["']$/g, ""); }
  return null;
}
const TOKEN = token();
if (!TOKEN) { console.error("No IUCN_TOKEN"); process.exit(1); }

const TIERS = process.argv.slice(2).length ? process.argv.slice(2) : ["CR (PE)", "CR", "EN", "VU", "NT", "EX", "EW"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (s) => process.stdout.write(s + "\n");

function pickCommon(taxon) {
  const cn = taxon?.common_names || [];
  if (!cn.length) return null;
  const main = cn.find((c) => c.main && (c.language === "eng" || !c.language));
  const eng = cn.find((c) => c.language === "eng");
  return (main?.name || eng?.name || cn[0].name || "").trim() || null;
}

const map = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
let dirty = 0;
const save = () => writeFileSync(OUT, JSON.stringify(map));

async function fetchCommon(sci, tries = 0) {
  // sci = "Genus species [subspecies]"
  const parts = sci.trim().split(/\s+/);
  const genus = parts[0], species = parts[1] || "";
  if (!species) return null;
  const infra = parts.slice(2).join(" ");
  let url = `${B}/taxa/scientific_name?genus_name=${encodeURIComponent(genus)}&species_name=${encodeURIComponent(species)}`;
  if (infra) url += `&infra_name=${encodeURIComponent(infra)}`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json", "User-Agent": "extinction-dash/1.0" } });
    if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
    if (!res.ok) return null;
    const j = await res.json();
    return pickCommon(j.taxon);
  } catch (e) {
    if (tries >= 10) throw e;
    await sleep(Math.min(20000, 1100 * (tries + 1)));
    return fetchCommon(sci, tries + 1);
  }
}

async function main() {
  const species = readFileSync(NDJSON, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
    .filter((s) => TIERS.includes(s.category) && !(s.sisId in map));
  log(`Common-name backfill: ${species.length} species in [${TIERS.join(", ")}] (have ${Object.keys(map).length})`);

  let i = 0, done = 0;
  async function worker() {
    while (i < species.length) {
      const s = species[i++];
      try {
        const cn = await fetchCommon(s.sci);
        map[s.sisId] = cn || null;
        if (++dirty % 200 === 0) { save(); log(`  ${done + 1}/${species.length} (${Object.values(map).filter(Boolean).length} named)`); }
      } catch {}
      done++;
      await sleep(REQ_DELAY);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  save();
  log(`Done. ${Object.keys(map).length} entries; ${Object.values(map).filter(Boolean).length} with a common name.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
