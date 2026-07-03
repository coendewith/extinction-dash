// Server-only IUCN Red List API v4 client. The token lives in the IUCN_TOKEN
// environment variable and must never reach the browser — only import this from
// route handlers / server code.

const IUCN_BASE = "https://api.iucnredlist.org/api/v4";

export interface IucnLive {
  sisId: number | null;
  category: string | null;
  yearPublished: string | null;
  possiblyExtinct: boolean;
  possiblyExtinctInWild: boolean;
  url: string | null;
}

export async function lookupSpecies(sci: string, token: string, revalidateSecs = 86400): Promise<IucnLive | null> {
  const [genus, species, infra] = sci.trim().split(/\s+/);
  if (!genus || !species) return null;
  const qs = new URLSearchParams({ genus_name: genus, species_name: species });
  if (infra) qs.set("infra_name", infra);

  const res = await fetch(`${IUCN_BASE}/taxa/scientific_name?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    // cache the upstream call so we don't hammer IUCN on every request
    next: { revalidate: revalidateSecs },
  });
  if (!res.ok) throw new Error(`IUCN HTTP ${res.status}`);
  const json = await res.json();
  const assessments: any[] = json.assessments || [];
  const latest =
    assessments.find((a) => a.latest && (a.scopes || []).some((s: any) => s.code === "1")) ||
    assessments.find((a) => a.latest) ||
    assessments[0];
  if (!latest) return null;

  let code: string = latest.red_list_category_code;
  if (code === "CR" && (latest.possibly_extinct || latest.possibly_extinct_in_the_wild)) code = "CR (PE)";
  const sisId = json.taxon?.sis_id ?? null;
  return {
    sisId,
    category: code,
    yearPublished: latest.year_published ?? null,
    possiblyExtinct: !!latest.possibly_extinct,
    possiblyExtinctInWild: !!latest.possibly_extinct_in_the_wild,
    url: latest.url || (sisId ? `https://www.iucnredlist.org/species/${sisId}` : null),
  };
}
