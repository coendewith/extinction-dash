import { NextResponse } from "next/server";
import speciesData from "@/data/species.json";
import { lookupSpecies } from "@/lib/iucn";
import type { Species, SpeciesPayload } from "@/lib/types";

// Revalidate the whole response once a day; the live IUCN calls are cached too,
// so this route is cheap after the first hit in each window.
export const revalidate = 86400;

const baked = speciesData as unknown as SpeciesPayload;

export async function GET() {
  const token = process.env.IUCN_TOKEN;

  // No token (e.g. env var not set) → serve the build-time snapshot. The site
  // still works fully; it just isn't refreshed live.
  if (!token) {
    return NextResponse.json({ ...baked, live: false, reason: "no-token" });
  }

  try {
    const refreshed: Species[] = await Promise.all(
      baked.species.map(async (s) => {
        try {
          const live = await lookupSpecies(s.sci, token);
          const valid = live && live.category && !["NE", "DD"].includes(live.category);
          if (!live) return s;
          return {
            ...s,
            // displayed status stays the curated, taxon-correct value; live data
            // updates the IUCN metadata + canonical link.
            iucn: {
              sisId: live.sisId ?? s.iucn.sisId,
              category: valid ? live.category : s.iucn.category,
              yearPublished: live.yearPublished ?? s.iucn.yearPublished,
              possiblyExtinct: live.possiblyExtinct,
              possiblyExtinctInWild: live.possiblyExtinctInWild,
              matchesSeed: valid ? live.category === s.status : s.iucn.matchesSeed,
              url: live.url || s.iucn.url,
            },
          };
        } catch {
          return s; // per-species failure → keep the baked entry
        }
      })
    );

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      source: "Live IUCN Red List v4 overlay on the curated watchlist",
      count: refreshed.length,
      enrichedFromIucn: refreshed.filter((s) => s.iucn.category).length,
      species: refreshed,
      live: true,
    });
  } catch {
    // total failure (network down, etc.) → build-time snapshot
    return NextResponse.json({ ...baked, live: false, reason: "iucn-unreachable" });
  }
}
