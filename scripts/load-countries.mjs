// Load species↔country pairs into Supabase species_countries. Reads the valid
// animal sis_ids from data/iucn/all-animals.ndjson (FK safety) and the per-country
// sis_id lists from data/iucn/parts/countries/. Run: node scripts/load-countries.mjs

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const NDJSON = join(ROOT, "data", "iucn", "all-animals.ndjson");
const CDIR = join(ROOT, "data", "iucn", "parts", "countries");
const BATCH = 2000;

function env(k) {
  if (process.env[k]) return process.env[k];
  const p = join(ROOT, ".env.local");
  if (existsSync(p)) { const m = readFileSync(p, "utf8").match(new RegExp("^\\s*" + k + "\\s*=\\s*(.+)\\s*$", "m")); if (m) return m[1].trim().replace(/^["']|["']$/g, ""); }
  return null;
}
const URL = env("SUPABASE_URL"), KEY = env("SUPABASE_ANON_KEY");
if (!URL || !KEY) { console.error("Missing SUPABASE_URL / SUPABASE_ANON_KEY"); process.exit(1); }

async function post(rows, tries = 0) {
  const res = await fetch(`${URL}/rest/v1/species_countries`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    if (res.status >= 500 && tries < 4) { await new Promise((r) => setTimeout(r, 1500 * (tries + 1))); return post(rows, tries + 1); }
    throw new Error(`HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
}

async function main() {
  if (!existsSync(NDJSON)) { console.error("Run species harvest+load first."); process.exit(1); }
  const valid = new Set();
  for (const l of readFileSync(NDJSON, "utf8").split("\n").filter(Boolean)) { try { valid.add(JSON.parse(l).sisId); } catch {} }
  console.log(`Valid animal sis_ids: ${valid.size.toLocaleString()}`);

  if (!existsSync(CDIR)) { console.error("No country parts — run ingest-countries.mjs first."); process.exit(1); }
  const pairs = [];
  const seen = new Set();
  for (const f of readdirSync(CDIR).filter((f) => f.endsWith(".ndjson"))) {
    const code = f.replace(".ndjson", "");
    // only load countries whose harvest is COMPLETE, so the dropdown never shows partial data
    const progPath = join(CDIR, `${code}.progress.json`);
    let done = false;
    try { done = JSON.parse(readFileSync(progPath, "utf8")).done === true; } catch {}
    if (!done) continue;
    for (const l of readFileSync(join(CDIR, f), "utf8").split("\n").filter(Boolean)) {
      const sis = parseInt(l, 10);
      if (!valid.has(sis)) continue;
      const key = sis + "|" + code;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({ sis_id: sis, country_code: code });
    }
  }
  console.log(`Loading ${pairs.length.toLocaleString()} species-country pairs...`);
  let sent = 0;
  for (let i = 0; i < pairs.length; i += BATCH) {
    await post(pairs.slice(i, i + BATCH));
    sent += Math.min(BATCH, pairs.length - i);
    if (sent % 20000 < BATCH) console.log(`  ${sent.toLocaleString()} / ${pairs.length.toLocaleString()}`);
  }
  console.log(`Done. Loaded ${sent.toLocaleString()} pairs.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
