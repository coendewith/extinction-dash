"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LpiData, Species } from "@/lib/types";
import { decorate, elapsed } from "@/lib/species";
import { buildChart, valueAt } from "@/lib/chart";
import { biomassRows, composition, sources, type BiomassView } from "@/lib/biomass";
import Explorer from "./Explorer";

const DISPLAY = "'Bricolage Grotesque', sans-serif";
const SERIF = "'Newsreader', Georgia, serif";
const MONO = "'Space Mono', monospace";

const NAV_LINKS = [
  ["#trends", "Trends"],
  ["#watchlist", "Watchlist"],
  ["#biomass", "Biomass"],
  ["#sources", "Sources"],
] as const;

// Per-group drivers behind the measured 1970–2020 trajectories in the LPI chart.
// Change % is vs the 1970=100 baseline (from src/data/lpi.json, observed to 2020).
const LPI_DRIVERS = [
  {
    group: "Amphibians", color: "#f04a26", change: "−82% since 1970", dirColor: "#f04a26",
    text: "The steepest fall of any vertebrate class. Chytrid fungus (Batrachochytrium) has swept the tropics since the 1980s, on top of wetland drainage, agrochemical pollution and a drying climate.",
    sources: [
      { name: "Scheele et al. 2019, Science — amphibian chytrid panzootic", url: "https://www.science.org/doi/10.1126/science.aav0379" },
      { name: "IUCN amphibian assessment 2023, Nature", url: "https://www.nature.com/articles/s41586-023-06578-4" },
    ],
  },
  {
    group: "Fish", color: "#37a99d", change: "−21% since 1970", dirColor: "#f04a26",
    text: "Driven down by overfishing, dams that sever migratory rivers, and bycatch. The recent uptick reflects well-managed temperate stocks rebounding — freshwater and tropical fish keep falling.",
    sources: [
      { name: "FAO 2024 — State of World Fisheries (SOFIA)", url: "https://www.fao.org/publications/sofia/en" },
      { name: "WWF/ZSL 2024 — Living Planet Report (freshwater −85%)", url: "https://www.livingplanetindex.org/" },
    ],
  },
  {
    group: "Mammals", color: "#e3a63e", change: "−36% since 1970", dirColor: "#f04a26",
    text: "Habitat cleared for farming, plus hunting and the wildlife trade. Large-bodied mammals and populations outside protected areas have been hit hardest.",
    sources: [
      { name: "IPBES 2019 — Global Assessment (land-use change, exploitation)", url: "https://www.ipbes.net/global-assessment" },
    ],
  },
  {
    group: "Birds", color: "#e8ddc4", change: "≈ flat", dirColor: "#b9ae94",
    text: "Near-flat only because the index leans on well-monitored, often protected temperate species. Farmland birds and long-distance migrants are declining sharply beneath the average.",
    sources: [
      { name: "BirdLife 2022 — State of the World's Birds", url: "https://www.birdlife.org/papers-reports/state-of-the-worlds-birds-2022/" },
    ],
  },
  {
    group: "Reptiles", color: "#79bd6e", change: "+39% (sample artifact)", dirColor: "#cf8f34",
    text: "The rise is a sampling artifact: reptiles are only 809 of the 34,000+ populations in this dataset (the Living Planet Database 2024), and that small sample skews toward well-monitored, recovering species such as protected marine turtles. The first global reptile assessment (Cox et al. 2022) found ~21% of reptile species are threatened.",
    sources: [
      { name: "Cox et al. 2022, Nature — global reptile assessment", url: "https://www.nature.com/articles/s41586-022-04664-7" },
      { name: "Living Planet Database 2024 (this dataset — 809 reptile populations)", url: "https://www.livingplanetindex.org/" },
    ],
  },
];

