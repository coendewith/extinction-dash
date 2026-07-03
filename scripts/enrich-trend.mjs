// Enrich per-species detail (population trend + population size + a short
// population summary) for a category tier, from each species' IUCN assessment.
// Writes data/iucn/detail.json: sisId -> { trend, popSize, popSummary }. Resumable.
//
// Default tier: the critical end (CR (PE), CR, EW, EX) — the top of the ranking.
// Pass categories as args to widen, e.g.: node scripts/enrich-trend.mjs EN VU
//
// IUCN's assessment endpoint is ~1s/call; low concurrency + backoff.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const NDJSON = join(ROOT, "data", "iucn", "all-animals.ndjson");
const OUT = join(ROOT, "data", "iucn", "detail.json");
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

function firstSentence(html) {
  if (!html) return null;
  const text = String(html).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  const m = text.match(/^.{0,240}?[.!?](\s|$)/);
  return (m ? m[0] : text.slice(0, 240)).trim();
}

const map = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
let dirty = 0;
const save = () => writeFileSync(OUT, JSON.stringify(map));

async function fetchDetail(assessmentId, tries = 0) {
  try {
    const res = await fetch(`${B}/assessment/${assessmentId}`, { headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json", "User-Agent": "extinction-dash/1.0" } });
    if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
    if (!res.ok) return { trend: "unknown", popSize: null, popSummary: null };
    const j = await res.json();
    const si = j.supplementary_info || {};
    const doc = j.documentation || {};
    return {
      trend: TREND_CODE[j.population_trend?.code] || "unknown",
      popSize: si.population_size != null ? String(si.population_size) : null,
      popSummary: firstSentence(doc.population),
    };
  } catch (e) {
    if (tries >= 10) throw e;
    await sleep(Math.min(20000, 1200 * (tries + 1)));
    return fetchDetail(assessmentId, tries + 1);
  }
}

async function main() {
  const species = readFileSync(NDJSON, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
    .filter((s) => TIERS.includes(s.category) && s.assessmentId && !(s.sisId in map));
  log(`Enriching ${species.length} species in tiers [${TIERS.join(", ")}] (have ${Object.keys(map).length})`);

  let i = 0, done = 0;
  async function worker() {
    while (i < species.length) {
      const s = species[i++];
      try {
        map[s.sisId] = await fetchDetail(s.assessmentId);
        if (++dirty % 100 === 0) { save(); log(`  ${done + 1}/${species.length} saved`); }
      } catch {}
      done++;
      await sleep(REQ_DELAY);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  save();
  const tc = {}; let withPop = 0;
  for (const v of Object.values(map)) { tc[v.trend] = (tc[v.trend] || 0) + 1; if (v.popSize || v.popSummary) withPop++; }
  log(`Done. ${Object.keys(map).length} entries; trend ${JSON.stringify(tc)}; ${withPop} with population info.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
