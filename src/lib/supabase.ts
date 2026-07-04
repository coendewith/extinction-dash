// Server-side PostgREST helper for the Supabase `species` table.
// Read-only: uses the publishable/anon key under a public SELECT RLS policy.
// No @supabase/supabase-js dependency — PostgREST over fetch is enough here.

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_ANON_KEY;

export interface SpeciesRow {
  sis_id: number;
  scientific_name: string;
  common_name: string | null;
  group_name: string;
  category: string;
  severity: number;
  possibly_extinct: boolean;
  population_trend: string | null;
  population_size: string | null;
  population_summary: string | null;
  year_published: number | null;
  url: string | null;
}

export interface SearchParams {
  q?: string;
  categories?: string[];
  groups?: string[];
  country?: string;
  measured?: boolean;
  sort?: "severity" | "name" | "year" | "extinction" | "group" | "population" | "trend";
  dir?: "asc" | "desc";
  trend?: string;
  page?: number;
  pageSize?: number;
}

export interface SearchResult {
  rows: SpeciesRow[];
  total: number;
  page: number;
  pageSize: number;
  configured: boolean;
}

// PostgREST `in.(...)` needs values with spaces/parens double-quoted, e.g. "CR (PE)".
function inList(values: string[]): string {
  return "(" + values.map((v) => `"${v.replace(/"/g, '\\"')}"`).join(",") + ")";
}

export async function searchSpecies(p: SearchParams): Promise<SearchResult> {
  const page = Math.max(1, p.page || 1);
  const pageSize = Math.min(100, Math.max(1, p.pageSize || 50));
  if (!URL || !KEY) return { rows: [], total: 0, page, pageSize, configured: false };

  const params = new URLSearchParams();
  // Only honour a valid ISO-3166 alpha-2 code. A malformed code (e.g. "NLD")
  // must be ignored entirely — otherwise adding the inner-join without the
  // matching filter silently returns every species that has ANY country record.
  const country = (p.country || "").trim().toUpperCase();
  const validCountry = /^[A-Z]{2}$/.test(country) ? country : "";
  // When a country is selected, inner-join the occurrence table so only species
  // recorded in that country come back.
  const select = "sis_id,scientific_name,common_name,group_name,category,severity,possibly_extinct,population_trend,population_size,population_summary,year_published,url" +
    (validCountry ? ",species_countries!inner(country_code)" : "");
  params.set("select", select);
  if (validCountry) params.set("species_countries.country_code", "eq." + validCountry);

  if (p.categories?.length) params.set("category", "in." + inList(p.categories));
  if (p.groups?.length) params.set("group_name", "in." + inList(p.groups));
  // "Measured data only": species enriched with a real IUCN population trend
  // (the critical tier — CR/possibly-extinct/EW/EX).
  if (p.measured) params.set("population_trend", "not.is.null");
  const q = (p.q || "").trim();
  if (q) {
    const safe = q.replace(/[(),*]/g, " ").trim();
    if (safe) params.set("or", `(scientific_name.ilike.*${safe}*,common_name.ilike.*${safe}*)`);
  }

  if (p.trend) params.set("population_trend", "eq." + p.trend);

  // Column each sort maps to. "extinction" uses extinction_score (severity tuned
  // by trend, so recovering species drop to the safe end); higher score = sooner,
  // so its DB direction is flipped to keep "ascending = soonest projected".
  const SORT_COL: Record<string, string> = {
    name: "scientific_name",
    year: "year_published",
    group: "group_name",
    population: "population_num",
    trend: "population_trend",
    extinction: "extinction_score",
    severity: "severity",
  };
  const sortCol = SORT_COL[p.sort || "severity"] || "severity";
  const defaultDir = p.sort === "name" || p.sort === "group" || p.sort === "trend" || p.sort === "extinction" ? "asc" : "desc";
  // Never pass an arbitrary dir straight to PostgREST (it 400s on anything but asc/desc).
  const dir = p.dir === "asc" || p.dir === "desc" ? p.dir : defaultDir;
  const dbDir = p.sort === "extinction" ? (dir === "asc" ? "desc" : "asc") : dir;
  // stable secondary sort so pagination never repeats/skips rows
  params.set("order", `${sortCol}.${dbDir}${dbDir === "desc" ? ".nullslast" : ".nullsfirst"},sis_id.asc`);

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const res = await fetch(`${URL}/rest/v1/species?${params.toString()}`, {
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      Accept: "application/json",
      Range: `${from}-${to}`,
      "Range-Unit": "items",
      // exact count stays correct through the country inner-join; cheap at this scale
      Prefer: "count=exact",
    },
    next: { revalidate: 300 },
  });
  if (!res.ok) {
    // 416 = requested a page past the end. That's not an error — return an empty
    // page (still configured), with the real total from the Content-Range header.
    if (res.status === 416) {
      const cr = res.headers.get("content-range") || "";
      const total = parseInt(cr.split("/")[1] || "0", 10) || 0;
      return { rows: [], total, page, pageSize, configured: true };
    }
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase ${res.status}: ${text.slice(0, 200)}`);
  }
  const rows = (await res.json()) as SpeciesRow[];
  // Content-Range: "0-49/12345"
  const cr = res.headers.get("content-range") || "";
  const total = parseInt(cr.split("/")[1] || "0", 10) || rows.length;
  return { rows, total, page, pageSize, configured: true };
}
