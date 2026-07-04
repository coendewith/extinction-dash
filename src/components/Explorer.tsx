"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Species } from "@/lib/types";
import { STATUS, GROUP_ICON, genSpark, since, ymd } from "@/lib/species";
import type { SpeciesRow } from "@/lib/supabase";
import COUNTRIES from "@/data/countries.json";

// Per-row trend + illustrative abundance sparkline. Uses the species' measured
// IUCN population trend when we have it; otherwise an illustrative trajectory
// from the IUCN category (threatened → declining, LC → stable, extinct → gone),
// matching how the original watchlist drew its illustrative sparklines.
const GONE_SPARK = { obs: "3,8 44,14 86,26 128,36 170,41", proj: "170,41 176,42" };
const FLAT_SPARK = { obs: "3,26 44,25 86,26 128,25 170,26", proj: "170,26 176,26" };
function trendInfo(cat: string, real: string | null) {
  // A non-null IUCN trend is "measured" — including a measured "unknown"
  // (IUCN assessed it and couldn't determine direction). Only fall back to an
  // illustrative category-derived trajectory when we have no measured value.
  const measured = !!real && ["up", "down", "stable", "unknown"].includes(real);
  const isGone = cat === "EX" || cat === "EW";
  const dir = measured
    ? (real as "up" | "down" | "stable" | "unknown")
    : isGone
    ? "gone"
    : ["CR (PE)", "CR", "EN", "VU", "NT", "LR/nt", "LR/cd"].includes(cat)
    ? "down"
    : ["LC", "LR/lc"].includes(cat)
    ? "stable"
    : "unknown";
  const M: Record<string, { icon: string; color: string; label: string; spark: { obs: string; proj: string } }> = {
    down: { icon: "ph-arrow-down", color: "#c23417", label: "Declining", spark: genSpark("down") },
    up: { icon: "ph-arrow-up", color: "#4f8a48", label: "Recovering", spark: genSpark("up") },
    stable: { icon: "ph-arrow-right", color: "#8a8069", label: "Stable", spark: genSpark("stable") },
    gone: { icon: "ph-x", color: cat === "EW" ? "#4a3f6b" : "#8a8069", label: cat === "EW" ? "Gone (wild)" : "Extinct", spark: GONE_SPARK },
    unknown: { icon: "ph-minus", color: "#b9ae94", label: "Unknown", spark: FLAT_SPARK },
  };
  return { ...M[dir], measured };
}

