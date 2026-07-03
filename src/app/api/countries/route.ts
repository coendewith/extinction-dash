import { NextResponse } from "next/server";

export const revalidate = 300;

// Returns the set of country codes that actually have occurrence data loaded, so
// the UI dropdown only offers countries you can really filter by (the country
// harvest fills these in over time).
export async function GET() {
  const URL = process.env.SUPABASE_URL;
  const KEY = process.env.SUPABASE_ANON_KEY;
  if (!URL || !KEY) return NextResponse.json({ codes: [] });
  try {
    const res = await fetch(`${URL}/rest/v1/rpc/available_countries`, {
      method: "POST",
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Accept: "application/json" },
      body: "{}",
      next: { revalidate: 300 },
    });
    if (!res.ok) return NextResponse.json({ codes: [] });
    const codes = (await res.json()) as string[];
    return NextResponse.json({ codes: Array.isArray(codes) ? codes : [] });
  } catch {
    return NextResponse.json({ codes: [] });
  }
}
