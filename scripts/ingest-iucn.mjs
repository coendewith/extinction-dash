// Harvest every IUCN-assessed animal species into data/iucn/all-animals.ndjson.
//
// Pages the IUCN Red List API v4 by taxonomic class (clean vertebrate / major
// invertebrate groups) then by phylum (a completeness net). Keeps only the
// LATEST GLOBAL assessment per taxon; dedups by SIS id (finer class group wins).
//
// Robust + resumable at PAGE level: each taxon appends to parts/<taxon>.ndjson
// and records the last completed page in parts/<taxon>.progress.json. A 429 or
// crash resumes mid-taxon on the next run. Sequential + paced to respect the
// API's burst limit. Flushed heartbeat logging.
//
// Requires IUCN_TOKEN (env or .env.local). Run: node scripts/ingest-iucn.mjs

import { existsSync, mkdirSync, writeFileSync, appendFileSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = join(ROOT, "data", "iucn");
const PARTS_DIR = join(OUT_DIR, "parts");
const OUT = join(OUT_DIR, "all-animals.ndjson");
const B = "https://api.iucnredlist.org/api/v4";
const REQ_DELAY = 260; // ms between requests

function token() {
  if (process.env.IUCN_TOKEN) return process.env.IUCN_TOKEN;
  const p = join(ROOT, ".env.local");
  if (existsSync(p)) {
    const m = readFileSync(p, "utf8").match(/^\s*IUCN_TOKEN\s*=\s*(.+)\s*$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  return null;
}
const TOKEN = token();
if (!TOKEN) { console.error("No IUCN_TOKEN"); process.exit(1); }

const TAXA = [
  ["class/MAMMALIA", "Mammals"], ["class/AVES", "Birds"], ["class/REPTILIA", "Reptiles"], ["class/AMPHIBIA", "Amphibians"],
  ["class/ACTINOPTERYGII", "Fish"], ["class/CHONDRICHTHYES", "Fish"], ["class/MYXINI", "Fish"], ["class/PETROMYZONTI", "Fish"],
  ["class/HOLOCEPHALI", "Fish"], ["class/SARCOPTERYGII", "Fish"], ["class/DIPNEUSTI", "Fish"], ["class/COELACANTHI", "Fish"],
  ["class/CEPHALASPIDOMORPHI", "Fish"], ["class/ACTINOPTERI", "Fish"], ["class/ELASMOBRANCHII", "Fish"],
  ["class/INSECTA", "Insects"], ["class/ARACHNIDA", "Arachnids"],
  ["class/MALACOSTRACA", "Crustaceans"], ["class/MAXILLOPODA", "Crustaceans"], ["class/BRANCHIOPODA", "Crustaceans"], ["class/OSTRACODA", "Crustaceans"],
  ["class/GASTROPODA", "Molluscs"], ["class/BIVALVIA", "Molluscs"], ["class/CEPHALOPODA", "Molluscs"], ["class/POLYPLACOPHORA", "Molluscs"],
  ["class/ANTHOZOA", "Corals & anemones"], ["class/HYDROZOA", "Cnidarians"], ["class/SCYPHOZOA", "Cnidarians"],
  ["class/CLITELLATA", "Annelids"], ["class/POLYCHAETA", "Annelids"],
  ["class/ECHINOIDEA", "Echinoderms"], ["class/HOLOTHUROIDEA", "Echinoderms"], ["class/ASTEROIDEA", "Echinoderms"], ["class/OPHIUROIDEA", "Echinoderms"], ["class/CRINOIDEA", "Echinoderms"],
  ["class/DIPLOPODA", "Myriapods"], ["class/CHILOPODA", "Myriapods"],
  ["class/MEROSTOMATA", "Horseshoe crabs"], ["class/ENTOGNATHA", "Insects"],
  ["phylum/ARTHROPODA", "Other arthropods"], ["phylum/MOLLUSCA", "Other molluscs"], ["phylum/CNIDARIA", "Cnidarians"],
  ["phylum/ANNELIDA", "Annelids"], ["phylum/ECHINODERMATA", "Echinoderms"], ["phylum/PLATYHELMINTHES", "Flatworms"],
  ["phylum/NEMATODA", "Roundworms"], ["phylum/PORIFERA", "Sponges"], ["phylum/BRYOZOA", "Bryozoans"],
  ["phylum/NEMERTEA", "Ribbon worms"], ["phylum/ONYCHOPHORA", "Velvet worms"], ["phylum/ROTIFERA", "Other invertebrates"],
  ["phylum/TARDIGRADA", "Other invertebrates"], ["phylum/HEMICHORDATA", "Other invertebrates"],
  ["phylum/CHAETOGNATHA", "Other invertebrates"], ["phylum/ACANTHOCEPHALA", "Other invertebrates"],
  ["phylum/PRIAPULIDA", "Other invertebrates"], ["phylum/NEMATOMORPHA", "Other invertebrates"],
  ["phylum/XENACOELOMORPHA", "Other invertebrates"], ["phylum/SIPUNCULA", "Other invertebrates"],
  ["phylum/BRACHIOPODA", "Other invertebrates"], ["phylum/PHORONIDA", "Other invertebrates"],
  ["phylum/ENTOPROCTA", "Other invertebrates"], ["phylum/GASTROTRICHA", "Other invertebrates"],
  ["phylum/PLACOZOA", "Other invertebrates"], ["phylum/CTENOPHORA", "Other invertebrates"],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (s) => process.stdout.write(s + "\n");

async function fetchPage(path, page, tries = 0) {
  // latest=true drops historical reassessments server-side (e.g. AVES 936→118 pages)
  const url = `${B}/taxa/${path}?latest=true&per_page=100&page=${page}`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json", "User-Agent": "extinction-dash/1.0" } });
    if (res.status === 404) return { items: [], last: page };
    if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const link = res.headers.get("link") || "";
    const m = link.match(/page=(\d+)>;\s*rel="last"/);
    const last = m ? parseInt(m[1], 10) : page;
    const json = await res.json();
    return { items: json.assessments || [], last };
  } catch (e) {
    if (tries >= 15) throw e;
    const wait = Math.min(30000, 1500 * (tries + 1));
    if (tries >= 2) log(`    …retry p${page} (${e.message}) waiting ${wait}ms`);
    await sleep(wait);
    return fetchPage(path, page, tries + 1);
  }
}

function normalize(item, group) {
  if (!item.latest || !(item.scopes || []).some((s) => s.code === "1")) return null;
  let category = item.red_list_category_code;
  if (category === "CR" && (item.possibly_extinct || item.possibly_extinct_in_the_wild)) category = "CR (PE)";
  return {
    sisId: item.sis_taxon_id, sci: item.taxon_scientific_name, group, category,
    possiblyExtinct: !!item.possibly_extinct, possiblyExtinctInWild: !!item.possibly_extinct_in_the_wild,
    yearPublished: item.year_published ? parseInt(item.year_published, 10) : null,
    assessmentId: item.assessment_id,
    url: item.url || (item.sis_taxon_id ? `https://www.iucnredlist.org/species/${item.sis_taxon_id}` : null),
  };
}

async function harvestTaxon([path, group], idx) {
  const safe = path.replace(/\//g, "__");
  const partFile = join(PARTS_DIR, `${safe}.ndjson`);
  const progFile = join(PARTS_DIR, `${safe}.progress.json`);
  const prog = existsSync(progFile) ? JSON.parse(readFileSync(progFile, "utf8")) : null;
  // legacy complete part (no progress file) OR marked done -> skip
  if ((existsSync(partFile) && !prog) || prog?.done) {
    const rows = existsSync(partFile) ? readFileSync(partFile, "utf8").split("\n").filter(Boolean).length : 0;
    log(`[${idx + 1}/${TAXA.length}] ${path.padEnd(26)} done (cached, ${rows} species)`);
    return;
  }
  let startPage = (prog?.last || 0) + 1;
  const first = await fetchPage(path, Math.max(1, startPage));
  const last = prog?.total || first.last;
  if (startPage === 1) writeFileSync(partFile, ""); // fresh
  let kept = 0;
  const flush = (items) => {
    const rows = items.map((it) => normalize(it, group)).filter(Boolean);
    if (rows.length) { appendFileSync(partFile, rows.map((r) => JSON.stringify(r)).join("\n") + "\n"); kept += rows.length; }
  };
  flush(first.items);
  writeFileSync(progFile, JSON.stringify({ last: Math.max(1, startPage), total: last }));
  for (let p = Math.max(2, startPage + 1); p <= last; p++) {
    await sleep(REQ_DELAY);
    const { items } = await fetchPage(path, p);
    flush(items);
    if (p % 25 === 0 || p === last) {
      writeFileSync(progFile, JSON.stringify({ last: p, total: last }));
      log(`[${idx + 1}/${TAXA.length}] ${path.padEnd(20)} p${p}/${last}  (+${kept} species so far)`);
    }
  }
  writeFileSync(progFile, JSON.stringify({ done: true, total: last }));
  log(`[${idx + 1}/${TAXA.length}] ${path.padEnd(26)} COMPLETE (${last}p -> kept ${kept})`);
}

async function main() {
  mkdirSync(PARTS_DIR, { recursive: true });
  log(`Harvesting ${TAXA.length} animal taxa (sequential, ${REQ_DELAY}ms pacing, resumable)...`);
  for (let i = 0; i < TAXA.length; i++) {
    try { await harvestTaxon(TAXA[i], i); }
    catch (e) { log(`[${i + 1}/${TAXA.length}] ${TAXA[i][0]} FAILED: ${e.message} (will resume next run)`); }
    await sleep(REQ_DELAY);
  }

  // merge complete + partial parts, dedup by sisId (finer class group wins, class listed before phylum)
  const seen = new Map();
  for (const f of readdirSync(PARTS_DIR).filter((f) => f.endsWith(".ndjson"))) {
    for (const line of readFileSync(join(PARTS_DIR, f), "utf8").split("\n").filter(Boolean)) {
      try { const r = JSON.parse(line); if (r.sisId != null && !seen.has(r.sisId)) seen.set(r.sisId, r); } catch {}
    }
  }
  const all = [...seen.values()];
  writeFileSync(OUT, all.map((r) => JSON.stringify(r)).join("\n") + "\n");
  const byGroup = {}, byCat = {};
  for (const r of all) { byGroup[r.group] = (byGroup[r.group] || 0) + 1; byCat[r.category] = (byCat[r.category] || 0) + 1; }
  log(`\n=== HARVEST COMPLETE ===\nUnique animal species: ${all.length.toLocaleString()}`);
  log("By group: " + JSON.stringify(byGroup));
  log("By category: " + JSON.stringify(byCat));
  log(`Wrote ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
