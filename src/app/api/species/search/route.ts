import { NextRequest, NextResponse } from "next/server";
import { searchSpecies } from "@/lib/supabase";

export const revalidate = 300;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const csv = (k: string) => {
    const v = sp.get(k);
    return v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
  };
  try {
    const result = await searchSpecies({
      q: sp.get("q") || undefined,
      categories: csv("category"),
      groups: csv("group"),
      country: sp.get("country") || undefined,
      sort: (sp.get("sort") as "severity" | "name" | "year") || "severity",
      dir: (sp.get("dir") as "asc" | "desc") || undefined,
      page: sp.get("page") ? parseInt(sp.get("page")!, 10) : 1,
      pageSize: sp.get("pageSize") ? parseInt(sp.get("pageSize")!, 10) : 50,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ rows: [], total: 0, page: 1, pageSize: 50, configured: false, error: String(e) }, { status: 200 });
  }
}
