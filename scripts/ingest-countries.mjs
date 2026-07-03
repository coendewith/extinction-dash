// Harvest species↔country occurrence from IUCN /countries/{code} for the curated
// country list (src/data/countries.json). Writes parts/countries/<CC>.ndjson
// (one sis_id per line) + a .progress.json per country. Resumable at page level.
//
// Run AFTER the species harvest (shares the API rate limit). Run: node scripts/ingest-countries.mjs

import { existsSync, mkdirSync, writeFileSync, appendFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PARTS = join(ROOT, "data", "iucn", "parts", "countries");
const B = "https://api.iucnredlist.org/api/v4";
const REQ_DELAY = 260;

function token() {
  if (process.env.IUCN_TOKEN) return process.env.IUCN_TOKEN;
  const p = join(ROOT, ".env.local");
  if (existsSync(p)) { const m = readFileSync(p, "utf8").match(/^\s*IUCN_TOKEN\s*=\s*(.+)\s*$/m); if (m) return m[1].trim().replace(/^["']|["']$/g, ""); }
  return null;
}
const TOKEN = token();
if (!TOKEN) { console.error("No IUCN_TOKEN"); process.exit(1); }

const COUNTRIES = JSON.parse(readFileSync(join(ROOT, "src", "data", "countries.json"), "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (s) => process.stdout.write(s + "\n");

async function fetchPage(code, page, tries = 0) {
  const url = `${B}/countries/${code}?latest=true&per_page=100&page=${page}`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json", "User-Agent": "extinction-dash/1.0" } });
    if (res.status === 404) return { items: [], last: page };
    if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const link = res.headers.get("link") || "";
    const m = link.match(/page=(\d+)>;\s*rel="last"/);
    const json = await res.json();
    return { items: json.assessments || [], last: m ? parseInt(m[1], 10) : page };
  } catch (e) {
    if (tries >= 15) throw e;
    await sleep(Math.min(30000, 1500 * (tries + 1)));
    return fetchPage(code, page, tries + 1);
  }
}

async function harvestCountry(code, idx) {
  const partFile = join(PARTS, `${code}.ndjson`);
  const progFile = join(PARTS, `${code}.progress.json`);
  const prog = existsSync(progFile) ? JSON.parse(readFileSync(progFile, "utf8")) : null;
  if (prog?.done) { log(`[${idx + 1}/${COUNTRIES.length}] ${code} done (cached)`); return; }
  let startPage = (prog?.last || 0) + 1;
  const first = await fetchPage(code, Math.max(1, startPage));
  const last = prog?.total || first.last;
  if (startPage === 1) writeFileSync(partFile, "");
  const flush = (items) => {
    const ids = [...new Set(items.filter((it) => it.latest).map((it) => it.sis_taxon_id).filter((x) => x != null))];
    if (ids.length) appendFileSync(partFile, ids.join("\n") + "\n");
  };
  flush(first.items);
  writeFileSync(progFile, JSON.stringify({ last: Math.max(1, startPage), total: last }));
  for (let p = Math.max(2, startPage + 1); p <= last; p++) {
    await sleep(REQ_DELAY);
    const { items } = await fetchPage(code, p);
    flush(items);
    if (p % 25 === 0 || p === last) writeFileSync(progFile, JSON.stringify({ last: p, total: last }));
  }
  writeFileSync(progFile, JSON.stringify({ done: true, total: last }));
  log(`[${idx + 1}/${COUNTRIES.length}] ${code} COMPLETE (${last}p)`);
}

async function main() {
  mkdirSync(PARTS, { recursive: true });
  log(`Harvesting occurrence for ${COUNTRIES.length} countries...`);
  for (let i = 0; i < COUNTRIES.length; i++) {
    try { await harvestCountry(COUNTRIES[i].code, i); }
    catch (e) { log(`[${i + 1}/${COUNTRIES.length}] ${COUNTRIES[i].code} FAILED: ${e.message}`); }
    await sleep(REQ_DELAY);
  }
  log("Country harvest pass complete.");
}
main().catch((e) => { console.error(e); process.exit(1); });
