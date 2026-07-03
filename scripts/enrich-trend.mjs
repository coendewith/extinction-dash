// Enrich REAL population trend (increasing/decreasing/stable/unknown) for a
// category tier, by fetching each species' assessment. Writes a trend map to
// data/iucn/trend.json (sisId -> 'up'|'down'|'stable'|'unknown'), resumable.
//
// Default tier: the critical end (CR (PE), CR, EW, EX) — the top of the ranking,
// where declining-vs-recovering matters most. Pass categories as args to change.
//
//   node scripts/enrich-trend.mjs "CR (PE)" CR EW EX
//
// IUCN's assessment endpoint is ~1s/call; run at low concurrency with backoff.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const NDJSON = join(ROOT, "data", "iucn", "all-animals.ndjson");
const OUT = join(ROOT, "data", "iucn", "trend.json");
const B = "https://api.iucnredlist.org/api/v4";
const CONCURRENCY = 3;
const REQ_DELAY = 120;

function token() {
  if (process.env.IUCN_TOKEN) return process.env.IUCN_TOKEN;
  const p = join(ROOT, ".env.local");
  if (existsSync(p)) { const m = readFileSync(p, "utf8").match(/^\s*IUCN_TOKEN\s*=\s*(.+)\s*$/m); if (m) return m[1].trim().replace(/^["']|["']$/g, ""); }
  return null;
}
const TOKEN = token();
if (!TOKEN) { console.error("No IUCN_TOKEN"); process.exit(1); }

const TIERS = process.argv.slice(2).length ? process.argv.slice(2) : ["CR (PE)", "CR", "EW", "EX"];
const TREND_CODE = { "0": "up", "1": "down", "2": "stable", "3": "unknown" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (s) => process.stdout.write(s + "\n");

const map = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
let dirty = 0;
function save() { writeFileSync(OUT, JSON.stringify(map)); }

async function fetchTrend(assessmentId, tries = 0) {
  try {
    const res = await fetch(`${B}/assessment/${assessmentId}`, { headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json", "User-Agent": "extinction-dash/1.0" } });
    if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
    if (!res.ok) return "unknown";
    const j = await res.json();
    return TREND_CODE[j.population_trend?.code] || "unknown";
  } catch (e) {
    if (tries >= 10) throw e;
    await sleep(Math.min(20000, 1200 * (tries + 1)));
    return fetchTrend(assessmentId, tries + 1);
  }
}

async function main() {
  const species = readFileSync(NDJSON, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
    .filter((s) => TIERS.includes(s.category) && s.assessmentId && !(s.sisId in map));
  log(`Enriching trend for ${species.length} species in tiers [${TIERS.join(", ")}] (already have ${Object.keys(map).length})`);

  let i = 0, done = 0;
  async function worker() {
    while (i < species.length) {
      const s = species[i++];
      try {
        map[s.sisId] = await fetchTrend(s.assessmentId);
        dirty++;
        if (dirty % 50 === 0) { save(); log(`  ${done + 1}/${species.length} (saved)`); }
      } catch (e) { /* leave unset, resume next run */ }
      done++;
      await sleep(REQ_DELAY);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  save();
  const counts = {};
  for (const v of Object.values(map)) counts[v] = (counts[v] || 0) + 1;
  log(`Done. trend.json has ${Object.keys(map).length} entries. Distribution: ${JSON.stringify(counts)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