// Indicative extinction-risk window from the IUCN category, tightened by the
// measured population trend and (where known) population size. This is MODELLED
// from the Red List category's Criterion E risk horizon — not a per-species
// population model — so it is always shown as a range, never a single fabricated
// date and never a days-left counter. Curated species override this with their
// published Criterion E windows. Categories below VU / DD get no window.
const NOW_YEAR = 2026;
const RISK_BASE: Record<string, [number, number]> = {
  "CR (PE)": [0, 12], // possibly extinct already
  CR: [8, 55],
  EN: [25, 95],
  VU: [60, 150],
};
function popNumber(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = s.replace(/,/g, "").match(/\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}
type Projection =
  | { kind: "window"; lo: number; hi: number; mid: number; label: string; sub: string; color: string; beyond: boolean }
  | { kind: "extinct"; label: string; sub: string; color: string }
  | { kind: "ew"; label: string; sub: string; color: string }
  | { kind: "recovering"; label: string; sub: string; color: string }
  | { kind: "none"; label: string; sub: string; color: string };
function projectionFor(cat: string, trend: string | null, popSize: string | null | undefined): Projection {
  if (cat === "EX") return { kind: "extinct", label: "Extinct", sub: "confirmed", color: "#8a8069" };
  if (cat === "EW") return { kind: "ew", label: "Extinct in wild", sub: "no wild population", color: "#4a3f6b" };
  // A measured increasing population is recovering — no extinction countdown.
  if (trend === "up") return { kind: "recovering", label: "Recovering", sub: "population rising", color: "#4f8a48" };
  const base = RISK_BASE[cat];
  if (!base) return { kind: "none", label: "—", sub: cat === "DD" ? "data deficient" : "lower risk", color: "#b9ae94" };
  let m = trend === "down" ? 0.72 : trend === "up" ? 1.6 : trend === "unknown" ? 1.15 : 1.0;
  const n = popNumber(popSize);
  if (n != null && n > 0) {
    if (n < 50) m *= 0.5;
    else if (n < 250) m *= 0.68;
    else if (n < 1000) m *= 0.82;
    else if (n >= 1_000_000) m *= 1.3;
  }
  const lo = Math.max(NOW_YEAR, NOW_YEAR + Math.round(base[0] * m));
  const hi = NOW_YEAR + Math.round(base[1] * m);
  const mid = Math.round((lo + hi) / 2);
  const beyond = hi > 2130;
  const color = cat === "CR (PE)" || cat === "CR" ? "#c23417" : cat === "EN" ? "#cf8f34" : "#8a8069";
  return { kind: "window", lo, hi, mid, label: "≈" + mid, sub: beyond ? `${lo}–2130+` : `${lo}–${hi}`, color, beyond };
}

type SortKey = "severity" | "name" | "year" | "extinction" | "group" | "population" | "trend";

const DISPLAY = "'Bricolage Grotesque', sans-serif";
const SERIF = "'Newsreader', Georgia, serif";
const MONO = "'Space Mono', monospace";

const GROUPS = [
  "Mammals", "Birds", "Fish", "Amphibians", "Reptiles", "Insects", "Molluscs",
  "Crustaceans", "Arachnids", "Corals & anemones", "Cnidarians", "Annelids", "Echinoderms",
];
const CATS = ["EX", "EW", "CR (PE)", "CR", "EN", "VU", "NT", "LC", "DD"];
const PRESETS: { label: string; cats: string[] }[] = [
  { label: "Extinct", cats: ["EX", "EW", "CR (PE)"] },
  { label: "Threatened", cats: ["CR", "EN", "VU"] },
];

interface WikiInfo {
  title?: string;
  img?: string;
  extract?: string;
  loaded: boolean;
}

export default function Explorer({ curated }: { curated: Species[] }) {
  const curatedBySis = useMemo(() => {
    const m = new Map<number, Species>();
    for (const s of curated) if (s.iucn?.sisId) m.set(s.iucn.sisId, s);
    return m;
  }, [curated]);

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [cats, setCats] = useState<Set<string>>(new Set());
  const [group, setGroup] = useState<string>("");
  const [country, setCountry] = useState<string>("");
  const [measured, setMeasured] = useState(true); // default: only species with real IUCN-measured data
  const [trendFilter, setTrendFilter] = useState<string>(""); // "" | "up" (Recovering) | "down"
  const [sort, setSort] = useState<SortKey>("severity");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const [rows, setRows] = useState<SpeciesRow[]>([]);
  const [total, setTotal] = useState(0);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [wiki, setWiki] = useState<Record<string, WikiInfo>>({});
  const [availableCountries, setAvailableCountries] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => Date.now());

  // which countries actually have occurrence data loaded (grows as the harvest runs)
  useEffect(() => {
    let cancelled = false;
    fetch("/api/countries")
      .then((r) => r.json())
      .then((j) => { if (!cancelled && Array.isArray(j?.codes)) setAvailableCountries(new Set(j.codes)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // debounce the search box
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  // reset to page 1 whenever the query shape changes
  useEffect(() => {
    setPage(1);
  }, [debouncedQ, cats, group, country, measured, trendFilter, sort, dir]);

  // fetch results
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    if (debouncedQ) params.set("q", debouncedQ);
    if (cats.size) params.set("category", [...cats].join(","));
    if (group) params.set("group", group);
    if (country) params.set("country", country);
    if (measured) params.set("measured", "1");
    if (trendFilter) params.set("trend", trendFilter);
    params.set("sort", sort);
    params.set("dir", dir);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    fetch("/api/species/search?" + params.toString())
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        setRows(j.rows || []);
        setTotal(j.total || 0);
        setConfigured(j.configured !== false);
        setExpanded(null);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQ, cats, group, country, measured, trendFilter, sort, dir, page]);

  // lazy Wikipedia enrichment for the visible rows (image + common name + extract)
  useEffect(() => {
    let cancelled = false;

    const summary = (title: string) =>
      fetch("https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(title.replace(/ /g, "_")))
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null);

    // Trust a summary only if it plausibly matches THIS species — Wikipedia often
    // redirects a binomial to a broader article (Sus bucculentus → "Wild boar").
    const matchStrict = (j: any, sci: string) => {
      if (!j || j.type === "disambiguation") return false;
      const parts = sci.toLowerCase().split(/\s+/);
      const genus = parts[0] || "", epithet = parts[1] || "";
      const title = (j.title || "").toLowerCase();
      const canon = (j.titles?.canonical || "").toLowerCase().replace(/_/g, " ");
      const extract = (j.extract || "").toLowerCase();
      const epithetRe = epithet ? new RegExp("\\b" + epithet.replace(/[.*+?^${}()|[\]\\]/g, "") + "\\b") : null;
      return (
        title === sci.toLowerCase() || canon === sci.toLowerCase() ||
        (!!epithet && (extract.includes(genus + " " + epithet) || (!!epithetRe && epithetRe.test(extract))))
      );
    };

    rows.forEach(async (r) => {
      const key = r.scientific_name;
      if (wiki[key]?.loaded) return;
      const info: WikiInfo = { loaded: true };

      // 1. by scientific name (validates species identity strictly)
      const jSci = await summary(key);
      if (matchStrict(jSci, key)) {
        info.title = jSci.title;
        info.img = jSci.thumbnail?.source || jSci.originalimage?.source;
        info.extract = jSci.extract;
      }

      // 2. fall back to the IUCN common name — many species' articles live under
      //    the common name and never redirect from the binomial, so a real photo
      //    was being missed. The common name is authoritative (IUCN, for THIS
      //    species), so accept its lead image when present.
      if (!info.img && r.common_name) {
        const jCn = await summary(r.common_name);
        if (jCn && jCn.type !== "disambiguation") {
          const img = jCn.thumbnail?.source || jCn.originalimage?.source;
          if (img) {
            info.img = img;
            if (!info.title) info.title = jCn.title;
            if (!info.extract) info.extract = jCn.extract;
          }
        }
      }

      if (!cancelled) setWiki((prev) => ({ ...prev, [key]: info }));
    });
    return () => {
      cancelled = true;
    };
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleCat = (c: string) =>
    setCats((prev) => {
      const n = new Set(prev);
      n.has(c) ? n.delete(c) : n.add(c);
      return n;
    });
  const applyPreset = (p: string[]) =>
    setCats((prev) => {
      const same = prev.size === p.length && p.every((c) => prev.has(c));
      return same ? new Set() : new Set(p);
    });
  const clickSort = (key: SortKey) => {
    if (sort === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setDir(key === "name" || key === "extinction" || key === "group" || key === "trend" ? "asc" : "desc");
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const chip = (active: boolean) =>
    active
      ? { background: "#1b1813", color: "#efe7d6", border: "1px solid #1b1813" }
      : { background: "transparent", color: "#4f4839", border: "1px solid rgba(27,24,19,.22)" };
  const H: React.CSSProperties = { fontFamily: MONO, fontWeight: 700, fontSize: 9.5, letterSpacing: ".1em", color: "#8a8069" };

  const commonName = (r: SpeciesRow) => {
    const w = wiki[r.scientific_name];
    if (r.common_name) return r.common_name;
    if (w?.title && w.title.toLowerCase() !== r.scientific_name.toLowerCase()) return w.title;
    return null;
  };

  return (
    <section id="watchlist" style={{ background: "#efe7d6", color: "#1b1813" }}>
      <div style={{ maxWidth: 1220, margin: "0 auto", padding: "48px 30px 54px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
          <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 11, letterSpacing: ".2em", color: "#d8391c" }}>FIG. 02</span>
          <span style={{ width: 34, height: 1, background: "rgba(27,24,19,.3)" }} />
          <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 11, letterSpacing: ".2em", color: "#8a8069" }}>THE COMPLETE RED LIST</span>
        </div>
        <h2 style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 32, lineHeight: 1.02, letterSpacing: "-.02em", margin: 0 }}>
          Ranked by how close to extinction
        </h2>
        <p style={{ fontFamily: SERIF, fontSize: 16, lineHeight: 1.55, color: "#4f4839", margin: "8px 0 0", maxWidth: "78ch" }}>
          {measured ? (
            <>
              Showing the <b>{total > 0 ? total.toLocaleString("en-US") : "—"}</b> most-imperilled species
              {country ? ` in ${(COUNTRIES as { code: string; name: string }[]).find((c) => c.code === country)?.name || country}` : ""} with{" "}
              <b>real IUCN-measured</b> population trend &amp; figures — the critical tier. Turn off &ldquo;Measured data only&rdquo; to browse all
              88,404 assessed animals.
            </>
          ) : (
            <>
              Every animal the IUCN has assessed — <b>{total > 0 ? total.toLocaleString("en-US") : "—"}</b> species
              {country ? ` recorded in ${(COUNTRIES as { code: string; name: string }[]).find((c) => c.code === country)?.name || country}` : ""}, the
              soonest-to-vanish first. Trend beyond the critical tier is illustrative (marked ·).
            </>
          )}{" "}
          Each row carries a population-trend arrow and abundance sparkline; already-extinct species sink to the bottom. Photos and names load from
          Wikipedia; search matches scientific names.
        </p>

        {/* controls */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 11, marginTop: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, background: "#f6f0e2", border: "1px solid rgba(27,24,19,.2)", borderRadius: 3, padding: "9px 14px", minWidth: 260 }}>
            <i className="ph ph-magnifying-glass" style={{ color: "#8a8069", fontSize: 15 }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search scientific name (e.g. Panthera)"
              style={{ border: "none", outline: "none", background: "transparent", fontFamily: MONO, fontSize: 12.5, color: "#1b1813", width: "100%" }}
            />
            {q && (
              <button onClick={() => setQ("")} style={{ border: "none", background: "none", cursor: "pointer", color: "#8a8069", padding: 0, display: "flex" }}>
                <i className="ph ph-x" style={{ fontSize: 14 }} />
              </button>
            )}
          </div>
          {PRESETS.map((p) => {
            const active = cats.size === p.cats.length && p.cats.every((c) => cats.has(c));
            return (
              <button key={p.label} onClick={() => applyPreset(p.cats)} style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".04em", textTransform: "uppercase", padding: "8px 13px", borderRadius: 2, cursor: "pointer", ...chip(active) }}>
                {p.label}
              </button>
            );
          })}
          {/* trend filters — measured population direction */}
          {[
            { label: "Recovering", v: "up", icon: "ph-bold ph-trend-up" },
            { label: "Declining", v: "down", icon: "ph-bold ph-trend-down" },
          ].map((tf) => {
            const active = trendFilter === tf.v;
            return (
              <button key={tf.v} onClick={() => setTrendFilter((cur) => (cur === tf.v ? "" : tf.v))} title="Filter by measured IUCN population trend"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 11, letterSpacing: ".04em", textTransform: "uppercase", padding: "8px 12px", borderRadius: 2, cursor: "pointer", ...chip(active) }}>
                <i className={tf.icon} style={{ fontSize: 13 }} />{tf.label}
              </button>
            );
          })}
          {availableCountries.size > 0 && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: country ? "#1b1813" : "#f6f0e2", border: `1px solid ${country ? "#1b1813" : "rgba(27,24,19,.2)"}`, borderRadius: 3, padding: "0 10px", height: 34 }}>
              <i className="ph ph-globe-hemisphere-west" style={{ fontSize: 15, color: country ? "#efe7d6" : "#8a8069" }} />
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                style={{ border: "none", outline: "none", background: "transparent", fontFamily: MONO, fontSize: 12, color: country ? "#efe7d6" : "#1b1813", cursor: "pointer", height: 32, maxWidth: 190 }}
              >
                <option value="">All countries</option>
                {(COUNTRIES as { code: string; name: string }[])
                  .filter((c) => availableCountries.has(c.code))
                  .map((c) => (
                    <option key={c.code} value={c.code} style={{ color: "#1b1813" }}>{c.name}</option>
                  ))}
              </select>
            </div>
          )}
          <button
            onClick={() => setMeasured((v) => !v)}
            title="Show only species enriched with a real IUCN-measured population trend + population figures (the critical tier)"
            style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: MONO, fontSize: 11, letterSpacing: ".04em", textTransform: "uppercase", padding: "8px 13px", borderRadius: 2, cursor: "pointer", background: measured ? "#2c8a80" : "transparent", color: measured ? "#f2ece0" : "#4f4839", border: measured ? "1px solid #2c8a80" : "1px solid rgba(27,24,19,.22)" }}
          >
            <i className={measured ? "ph-fill ph-check-circle" : "ph ph-circle"} style={{ fontSize: 14 }} />
            Measured data only
          </button>
          <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 11.5, color: "#8a8069" }}>
            {loading ? "loading…" : `${total.toLocaleString("en-US")} species`}
          </span>
        </div>

        {/* category chips */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 10 }}>
          <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 10, letterSpacing: ".14em", color: "#8a8069", marginRight: 3 }}>STATUS</span>
          {CATS.map((c) => {
            const st = STATUS[c];
            const active = cats.has(c);
            return (
              <button
                key={c}
                onClick={() => toggleCat(c)}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 11, letterSpacing: ".04em", padding: "7px 11px", borderRadius: 2, cursor: "pointer", background: active ? "#1b1813" : st ? st.bg : "transparent", color: active ? "#efe7d6" : "#1b1813", border: active ? "1px solid #1b1813" : "1px solid rgba(27,24,19,.18)" }}
              >
                <span style={{ width: 6, height: 6, background: st?.dot || "#8a8069", flex: "none" }} />
                {c}
              </button>
            );
          })}
        </div>

        {/* group chips */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 10 }}>
          <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 10, letterSpacing: ".14em", color: "#8a8069", marginRight: 3 }}>GROUP</span>
          <button onClick={() => setGroup("")} style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".04em", textTransform: "uppercase", padding: "7px 12px", borderRadius: 2, cursor: "pointer", ...chip(group === "") }}>All</button>
          {GROUPS.map((g) => (
            <button key={g} onClick={() => setGroup((cur) => (cur === g ? "" : g))} style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".04em", textTransform: "uppercase", padding: "7px 12px", borderRadius: 2, cursor: "pointer", ...chip(group === g) }}>
              {g}
            </button>
          ))}
        </div>

        {!configured && (
          <div style={{ marginTop: 16, padding: "14px 18px", background: "rgba(216,57,28,.08)", border: "1px solid rgba(216,57,28,.3)", borderRadius: 4, fontFamily: SERIF, fontSize: 14, color: "#8a3320" }}>
            The species database isn&rsquo;t configured (missing Supabase environment variables).
          </div>
        )}

        {/* table — scrolls horizontally on small screens so the full row stays viewable */}
        <div className="wl-card">
         <div className="wl-scroll">
          <div className="wl-inner">
          <div className="wl-head wl-grid">
            <div style={H}>#</div>
            <SortHead label="SPECIES" active={sort === "name"} dir={dir} onClick={() => clickSort("name")} />
            <SortHead className="wl-c-group" label="GROUP" active={sort === "group"} dir={dir} onClick={() => clickSort("group")} />
            <SortHead label="RISK" active={sort === "severity"} dir={dir} onClick={() => clickSort("severity")} />
            <SortHead className="wl-c-pop" label="POPULATION" active={sort === "population"} dir={dir} onClick={() => clickSort("population")} />
            <SortHead label="EST. EXTINCTION" active={sort === "extinction"} dir={dir} onClick={() => clickSort("extinction")} />
            <SortHead className="wl-c-trend" label="TREND" active={sort === "trend"} dir={dir} onClick={() => clickSort("trend")} />
            <SortHead className="wl-c-assessed" label="ASSESSED" active={sort === "year"} dir={dir} onClick={() => clickSort("year")} />
            <div />
          </div>

              {loading && rows.length === 0 && (
                <div style={{ padding: "40px 22px", textAlign: "center", fontFamily: MONO, fontSize: 12, color: "#8a8069" }}>Loading species…</div>
              )}

              {rows.map((r, i) => {
                const st = STATUS[r.category] || { dot: "#8a8069", bg: "rgba(138,128,105,.14)", full: r.category };
                const w = wiki[r.scientific_name];
                const cn = commonName(r);
                const expandedRow = expanded === r.sis_id;
                const rank = (page - 1) * pageSize + i + 1;
                const t = trendInfo(r.category, r.population_trend);
                const cur = curatedBySis.get(r.sis_id);
                const popText = cur?.pop || r.population_size || "—";
                // Projected extinction: curated precise window, else modelled range.
                let estMain = "—", estSub = "", estColor = "#8a8069", estTitle = "";
                if (cur?.kind === "window" && cur.win) {
                  estMain = "≈" + Math.round((cur.win[0] + cur.win[1]) / 2);
                  estSub = `${cur.win[0]}–${cur.win[1]}`;
                  estColor = "#c23417";
                  estTitle = "Curated Criterion E projected window";
                } else {
                  const p = projectionFor(r.category, r.population_trend, r.population_size);
                  estMain = p.label;
                  estSub = p.sub;
                  estColor = p.color;
                  estTitle = p.kind === "window" ? "Modelled risk window — IUCN category + trend (indicative range)" : "";
                }
                return (
                  <div key={r.sis_id} style={{ borderTop: "1px solid rgba(27,24,19,.09)" }}>
                    <div onClick={() => setExpanded((id) => (id === r.sis_id ? null : r.sis_id))} className="wl-row wl-grid" style={{ background: expandedRow ? "rgba(27,24,19,.05)" : "transparent" }}>
                      <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 13, color: "#b9ae94" }}>{rank}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
                        <div style={{ width: 38, height: 38, flex: "none", borderRadius: 3, overflow: "hidden", background: "#16221b", border: "1px solid rgba(27,24,19,.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {w?.img ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={w.img} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            <i className={"ph " + (GROUP_ICON[r.group_name] || "ph-paw-print")} style={{ fontSize: 16, color: "rgba(55,169,157,.55)" }} />
                          )}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 15, color: "#1b1813", lineHeight: 1.15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {cn || <span style={{ fontStyle: "italic", fontFamily: SERIF }}>{r.scientific_name}</span>}
                          </div>
                          {cn && <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 12.5, color: "#8a8069", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.scientific_name}</div>}
                        </div>
                      </div>
                      <div className="wl-c-group" style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".02em", color: "#4f4839", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.group_name}</div>
                      <div>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: st.bg, padding: "4px 8px", borderRadius: 2 }}>
                          <span style={{ width: 6, height: 6, background: st.dot, flex: "none" }} />
                          <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 10.5, color: "#1b1813" }}>{r.category}</span>
                        </span>
                      </div>
                      <div className="wl-c-pop" style={{ fontFamily: MONO, fontSize: 11, color: "#4f4839", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={popText}>{popText}</div>
                      <div title={estTitle}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                          <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 13, color: estColor }}>{estMain}</span>
                          {estSub && <span style={{ fontFamily: MONO, fontSize: 9, color: "#8a8069", whiteSpace: "nowrap" }}>{estSub}</span>}
                        </div>
                        <svg className="wl-spark" viewBox="0 0 176 46" style={{ width: "100%", maxWidth: 150, height: 15, display: "block", marginTop: 3 }}>
                          <polyline points={t.spark.obs} fill="none" stroke={t.color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" opacity={t.measured ? 1 : 0.7} />
                          <polyline points={t.spark.proj} fill="none" stroke={t.color} strokeWidth={2.5} strokeDasharray="3 3" opacity={0.5} strokeLinecap="round" />
                        </svg>
                      </div>
                      <div className="wl-c-trend" style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: MONO, fontSize: 10.5, color: t.color, minWidth: 0 }} title={t.measured ? "Measured IUCN population trend" : "Illustrative — by IUCN category"}>
                        <i className={"ph-bold " + t.icon} style={{ fontSize: 14, flex: "none" }} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.label}</span>
                        {!t.measured && <span style={{ color: "#b9ae94", fontSize: 12, lineHeight: 1, flex: "none" }} title="illustrative by category">·</span>}
                      </div>
                      <div className="wl-c-assessed" style={{ fontFamily: MONO, fontSize: 12, color: "#4f4839" }}>{r.year_published || "—"}</div>
                      <div style={{ display: "flex", justifyContent: "center" }}>
                        <i className={expandedRow ? "ph ph-caret-up" : "ph ph-caret-down"} style={{ fontSize: 16, color: "#8a8069" }} />
                      </div>
                    </div>
                    {expandedRow && <Detail r={r} wiki={w} curated={cur} now={now} />}
                  </div>
                );
              })}

          {!loading && rows.length === 0 && configured && (
            <div style={{ padding: "34px 22px", textAlign: "center", fontFamily: SERIF, color: "#8a8069", fontSize: 15, borderTop: "1px solid rgba(27,24,19,.09)" }}>No species match these filters.</div>
          )}
          </div>
         </div>
        </div>

        {/* pagination */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
          <div style={{ fontFamily: MONO, fontSize: 11, color: "#8a8069" }}>
            {total > 0 ? `${((page - 1) * pageSize + 1).toLocaleString()}–${Math.min(page * pageSize, total).toLocaleString()} of ${total.toLocaleString()}` : "—"}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <PageBtn disabled={page <= 1} onClick={() => setPage(1)}>« First</PageBtn>
            <PageBtn disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>‹ Prev</PageBtn>
            <span style={{ fontFamily: MONO, fontSize: 12, color: "#1b1813", padding: "0 6px" }}>
              {page} / {totalPages.toLocaleString()}
            </span>
            <PageBtn disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next ›</PageBtn>
            <PageBtn disabled={page >= totalPages} onClick={() => setPage(totalPages)}>Last »</PageBtn>
          </div>
        </div>
        <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: ".02em", color: "#8a8069", marginTop: 12 }}>
          CLICK ANY ROW FOR DETAIL / EST. EXTINCTION IS A MODELLED RISK WINDOW FROM IUCN CATEGORY + TREND (A RANGE, NOT A DATED PREDICTION) / CURATED SPECIES USE PUBLISHED CRITERION E WINDOWS / TREND IS MEASURED WHERE KNOWN, ELSE ILLUSTRATIVE (·) / DATA: IUCN RED LIST v4 · WIKIPEDIA
        </div>
      </div>
    </section>
  );
}

