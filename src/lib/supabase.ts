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
  sort?: "severity" | "name" | "year";
  dir?: "asc" | "desc";
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
  const country = (p.country || "").trim().toUpperCase();
  // When a country is selected, inner-join the occurrence table so only species
  // recorded in that country come back.
  const select = "sis_id,scientific_name,common_name,group_name,category,severity,possibly_extinct,population_trend,population_size,population_summary,year_published,url" +
    (country ? ",species_countries!inner(country_code)" : "");
  params.set("select", select);
  if (country && /^[A-Z]{2}$/.test(country)) params.set("species_countries.country_code", "eq." + country);

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

  const sortCol = p.sort === "name" ? "scientific_name" : p.sort === "year" ? "year_published" : "severity";
  const dir = p.dir || (p.sort === "name" ? "asc" : "desc");
  // stable secondary sort so pagination never repeats/skips rows
  params.set("order", `${sortCol}.${dir}${dir === "desc" ? ".nullslast" : ".nullsfirst"},sis_id.asc`);

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
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase ${res.status}: ${text.slice(0, 200)}`);
  }
  const rows = (await res.json()) as SpeciesRow[];
  // Content-Range: "0-49/12345"
  const cr = res.headers.get("content-range") || "";
  const total = parseInt(cr.split("/")[1] || "0", 10) || rows.length;
  return { rows, total, page, pageSize, configured: true };
}
