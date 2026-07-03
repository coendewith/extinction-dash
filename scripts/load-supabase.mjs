// Bulk-load data/iucn/all-animals.ndjson into the Supabase `species` table via
// PostgREST (batched upserts). Reads SUPABASE_URL + SUPABASE_ANON_KEY from env or
// .env.local. Requires the temporary anon insert/update policy to be present
// during the load (dropped afterwards). Run: node scripts/load-supabase.mjs

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const NDJSON = join(ROOT, "data", "iucn", "all-animals.ndjson");
const BATCH = 1000;

function env(key) {
  if (process.env[key]) return process.env[key];
  const p = join(ROOT, ".env.local");
  if (existsSync(p)) {
    const m = readFileSync(p, "utf8").match(new RegExp("^\\s*" + key + "\\s*=\\s*(.+)\\s*$", "m"));
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  return null;
}
const URL = env("SUPABASE_URL");
const KEY = env("SUPABASE_ANON_KEY");
if (!URL || !KEY) { console.error("Missing SUPABASE_URL / SUPABASE_ANON_KEY"); process.exit(1); }

const SEVERITY = { EX: 90, EW: 80, "CR (PE)": 70, CR: 60, EN: 50, VU: 40, NT: 30, "LR/nt": 30, "LR/cd": 35, DD: 20, "LR/lc": 10, LC: 10 };
const severityOf = (c) => SEVERITY[c] ?? 5;

function rowFor(r) {
  return {
    sis_id: r.sisId,
    scientific_name: r.sci,
    group_name: r.group,
    category: r.category,
    severity: severityOf(r.category),
    possibly_extinct: !!r.possiblyExtinct,
    possibly_extinct_in_wild: !!r.possiblyExtinctInWild,
    year_published: r.yearPublished ?? null,
    assessment_id: r.assessmentId ?? null,
    url: r.url ?? null,
  };
}

async function postBatch(rows, tries = 0) {
  let res;
  try {
    res = await fetch(`${URL}/rest/v1/species`, {
      method: "POST",
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(rows),
    });
  } catch (e) {
    // network error (timeout / dropped connection) — retry with backoff
    if (tries < 6) { await new Promise((r) => setTimeout(r, 2000 * (tries + 1))); return postBatch(rows, tries + 1); }
    throw e;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status >= 500 && tries < 6) { await new Promise((r) => setTimeout(r, 1500 * (tries + 1))); return postBatch(rows, tries + 1); }
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
}

async function main() {
  if (!existsSync(NDJSON)) { console.error(`Missing ${NDJSON} — run the harvest first.`); process.exit(1); }
  const lines = readFileSync(NDJSON, "utf8").split("\n").filter(Boolean);
  console.log(`Loading ${lines.length.toLocaleString()} species into Supabase...`);
  let sent = 0;
  for (let i = 0; i < lines.length; i += BATCH) {
    const rows = lines.slice(i, i + BATCH).map((l) => rowFor(JSON.parse(l)));
    await postBatch(rows);
    sent += rows.length;
    if (sent % 10000 < BATCH) console.log(`  ${sent.toLocaleString()} / ${lines.length.toLocaleString()}`);
  }
  console.log(`Done. Upserted ${sent.toLocaleString()} rows.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
