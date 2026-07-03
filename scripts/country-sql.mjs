// Generate chunked INSERT SQL for species_countries for the given country codes,
// filtered to valid animal sis_ids and only DONE countries. Writes .sql chunks to
// the scratchpad for loading via the Supabase MCP (privileged; no anon policy).
//
// Usage: node scripts/country-sql.mjs ID BR US   (or with no args = all done countries)

import { existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const NDJSON = join(ROOT, "data", "iucn", "all-animals.ndjson");
const CDIR = join(ROOT, "data", "iucn", "parts", "countries");
const OUTDIR = "/private/tmp/claude-501/-Users-coendewith-extinction-dash/24aefb7c-4188-44e7-9b99-18defbd41e2c/scratchpad/country-sql";
const CHUNK = 6000;

import { mkdirSync } from "node:fs";
mkdirSync(OUTDIR, { recursive: true });

const valid = new Set();
for (const l of readFileSync(NDJSON, "utf8").split("\n").filter(Boolean)) { try { valid.add(JSON.parse(l).sisId); } catch {} }

let want = process.argv.slice(2);
if (!want.length) {
  want = readdirSync(CDIR).filter((f) => f.endsWith(".progress.json"))
    .filter((f) => { try { return JSON.parse(readFileSync(join(CDIR, f), "utf8")).done; } catch { return false; } })
    .map((f) => f.replace(".progress.json", ""));
}

const pairs = [];
const seen = new Set();
for (const code of want) {
  const pf = join(CDIR, `${code}.ndjson`);
  if (!existsSync(pf)) { console.error(`no part for ${code}`); continue; }
  for (const l of readFileSync(pf, "utf8").split("\n").filter(Boolean)) {
    const sis = parseInt(l, 10);
    if (!valid.has(sis)) continue;
    const k = sis + "|" + code;
    if (seen.has(k)) continue;
    seen.add(k);
    pairs.push(`(${sis},'${code}')`);
  }
}

let n = 0;
for (let i = 0; i < pairs.length; i += CHUNK) {
  const chunk = pairs.slice(i, i + CHUNK);
  const sql = `insert into public.species_countries (sis_id,country_code) values ${chunk.join(",")} on conflict do nothing;`;
  const path = join(OUTDIR, `chunk-${String(n).padStart(3, "0")}.sql`);
  writeFileSync(path, sql);
  n++;
}
console.log(`countries: ${want.join(",")}`);
console.log(`pairs: ${pairs.length}  chunks: ${n}  -> ${OUTDIR}`);
