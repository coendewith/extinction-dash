// Load backfilled common names from data/iucn/common.json into Supabase via
// PostgREST PATCH. Requires a temporary anon UPDATE policy on species during the
// load (add "temp bulk update", run, then DROP before leaving it live).
// Run: node scripts/load-common.mjs

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const COMMON = join(ROOT, "data", "iucn", "common.json");
const CONCURRENCY = 6;

function env(k) {
  if (process.env[k]) return process.env[k];
  const p = join(ROOT, ".env.local");
  if (existsSync(p)) { const m = readFileSync(p, "utf8").match(new RegExp("^\\s*" + k + "\\s*=\\s*(.+)\\s*$", "m")); if (m) return m[1].trim().replace(/^["']|["']$/g, ""); }
  return null;
}
const URL = env("SUPABASE_URL"), KEY = env("SUPABASE_ANON_KEY");
if (!URL || !KEY) { console.error("Missing SUPABASE creds"); process.exit(1); }
if (!existsSync(COMMON)) { console.error("No common.json — run enrich-common.mjs first."); process.exit(1); }

const map = JSON.parse(readFileSync(COMMON, "utf8"));
// Only patch rows that actually have a common name.
const ids = Object.keys(map).filter((k) => map[k]);
console.log(`Patching ${ids.length} species with common names...`);

async function patch(sisId, tries = 0) {
  try {
    const res = await fetch(`${URL}/rest/v1/species?sis_id=eq.${sisId}`, {
      method: "PATCH",
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ common_name: map[sisId] }),
    });
    if (!res.ok) {
      if (res.status >= 500 && tries < 5) { await new Promise((r) => setTimeout(r, 1000 * (tries + 1))); return patch(sisId, tries + 1); }
      const t = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${t.slice(0, 120)}`);
    }
  } catch (e) {
    if (tries < 5) { await new Promise((r) => setTimeout(r, 1500 * (tries + 1))); return patch(sisId, tries + 1); }
    throw e;
  }
}

let i = 0, done = 0, failed = 0;
async function worker() {
  while (i < ids.length) {
    const id = ids[i++];
    try { await patch(id); } catch { failed++; }
    if (++done % 500 === 0) console.log(`  ${done}/${ids.length}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`Done. Patched ${done - failed}/${ids.length} (${failed} failed).`);