function SortHead({ label, active, dir, onClick, className }: { label: string; active: boolean; dir: string; onClick: () => void; className?: string }) {
  return (
    <button className={className} onClick={onClick} title={`Sort by ${label.toLowerCase()}`} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: MONO, fontWeight: 700, fontSize: 9.5, letterSpacing: ".1em", color: active ? "#1b1813" : "#8a8069", textAlign: "left" }}>
      {label}
      {active ? (
        <i className={dir === "desc" ? "ph-bold ph-caret-down" : "ph-bold ph-caret-up"} style={{ fontSize: 11, color: "#d8391c" }} />
      ) : (
        <i className="ph-bold ph-caret-up-down" style={{ fontSize: 11, color: "#b9ae94" }} />
      )}
    </button>
  );
}

function PageBtn({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".04em", padding: "7px 11px", borderRadius: 2, cursor: disabled ? "default" : "pointer", background: "transparent", color: disabled ? "rgba(27,24,19,.3)" : "#1b1813", border: "1px solid rgba(27,24,19,.22)" }}
    >
      {children}
    </button>
  );
}

function Detail({ r, wiki, curated, now }: { r: SpeciesRow; wiki?: WikiInfo; curated?: Species; now: number }) {
  const st = STATUS[r.category] || { full: r.category };
  const wikiUrl = "https://en.wikipedia.org/wiki/" + encodeURIComponent((wiki?.title || r.scientific_name).replace(/ /g, "_"));
  const gbifUrl = "https://www.gbif.org/species/search?q=" + encodeURIComponent(r.scientific_name);
  const iucnUrl = r.url || `https://www.iucnredlist.org/species/${r.sis_id}`;
  const t = trendInfo(r.category, r.population_trend);
  const proj = projectionFor(r.category, r.population_trend, r.population_size);
  const measured = !!r.population_trend;

  // Right-hand projection box: curated precise window > modelled range > status.
  let boxKicker = "MODELLED / PROJECTED WINDOW", boxKickerColor = "#e3a63e", boxBig = "", boxNote = "";
  if (curated?.kind === "window" && curated.win) {
    boxBig = `${curated.win[0]}\u2013${curated.win[1]}`;
    boxNote = curated.conf || "Curated Criterion E window.";
  } else if (proj.kind === "recovering") {
    boxKicker = "STATUS";
    boxKickerColor = "#79bd6e";
    boxBig = "Recovering";
    boxNote = "Measured population is rising \u2014 no extinction countdown while the trend holds.";
  } else if (proj.kind === "window") {
    boxKicker = "MODELLED / RISK WINDOW";
    boxBig = `${proj.lo}\u2013${proj.beyond ? "2130+" : proj.hi}`;
    boxNote = `Indicative horizon from the ${st.full} category${measured ? " and measured trend" : ""} \u2014 not a dated per-species projection.`;
  } else {
    boxKicker = "STATUS";
    boxKickerColor = "#8a8069";
    boxBig = proj.kind === "extinct" ? "Extinct" : proj.kind === "ew" ? "Extinct in the wild" : "Not projected";
    boxNote = proj.kind === "none" && r.category === "DD" ? "Data deficient \u2014 too little known to assess extinction risk." : proj.kind === "none" ? "Lower-risk category \u2014 no extinction window projected." : "";
  }

  return (
    <div style={{ padding: "4px 22px 26px", background: "rgba(27,24,19,.035)" }}>
      <div className="detail-grid" style={{ display: "grid", gridTemplateColumns: "180px minmax(0,1fr) 236px", gap: 26, alignItems: "start", paddingTop: 18 }}>
        {/* col 1 — photo + links */}
        <div className="detail-photo">
          <div style={{ width: "100%", height: 150, borderRadius: 3, background: "#16221b", border: "1px solid rgba(27,24,19,.12)", position: "relative", overflow: "hidden", display: "flex", alignItems: "flex-end", padding: 10 }}>
            {wiki?.img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={wiki.img} alt={r.scientific_name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <>
                <i className={"ph " + (GROUP_ICON[r.group_name] || "ph-paw-print")} style={{ position: "absolute", top: 12, right: 12, fontSize: 26, color: "rgba(55,169,157,.6)" }} />
                <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: ".06em", color: "rgba(236,227,208,.55)" }}>NO PHOTO ON WIKIPEDIA</span>
              </>
            )}
          </div>
          {wiki?.img && <div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: ".04em", color: "#8a8069", marginTop: 5 }}>PHOTO / WIKIMEDIA COMMONS</div>}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 9 }}>
            <a href={wikiUrl} target="_blank" rel="noopener noreferrer" style={linkStyle}>WIKIPEDIA <i className="ph ph-arrow-square-out" style={{ fontSize: 12 }} /></a>
            <a href={iucnUrl} target="_blank" rel="noopener noreferrer" style={linkStyle}>IUCN <i className="ph ph-arrow-square-out" style={{ fontSize: 12 }} /></a>
            <a href={gbifUrl} target="_blank" rel="noopener noreferrer" style={linkStyle}>GBIF <i className="ph ph-arrow-square-out" style={{ fontSize: 12 }} /></a>
          </div>
        </div>

        {/* col 2 — facts + notes */}
        <div className="detail-main">
          <div className="detail-facts" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 22px" }}>
            {curated?.region && <Fact label="REGION">{curated.region}</Fact>}
            <Fact label="EST. WILD POPULATION">{curated?.pop || r.population_size || "Not published"}{(curated?.pop || r.population_size) ? <span style={{ color: "#8a8069" }}> (measured)</span> : null}</Fact>
            {curated?.lastSeen && (
              <Fact label="MEASURED / SINCE LAST SIGHTING">
                <span style={{ fontFamily: MONO, fontWeight: 700 }}>{since(curated.lastSeen, now)} ago</span>
                <div style={{ fontFamily: SERIF, fontSize: 13, color: "#8a8069" }}>last seen {ymd(curated.lastSeen)}</div>
              </Fact>
            )}
            <Fact label="IUCN STATUS">{st.full}{curated?.critE ? " \u00b7 Criterion E" : ""}</Fact>
            <Fact label="GROUP">{r.group_name}</Fact>
            <Fact label="ASSESSED">{r.year_published || "\u2014"}</Fact>
            <div>
              <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 9.5, letterSpacing: ".1em", color: "#8a8069" }}>POPULATION TREND {measured ? "" : "(illustrative)"}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: SERIF, fontSize: 15, color: t.color }}>
                  <i className={"ph-bold " + t.icon} style={{ fontSize: 15 }} />{t.label}
                </span>
              </div>
            </div>
          </div>
          {r.population_summary && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 9.5, letterSpacing: ".1em", color: "#d8391c" }}>IUCN POPULATION NOTE</div>
              <p style={{ fontFamily: SERIF, fontSize: 14, lineHeight: 1.55, color: "#4f4839", margin: "4px 0 0", maxWidth: "70ch" }}>{r.population_summary}</p>
            </div>
          )}
          {wiki?.extract && (
            <p style={{ fontFamily: SERIF, fontSize: 14.5, lineHeight: 1.6, color: "#4f4839", margin: "16px 0 0", maxWidth: "70ch" }}>{wiki.extract}</p>
          )}
          {!wiki?.extract && !r.population_summary && (
            <p style={{ fontFamily: SERIF, fontSize: 14, lineHeight: 1.6, color: "#8a8069", margin: "16px 0 0" }}>
              No Wikipedia summary found for <i>{r.scientific_name}</i>. Follow the IUCN link for the full assessment.
            </p>
          )}
        </div>

        {/* col 3 — projection box with abundance sparkline */}
        <div className="detail-proj" style={{ background: "#16221b", borderRadius: 4, padding: "16px 17px", color: "#ece3d0" }}>
          <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 9.5, letterSpacing: ".12em", color: boxKickerColor }}>{boxKicker}</div>
          <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: boxBig.length > 9 ? 20 : 26, marginTop: 4, letterSpacing: "-.01em" }}>{boxBig}</div>
          {boxNote && <div style={{ fontFamily: SERIF, fontSize: 12, lineHeight: 1.4, color: "rgba(236,227,208,.62)", marginTop: 3 }}>{boxNote}</div>}
          <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 9.5, letterSpacing: ".12em", color: "rgba(236,227,208,.5)", marginTop: 15 }}>ABUNDANCE INDEX {measured ? "" : "(illustrative)"}</div>
          <svg viewBox="0 0 176 46" style={{ width: "100%", height: "auto", marginTop: 5, display: "block" }}>
            <polyline points={t.spark.obs} fill="none" stroke={t.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={measured ? 1 : 0.7} />
            <polyline points={t.spark.proj} fill="none" stroke={t.color} strokeWidth={1.8} strokeDasharray="3 3" opacity={0.7} />
          </svg>
        </div>
      </div>
    </div>
  );
}

const linkStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 5, fontFamily: MONO, fontSize: 10.5, letterSpacing: ".04em",
  color: "#1b1813", textDecoration: "none", borderBottom: "1px solid #d8391c", paddingBottom: 1,
};

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 9.5, letterSpacing: ".1em", color: "#8a8069" }}>{label}</div>
      <div style={{ fontFamily: SERIF, fontSize: 15, color: "#1b1813", marginTop: 3 }}>{children}</div>
    </div>
  );
}