export default function Dashboard({
  initialSpecies,
  lpi,
}: {
  initialSpecies: Species[];
  lpi: LpiData;
}) {
  const [species, setSpecies] = useState<Species[]>(initialSpecies);
  const [live, setLive] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [scrubYear, setScrubYear] = useState(lpi.observedEnd);
  // Click a group in the legend to FOCUS it: the chart splits that class into its
  // per-system sub-populations (land / freshwater / marine). null = all groups.
  const [focused, setFocused] = useState<string | null>(null);
  const [images, setImages] = useState<Record<string, string>>({});
  const [showProj, setShowProj] = useState(true);
  const [biomassView, setBiomassView] = useState<BiomassView>("Mammals only");

  // ticking clock for the live countdowns
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // species photos, loaded live from the Wikipedia REST summary endpoint
  useEffect(() => {
    const titles = [...new Set(species.map((s) => s.wiki))];
    let cancelled = false;
    titles.forEach((t) => {
      fetch("https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(t))
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (cancelled || !j) return;
          const u = j.thumbnail?.source || j.originalimage?.source;
          if (u) setImages((prev) => ({ ...prev, [t]: u }));
        })
        .catch(() => {});
    });
    return () => {
      cancelled = true;
    };
  }, [species]);

  // refresh statuses from the serverless backend (holds the IUCN token server-side)
  useEffect(() => {
    let cancelled = false;
    fetch("/api/species")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j?.species?.length) return;
        setSpecies(j.species);
        setLive(j.live === true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const decorated = useMemo(() => decorate(species), [species]);
  const chart = useMemo(() => buildChart(lpi, scrubYear, focused, showProj), [lpi, scrubYear, focused, showProj]);
  const biomass = useMemo(() => biomassRows(biomassView), [biomassView]);

  const declining = decorated.filter((r) => r.trendLabel === "Declining").length;
  const soonest = useMemo(() => {
    const w = decorated.filter((r) => r.isWindow && r.win).sort((a, b) => a.win![0] - b.win![0])[0];
    return w?.win ? `${w.win[0]}–${w.win[1]}` : "—";
  }, [decorated]);
  // "Most imperilled" showcase is a logical, data-driven pick — not hardcoded:
  // the curated species with the soonest projected window that is still
  // declining (tie-break: smallest wild population). Updates automatically as the
  // curated set changes. (Needs editorial fields — last-seen, window — so it is
  // drawn from the curated watchlist, which carries them.)
  const showcase = useMemo(() => {
    const c = decorated.filter((r) => r.isWindow && r.win && r.trend === "down" && r.lastSeen);
    c.sort((a, b) => {
      const am = (a.win![0] + a.win![1]) / 2, bm = (b.win![0] + b.win![1]) / 2;
      if (am !== bm) return am - bm;
      return (a.popNum ?? 1e12) - (b.popNum ?? 1e12);
    });
    return c[0] || decorated.find((r) => r.common === "Vaquita");
  }, [decorated]);
  const showImg = showcase ? images[showcase.wiki] : undefined;
  const scrubModelled = scrubYear > lpi.observedEnd;

  // scrubber pointer handling
  const boxRef = useRef<DOMRect | null>(null);
  const [dragging, setDragging] = useState(false);
  const scrubTo = useCallback(
    (clientX: number) => {
      const b = boxRef.current;
      if (!b || !b.width) return;
      let f = (clientX - b.left) / b.width;
      f = Math.max(0, Math.min(1, f));
      const yr = Math.round(chart.yrMin + f * (chart.yrMax - chart.yrMin));
      setScrubYear(yr);
    },
    [chart.yrMin, chart.yrMax]
  );

  return (
    <div style={{ minHeight: "100vh", background: "#efe7d6" }}>
      {/* NAV */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 60,
          background: "rgba(16,25,19,.93)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          borderBottom: "1px solid rgba(236,227,208,.16)",
        }}
      >
        <div style={{ maxWidth: 1220, margin: "0 auto", padding: "0 30px", height: 60, display: "flex", alignItems: "center", gap: 20 }}>
          <a href="#top" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "#ece3d0" }}>
            <span style={{ width: 9, height: 9, background: "#f04a26", display: "inline-block" }} />
            <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 16, letterSpacing: "-.01em" }}>Sixth Mass Extinction Watch</span>
            <span
              style={{
                fontFamily: MONO,
                fontWeight: 700,
                fontSize: 9.5,
                letterSpacing: ".18em",
                color: "rgba(236,227,208,.5)",
                borderLeft: "1px solid rgba(236,227,208,.24)",
                paddingLeft: 10,
                marginLeft: 2,
              }}
            >
              FIELD RECORD
            </span>
          </a>
          <div className="nav-links" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 26 }}>
            {NAV_LINKS.map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="navlink"
                style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(236,227,208,.6)", textDecoration: "none" }}
              >
                {label}
              </a>
            ))}
            <span
              title={live ? "Statuses synced live from the IUCN Red List API" : "Showing the last built snapshot"}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 9.5, letterSpacing: ".12em", color: live ? "#8fd0c4" : "rgba(236,227,208,.4)" }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: live ? "#37a99d" : "#8a8069", display: "inline-block" }} />
              {live ? "LIVE" : "SNAPSHOT"}
            </span>
          </div>
        </div>
      </div>

      {/* HERO */}
      <section id="top" style={{ background: "#efe7d6", color: "#1b1813" }}>
        <div style={{ maxWidth: 1220, margin: "0 auto", padding: "26px 30px 46px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, paddingBottom: 22, borderBottom: "1px solid rgba(27,24,19,.18)" }}>
            <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 10.5, letterSpacing: ".2em", color: "#8a8069" }}>EST. 2026</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 10.5, letterSpacing: ".2em", color: "#8a8069" }}>A LIVING RECORD OF WHAT WE ARE LOSING</span>
          </div>
          <div className="hero-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 396px", gap: 46, alignItems: "end", paddingTop: 34 }}>
            <div>
              <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 11, letterSpacing: ".2em", textTransform: "uppercase", color: "#d8391c", marginBottom: 18 }}>
                The sixth mass extinction, honestly counted
              </div>
              <h1 style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: "clamp(40px,5.4vw,70px)", lineHeight: 0.98, letterSpacing: "-.025em", margin: 0, maxWidth: "15ch" }}>
                Wildlife is vanishing faster than we can count it.
              </h1>
              <p style={{ fontFamily: SERIF, fontSize: 19, lineHeight: 1.55, color: "#4f4839", maxWidth: "52ch", margin: "22px 0 0" }}>
                Wild populations are measured only by periodic surveys, and extinction is confirmed years late. So we separate what is{" "}
                <em style={{ fontStyle: "normal", borderBottom: "2px solid #2c8a80", paddingBottom: 1 }}>measured</em> from what is{" "}
                <em style={{ fontStyle: "normal", borderBottom: "2px dashed #8a8069", paddingBottom: 1 }}>modelled</em>, everywhere on this page.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 9, marginTop: 24 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(44,138,128,.12)", border: "1px solid rgba(44,138,128,.45)", padding: "7px 12px", fontFamily: MONO, fontSize: 11, letterSpacing: ".06em", color: "#1f6b63" }}>
                  <span style={{ width: 16, height: 3, background: "#2c8a80", display: "inline-block" }} />MEASURED / SOLID
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(27,24,19,.05)", border: "1px solid rgba(27,24,19,.22)", padding: "7px 12px", fontFamily: MONO, fontSize: 11, letterSpacing: ".06em", color: "#4f4839" }}>
                  <span style={{ width: 16, height: 0, borderTop: "2px dashed #4f4839", display: "inline-block" }} />MODELLED / DASHED
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(216,57,28,.1)", border: "1px solid rgba(216,57,28,.4)", padding: "7px 12px", fontFamily: MONO, fontSize: 11, letterSpacing: ".06em", color: "#b53318" }}>
                  <i className="ph-bold ph-prohibit" style={{ fontSize: 13 }} />NO DAYS-LEFT NUMBER
                </span>
              </div>
            </div>

            {/* Most imperilled card */}
            <div style={{ background: "#16221b", border: "1px solid rgba(236,227,208,.16)", borderRadius: 4, padding: "20px 22px 22px", color: "#ece3d0" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 15 }}>
                <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 10, letterSpacing: ".18em", color: "rgba(236,227,208,.55)" }}>MOST IMPERILLED</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(240,74,38,.16)", border: "1px solid rgba(240,74,38,.5)", color: "#f8a488", fontFamily: MONO, fontWeight: 700, fontSize: 10, letterSpacing: ".1em", padding: "3px 8px", borderRadius: 2 }}>
                  <span style={{ width: 5, height: 5, background: "#f04a26" }} />{showcase?.status || "CR"}
                </span>
              </div>
              <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <div style={{ width: 64, height: 64, flex: "none", background: "#0f1712", border: "1px solid rgba(236,227,208,.14)", borderRadius: 3, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {showImg ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={showImg} alt={showcase?.common || ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <i className={"ph " + (showcase?.groupIcon || "ph-waves")} style={{ fontSize: 26, color: "rgba(55,169,157,.6)" }} />
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 24, lineHeight: 1 }}>{showcase?.common || "Vaquita"}</div>
                  <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 14, color: "rgba(236,227,208,.6)" }}>{showcase?.sci || "Phocoena sinus"}</div>
                  <div style={{ fontFamily: MONO, fontSize: 10.5, color: "rgba(236,227,208,.55)", marginTop: 3, textTransform: "uppercase" }}>{showcase?.pop || "~10"} LEFT / {showcase?.region || "Gulf of California"}</div>
                </div>
              </div>
              <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 9, letterSpacing: ".14em", color: "#f04a26", marginTop: 18 }}>MEASURED / SINCE LAST CONFIRMED SIGHTING</div>
              <Countdown fromISO={(showcase?.lastSeen || "2023-05-26") + "T12:00:00Z"} now={now} />
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(236,227,208,.16)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 9, letterSpacing: ".14em", color: "#e3a63e" }}>MODELLED WINDOW</div>
                  <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 21, marginTop: 2, letterSpacing: "-.01em" }}>{showcase?.winText || "2026–2032"}</div>
                </div>
                <a href="#watchlist" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: MONO, fontWeight: 700, fontSize: 10.5, letterSpacing: ".06em", color: "#f04a26", textDecoration: "none" }}>
                  FULL LIST <i className="ph-bold ph-arrow-down" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* MAIN GRAPH */}
      <section id="trends" style={{ background: "#101913", color: "#ece3d0" }}>
        <div style={{ maxWidth: 1220, margin: "0 auto", padding: "40px 30px 48px" }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 11, letterSpacing: ".2em", color: "#f04a26" }}>FIG. 01</span>
                <span style={{ width: 34, height: 1, background: "rgba(236,227,208,.3)" }} />
                <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 11, letterSpacing: ".2em", color: "rgba(236,227,208,.6)" }}>TREND / LIVING PLANET DATABASE</span>
              </div>
              <h2 style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 32, lineHeight: 1.02, letterSpacing: "-.02em", margin: 0 }}>Group abundance index, 1970 = 100</h2>
              <p style={{ fontFamily: SERIF, fontSize: 16, lineHeight: 1.5, color: "rgba(236,227,208,.66)", margin: "8px 0 0", maxWidth: "70ch" }}>
                Average abundance of monitored vertebrate populations by class, computed from {lpi.meta.populationsUsed.toLocaleString("en-US")} time series
                in the {lpi.meta.source}. Solid is observed to {lpi.observedEnd}; dashed is a near-term trend projection to {chart.yrMax}.
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontFamily: MONO, fontSize: 11, letterSpacing: ".05em", color: "rgba(236,227,208,.72)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid rgba(236,227,208,.2)", padding: "8px 13px" }}>
                <i className="ph-bold ph-arrows-out-line-horizontal" style={{ color: "#f04a26" }} />DRAG THE MARKER TO SCRUB ANY YEAR
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid rgba(236,227,208,.2)", padding: "8px 13px" }}>
                <i className="ph-bold ph-arrows-out" style={{ color: "#f04a26" }} />CLICK A GROUP TO SPLIT IT BY SYSTEM
              </div>
            </div>
          </div>

          <div style={{ background: "#16221b", border: "1px solid rgba(236,227,208,.12)", borderRadius: 4, padding: "20px 22px 18px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8, alignItems: "center" }}>
              {chart.groups.map((g) => {
                const isFocused = focused === g.key;
                const hasSubs = (lpi.groups[g.key]?.subgroups?.length ?? 0) > 0;
                const dim = focused !== null && !isFocused;
                return (
                  <button
                    key={g.key}
                    onClick={() => setFocused((f) => (f === g.key ? null : g.key))}
                    title={hasSubs ? `Focus ${g.key}: split into land / freshwater / marine sub-populations` : g.key}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 7,
                      background: isFocused ? "rgba(236,227,208,.16)" : "rgba(236,227,208,.06)",
                      border: isFocused ? "1px solid rgba(236,227,208,.5)" : "1px solid rgba(236,227,208,.16)",
                      borderRadius: 2,
                      padding: "6px 11px",
                      fontFamily: MONO,
                      fontSize: 11,
                      letterSpacing: ".04em",
                      color: dim ? "rgba(236,227,208,.4)" : "#ece3d0",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ width: 14, height: 3, background: g.color, display: "inline-block", opacity: dim ? 0.4 : 1 }} />
                    {g.key}
                    {hasSubs && <i className="ph-bold ph-arrows-out" style={{ fontSize: 11, opacity: 0.6 }} />}
                  </button>
                );
              })}
              {focused && (
                <button onClick={() => setFocused(null)} title="Show all groups"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(240,74,38,.14)", border: "1px solid rgba(240,74,38,.45)", borderRadius: 2, padding: "6px 11px", fontFamily: MONO, fontSize: 11, letterSpacing: ".04em", color: "#f8a488", cursor: "pointer" }}>
                  <i className="ph-bold ph-x" style={{ fontSize: 11 }} /> ALL GROUPS
                </button>
              )}
              <button
                onClick={() => setShowProj((v) => !v)}
                style={{
                  marginLeft: "auto",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  background: showProj ? "rgba(227,166,62,.14)" : "transparent",
                  border: "1px solid rgba(227,166,62,.4)",
                  borderRadius: 2,
                  padding: "6px 11px",
                  fontFamily: MONO,
                  fontSize: 11,
                  letterSpacing: ".04em",
                  color: showProj ? "#e3a63e" : "rgba(236,227,208,.5)",
                  cursor: "pointer",
                }}
              >
                <i className="ph-bold ph-chart-line" /> PROJECTION {showProj ? "ON" : "OFF"}
              </button>
            </div>

            <svg viewBox={`0 0 960 356`} style={{ width: "100%", height: "auto", display: "block", userSelect: "none" }}>
              {chart.showProj && (
                <>
                  <rect x={chart.projX0} y={28} width={chart.projW} height={292} fill="rgba(236,227,208,.035)" />
                  <text x={chart.projLabelX} y={44} fill="rgba(236,227,208,.34)" fontSize={10} fontFamily="Space Mono" fontWeight={700} letterSpacing={2}>
                    PROJECTED
                  </text>
                </>
              )}
              {chart.yTicks.map((t) => (
                <g key={t.label}>
                  <line x1={64} x2={920} y1={t.y} y2={t.y} stroke="rgba(236,227,208,.08)" strokeWidth={1} />
                  <text x={54} y={t.y} fill="rgba(236,227,208,.4)" fontSize={11} textAnchor="end" dominantBaseline="middle" fontFamily="Space Mono">
                    {t.label}
                  </text>
                </g>
              ))}
              <line x1={64} x2={920} y1={chart.baselineY} y2={chart.baselineY} stroke="rgba(236,227,208,.4)" strokeWidth={1} strokeDasharray="2 3" />
              {chart.xTicks.map((t) => (
                <text key={t.label} x={t.x} y={340} fill="rgba(236,227,208,.4)" fontSize={11} textAnchor="middle" fontFamily="Space Mono">
                  {t.label}
                </text>
              ))}
              {chart.groups.map((g) => (
                <g key={g.key} style={{ transition: "opacity .4s ease" }}>
                  <polyline points={g.obs} fill="none" stroke={g.color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" opacity={g.opacity} style={{ transition: "opacity .4s ease" }} />
                  {g.proj && <polyline points={g.proj} fill="none" stroke={g.color} strokeWidth={2} strokeDasharray="3 4" strokeLinecap="round" opacity={g.projOpacity} style={{ transition: "opacity .4s ease" }} />}
                </g>
              ))}
              {/* focused group's sub-population lines — animate in on focus */}
              {chart.subLines.map((s) => (
                <g key={s.key} className="sub-line">
                  <polyline points={s.obs} fill="none" stroke={s.color} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" />
                  {s.proj && <polyline points={s.proj} fill="none" stroke={s.color} strokeWidth={2.2} strokeDasharray="3 4" strokeLinecap="round" opacity={0.75} />}
                </g>
              ))}
              <line x1={chart.scrubX} x2={chart.scrubX} y1={24} y2={320} stroke="#f04a26" strokeWidth={1.6} />
              {chart.dots.map((d) => (
                <circle key={d.key} cx={chart.scrubX} cy={d.y} r={4.5} fill="#16221b" stroke={d.color} strokeWidth={2.5} />
              ))}
              <g style={{ pointerEvents: "none" }}>
                <rect x={chart.yearBoxX} y={8} width={58} height={20} rx={2} fill="#f04a26" />
                <text x={chart.scrubX} y={22} fill="#1b1813" fontSize={12} fontFamily="Space Mono" fontWeight={700} textAnchor="middle">
                  {scrubYear}
                </text>
              </g>
              <rect
                x={64}
                y={28}
                width={856}
                height={292}
                fill="transparent"
                style={{ cursor: "ew-resize", touchAction: "none" }}
                onPointerDown={(e) => {
                  (e.currentTarget as SVGRectElement).setPointerCapture(e.pointerId);
                  boxRef.current = (e.currentTarget as SVGRectElement).getBoundingClientRect();
                  setDragging(true);
                  scrubTo(e.clientX);
                }}
                onPointerMove={(e) => {
                  if (dragging) scrubTo(e.clientX);
                }}
                onPointerUp={(e) => {
                  try {
                    (e.currentTarget as SVGRectElement).releasePointerCapture(e.pointerId);
                  } catch {}
                  setDragging(false);
                }}
              />
            </svg>

            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 16px", marginTop: 12, paddingTop: 14, borderTop: "1px solid rgba(236,227,208,.1)" }}>
              <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 13, color: "#ece3d0" }}>
                AT {scrubYear}{" "}
                <span style={{ fontSize: 10, color: scrubModelled ? "#e3a63e" : "#37a99d", letterSpacing: ".08em" }}>[{scrubModelled ? "modelled" : "observed"}]</span>
                {focused && <span style={{ fontSize: 10, color: "rgba(236,227,208,.55)", letterSpacing: ".06em" }}> · {focused.toUpperCase()} BY SYSTEM</span>}
              </div>
              {focused
                ? (lpi.groups[focused]?.subgroups ?? []).map((s) => (
                    <div key={s.key} style={{ display: "inline-flex", alignItems: "baseline", gap: 7, fontFamily: MONO, fontSize: 12, color: "rgba(236,227,208,.7)" }}>
                      <span style={{ width: 9, height: 9, background: s.color, display: "inline-block" }} />
                      {s.key} <b style={{ color: "#ece3d0" }}>{Math.round(valueAt(s.values, lpi.years, scrubYear))}</b>
                    </div>
                  ))
                : chart.groups.map((g) => (
                    <div key={g.key} style={{ display: "inline-flex", alignItems: "baseline", gap: 7, fontFamily: MONO, fontSize: 12, color: "rgba(236,227,208,.7)" }}>
                      <span style={{ width: 9, height: 9, background: g.color, display: "inline-block" }} />
                      {g.key} <b style={{ color: "#ece3d0" }}>{Math.round(valueAt(lpi.groups[g.key].values, lpi.years, scrubYear))}</b>
                    </div>
                  ))}
            </div>
          </div>

          {/* published-figure caption */}
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginTop: 14, fontFamily: SERIF, fontSize: 13.5, lineHeight: 1.55, color: "rgba(236,227,208,.6)" }}>
            <i className="ph-bold ph-info" style={{ fontSize: 16, color: "#e3a63e", flex: "none", marginTop: 2 }} />
            <div>
              This is an <b style={{ color: "rgba(236,227,208,.8)" }}>unweighted</b> per-class cut: well-monitored temperate groups look flat or even rise. WWF/ZSL&rsquo;s{" "}
              <b style={{ color: "rgba(236,227,208,.8)" }}>weighted</b> global index falls <b style={{ color: "#f04a26" }}>{lpi.published.globalDecline}%</b> (1970&ndash;2020) because losses
              concentrate in freshwater (&minus;{lpi.published.bySystem[0].decline}%) and the tropics. Same data, different weighting.
            </div>
          </div>

          {/* stat tiles */}
          <div className="stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginTop: 20 }}>
            {[
              { value: String(decorated.length), label: "SPECIES TRACKED", note: "IUCN-assessed", color: "#ece3d0", bg: "rgba(55,169,157,.12)", border: "#37a99d" },
              { value: decorated.length ? Math.round((declining / decorated.length) * 100) + "%" : "—", label: "DECLINING TREND", note: "of tracked species (measured)", color: "#f04a26", bg: "rgba(240,74,38,.12)", border: "#f04a26" },
              { value: soonest, label: "NEAREST PROJECTED WINDOW", note: `${showcase?.common || "Vaquita"} · Criterion E (modelled)`, color: "#e3a63e", bg: "rgba(227,166,62,.12)", border: "#e3a63e" },
              { value: "~15×", label: "LIVESTOCK : WILD MAMMALS", note: "by biomass (Bar-On 2018)", color: "#ece3d0", bg: "rgba(176,78,111,.16)", border: "#b04e6f" },
            ].map((s) => (
              <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.border}`, borderTop: `3px solid ${s.border}`, borderRadius: 3, padding: "18px 20px" }}>
                <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 34, lineHeight: 1, color: s.color }}>{s.value}</div>
                <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 10, letterSpacing: ".12em", color: "rgba(236,227,208,.62)", marginTop: 11 }}>{s.label}</div>
                <div style={{ fontFamily: SERIF, fontSize: 13, color: "rgba(236,227,208,.55)", marginTop: 4 }}>{s.note}</div>
              </div>
            ))}
          </div>

          {/* what's driving each group's trend */}
          <div style={{ marginTop: 22, background: "#16221b", border: "1px solid rgba(236,227,208,.12)", borderRadius: 4, padding: "20px 22px" }}>
            <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 11, letterSpacing: ".14em", color: "rgba(236,227,208,.6)", marginBottom: 4 }}>WHAT&rsquo;S DRIVING EACH LINE</div>
            <div style={{ fontFamily: SERIF, fontSize: 13.5, color: "rgba(236,227,208,.55)", marginBottom: 16, maxWidth: "82ch" }}>
              Measured change over 1970&ndash;2020 in this unweighted index. Where a line rises, it reflects the index over-sampling well-monitored temperate populations &mdash; not a global recovery. Projections are held flat-to-declining; recovery is never extrapolated.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(310px,1fr))", gap: "14px 26px" }}>
              {LPI_DRIVERS.map((d) => (
                <div key={d.group} style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
                  <span style={{ width: 14, height: 3, background: d.color, flex: "none", marginTop: 8, borderRadius: 2 }} />
                  <div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 15, color: "#ece3d0" }}>{d.group}</span>
                      <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 11, color: d.dirColor }}>{d.change}</span>
                    </div>
                    <div style={{ fontFamily: SERIF, fontSize: 13.5, lineHeight: 1.5, color: "rgba(236,227,208,.72)", marginTop: 2 }}>{d.text}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 12px", marginTop: 6 }}>
                      {d.sources.map((s) => (
                        <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" title={s.name}
                          style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: MONO, fontSize: 10, letterSpacing: ".02em", color: "#8fb9b1", textDecoration: "none", borderBottom: "1px solid rgba(55,169,157,.4)", paddingBottom: 1 }}>
                          {s.name.split(" — ")[0].split(",")[0]} <i className="ph ph-arrow-up-right" style={{ fontSize: 10 }} />
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* WATCHLIST — full IUCN Red List, Supabase-backed */}
      <Explorer curated={species} />

      {/* BIOMASS */}
      <section id="biomass" style={{ background: "#26140f", color: "#ece3d0" }}>
        <div style={{ maxWidth: 1220, margin: "0 auto", padding: "52px 30px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22, flexWrap: "wrap" }}>
            <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 11, letterSpacing: ".2em", color: "#f8a488" }}>FIG. 03</span>
            <span style={{ width: 34, height: 1, background: "rgba(236,227,208,.3)" }} />
            <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 11, letterSpacing: ".2em", color: "rgba(236,227,208,.6)" }}>SCALE / BAR-ON 2018</span>
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              {(["Mammals only", "Animals only", "All life on Earth"] as BiomassView[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setBiomassView(v)}
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    letterSpacing: ".04em",
                    padding: "7px 12px",
                    borderRadius: 2,
                    cursor: "pointer",
                    background: biomassView === v ? "#f04a26" : "transparent",
                    color: biomassView === v ? "#1b1813" : "rgba(236,227,208,.6)",
                    border: biomassView === v ? "1px solid #f04a26" : "1px solid rgba(236,227,208,.24)",
                  }}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div className="biomass-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,0.82fr) minmax(0,1.18fr)", gap: 48, alignItems: "center" }}>
            <div>
              <h2 style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 34, lineHeight: 1.02, letterSpacing: "-.02em", margin: 0 }}>Where did all the wild go?</h2>
              <p style={{ fontFamily: SERIF, fontSize: 17, lineHeight: 1.55, color: "rgba(236,227,208,.74)", margin: "14px 0 0" }}>
                Measured by mass, the living world of wild mammals and birds is a rounding error next to the animals we raise and ourselves.
              </p>
              <div style={{ marginTop: 20, padding: "16px 18px", background: "rgba(240,74,38,.14)", borderLeft: "3px solid #f04a26" }}>
                <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 18, lineHeight: 1.28 }}>Livestock and humans are ~96% of all mammal biomass on Earth.</div>
                <div style={{ fontFamily: SERIF, fontSize: 13.5, color: "rgba(236,227,208,.7)", marginTop: 5 }}>Cattle alone (~0.06 Gt C) roughly equal all of humanity by weight — and each is about 9&times; every wild mammal combined (0.007 Gt C). Wild mammals are ~4% of the total.</div>
              </div>
            </div>
            <div>
              <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".05em", color: "rgba(236,227,208,.6)", marginBottom: 16 }}>BIOMASS / GIGATONNES OF CARBON (Gt C)</div>
              {biomass.map((b) => (
                <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 15 }}>
                  <div className="biomass-label" style={{ width: 174, flex: "none", fontFamily: SERIF, fontSize: 14, color: "rgba(236,227,208,.9)", textAlign: "right", lineHeight: 1.25 }}>{b.label}</div>
                  <div style={{ flex: 1, height: 26, background: "rgba(236,227,208,.07)", position: "relative" }}>
                    <div style={{ height: "100%", width: b.widthCss, background: b.color, minWidth: 3 }} />
                  </div>
                  <div style={{ width: 96, flex: "none", textAlign: "right" }}>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: "#ece3d0" }}>{b.valueLabel}</div>
                    {b.relLabel ? <div style={{ fontFamily: MONO, fontSize: 10, color: "rgba(236,227,208,.5)", marginTop: 2 }}>{b.relLabel}</div> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* quote + composition */}
          <div className="biomass-grid" style={{ marginTop: 46, paddingTop: 34, borderTop: "1px solid rgba(236,227,208,.18)", display: "grid", gridTemplateColumns: "minmax(0,1.05fr) minmax(0,0.95fr)", gap: 48, alignItems: "center" }}>
            <div>
              <i className="ph-fill ph-quotes" style={{ fontSize: 30, color: "#f04a26" }} />
              <blockquote style={{ fontFamily: SERIF, fontStyle: "italic", fontWeight: 400, fontSize: 27, lineHeight: 1.35, color: "#ece3d0", margin: "12px 0 0", maxWidth: "24ch" }}>
                Nature once determined how we survive. Now, we determine how nature survives.
              </blockquote>
              <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 11, letterSpacing: ".16em", color: "rgba(236,227,208,.6)", marginTop: 16 }}>DAVID ATTENBOROUGH</div>
            </div>
            <div>
              {composition.map((c) => (
                <div key={c.label} style={{ marginBottom: 22 }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 11, letterSpacing: ".1em", color: "rgba(236,227,208,.7)" }}>{c.label}</span>
                    <span style={{ fontFamily: SERIF, fontSize: 13, color: "rgba(236,227,208,.55)" }}>{c.unit}</span>
                  </div>
                  <div style={{ display: "flex", height: 38, overflow: "hidden", borderRadius: 2, gap: 1 }}>
                    {c.segments.map((s) => (
                      <div key={s.label} title={`${s.label} · ${s.pct}%`} style={{ width: s.pct + "%", background: s.color, display: "flex", alignItems: "center", padding: "0 9px", fontFamily: DISPLAY, fontWeight: 700, fontSize: 13, color: "#1b1813", whiteSpace: "nowrap", overflow: "hidden", minWidth: 2 }}>
                        {s.pct >= 14 ? s.label : ""}
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", marginTop: 7 }}>
                    {c.segments.map((s) => (
                      <span key={s.label} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: MONO, fontSize: 10, letterSpacing: ".03em", color: "rgba(236,227,208,.62)" }}>
                        <span style={{ width: 9, height: 9, background: s.color, display: "inline-block", flex: "none" }} />{s.label} {s.pct}%
                      </span>
                    ))}
                  </div>
                  <div style={{ fontFamily: SERIF, fontSize: 12.5, lineHeight: 1.45, color: "rgba(236,227,208,.5)", marginTop: 6 }}>{c.caption}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* SOURCES */}
      <section id="sources" style={{ background: "#101913", color: "#ece3d0", borderTop: "1px solid rgba(236,227,208,.1)" }}>
        <div style={{ maxWidth: 1220, margin: "0 auto", padding: "52px 30px 32px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 11, letterSpacing: ".2em", color: "#f04a26" }}>FIG. 04</span>
            <span style={{ width: 34, height: 1, background: "rgba(236,227,208,.3)" }} />
            <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 11, letterSpacing: ".2em", color: "rgba(236,227,208,.6)" }}>METHOD</span>
          </div>
          <h2 style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 32, lineHeight: 1.02, letterSpacing: "-.02em", margin: "0 0 26px" }}>What is real, and what is modelled</h2>
          <div className="method-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 36 }}>
            <div style={{ background: "rgba(44,138,128,.12)", border: "1px solid rgba(55,169,157,.4)", borderRadius: 4, padding: "22px 24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span style={{ width: 22, height: 3, background: "#37a99d" }} />
                <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 13, letterSpacing: ".06em", color: "#79cabf" }}>MEASURED / DRAWN SOLID</span>
              </div>
              <div style={{ fontFamily: SERIF, fontSize: 15, lineHeight: 1.65, color: "rgba(236,227,208,.82)" }}>
                IUCN Red List status and category. GBIF occurrence records and last-confirmed sightings. Published survey population counts. Global biomass estimates (Bar-On et al.).
              </div>
            </div>
            <div style={{ background: "rgba(236,227,208,.04)", border: "1px solid rgba(236,227,208,.18)", borderRadius: 4, padding: "22px 24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span style={{ width: 22, height: 0, borderTop: "3px dashed rgba(236,227,208,.8)" }} />
                <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 13, letterSpacing: ".06em", color: "rgba(236,227,208,.85)" }}>MODELLED / DRAWN DASHED</span>
              </div>
              <div style={{ fontFamily: SERIF, fontSize: 15, lineHeight: 1.65, color: "rgba(236,227,208,.82)" }}>
                Living Planet abundance trends. Projected functional-extinction windows from IUCN Criterion E population models, always a range. Near-term trend projections on the index.
              </div>
            </div>
          </div>

          <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 11, letterSpacing: ".16em", color: "rgba(236,227,208,.55)", marginBottom: 14 }}>DATA SOURCES</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
            {sources.map((s) => (
              <a
                key={s.name}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="source-card"
                style={{ background: "#16221b", border: "1px solid rgba(236,227,208,.12)", borderRadius: 3, padding: "17px 19px", textDecoration: "none", color: "#ece3d0", display: "block" }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 14 }}>{s.name}</span>
                  <i className="ph ph-arrow-up-right" style={{ fontSize: 14, color: "rgba(236,227,208,.5)" }} />
                </div>
                <div style={{ fontFamily: SERIF, fontSize: 13, lineHeight: 1.45, color: "rgba(236,227,208,.6)", marginTop: 6 }}>{s.desc}</div>
              </a>
            ))}
          </div>

          <div style={{ marginTop: 26, padding: "18px 20px", background: "rgba(236,227,208,.04)", border: "1px solid rgba(236,227,208,.12)", borderRadius: 4, display: "flex", gap: 14, alignItems: "flex-start" }}>
            <i className="ph-bold ph-database" style={{ fontSize: 20, color: "#f04a26", flex: "none", marginTop: 1 }} />
            <div style={{ fontFamily: SERIF, fontSize: 14, lineHeight: 1.6, color: "rgba(236,227,208,.78)" }}>
              <b style={{ fontFamily: MONO, fontWeight: 700, fontSize: 11, letterSpacing: ".08em", color: "#ece3d0" }}>PIPELINE. </b>
              A build step joins the curated watchlist to the live IUCN Red List (API v4) on scientific name, and derives the abundance index from the Living Planet Database. The IUCN token is
              held server-side in a serverless function and never shipped to the browser. Species photos load client-side from Wikipedia. Rebuilding refreshes every status and figure.
            </div>
          </div>
        </div>
        <div style={{ borderTop: "1px solid rgba(236,227,208,.1)", background: "#0c130e" }}>
          <div style={{ maxWidth: 1220, margin: "0 auto", padding: "20px 30px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ width: 8, height: 8, background: "#f04a26", display: "inline-block" }} />
              <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 14, color: "#ece3d0" }}>Sixth Mass Extinction Watch</span>
            </div>
            <div style={{ fontFamily: SERIF, fontSize: 13, color: "rgba(236,227,208,.5)" }}>An independent conservation-status monitor. Not affiliated with the organisations linked above.</div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Countdown({ fromISO, now }: { fromISO: string; now: number }) {
  const e = elapsed(fromISO, now);
  const cells: [string, string, string][] = [
    [String(e.years), "YR", "#ece3d0"],
    [String(e.days), "DAY", "#ece3d0"],
    [e.hours, "HR", "#ece3d0"],
    [e.mins, "MIN", "#ece3d0"],
    [e.secs, "SEC", "#f04a26"],
  ];
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "flex-end", marginTop: 9 }}>
      {cells.map((c, i) => (
        <div key={i} style={{ display: "contents" }}>
          {i > 0 && <div style={{ fontFamily: MONO, fontSize: 22, color: "rgba(236,227,208,.28)", lineHeight: 1.05 }}>:</div>}
          <div style={{ textAlign: "center" }}>
            <div suppressHydrationWarning style={{ fontFamily: MONO, fontWeight: 700, fontSize: 30, lineHeight: 0.9, color: c[2] }}>{c[0]}</div>
            <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: ".1em", color: "rgba(236,227,208,.5)", marginTop: 5 }}>{c[1]}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

