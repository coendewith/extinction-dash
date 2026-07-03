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
  const [chartOff, setChartOff] = useState<Record<string, boolean>>({});
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
  const chart = useMemo(() => buildChart(lpi, scrubYear, chartOff, showProj), [lpi, scrubYear, chartOff, showProj]);
  const biomass = useMemo(() => biomassRows(biomassView), [biomassView]);

  const declining = decorated.filter((r) => r.trendLabel === "Declining").length;
  const soonest = useMemo(() => {
    const w = decorated.filter((r) => r.isWindow && r.win).sort((a, b) => a.win![0] - b.win![0])[0];
    return w?.win ? `${w.win[0]}–${w.win[1]}` : "—";
  }, [decorated]);
  const vaquita = decorated.find((r) => r.common === "Vaquita");
  const vaqImg = vaquita ? images[vaquita.wiki] : undefined;
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
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 26 }}>
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
                Life is vanishing faster than we can count it.
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
                  <span style={{ width: 5, height: 5, background: "#f04a26" }} />CR
                </span>
              </div>
              <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <div style={{ width: 64, height: 64, flex: "none", background: "#0f1712", border: "1px solid rgba(236,227,208,.14)", borderRadius: 3, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {vaqImg ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={vaqImg} alt="Vaquita" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <i className="ph ph-waves" style={{ fontSize: 26, color: "rgba(55,169,157,.6)" }} />
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 24, lineHeight: 1 }}>Vaquita</div>
                  <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 14, color: "rgba(236,227,208,.6)" }}>Phocoena sinus</div>
                  <div style={{ fontFamily: MONO, fontSize: 10.5, color: "rgba(236,227,208,.55)", marginTop: 3 }}>~10 LEFT / GULF OF CALIFORNIA</div>
                </div>
              </div>
              <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 9, letterSpacing: ".14em", color: "#f04a26", marginTop: 18 }}>MEASURED / SINCE LAST CONFIRMED SIGHTING</div>
              <Countdown fromISO="2023-05-26T12:00:00Z" now={now} />
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(236,227,208,.16)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 9, letterSpacing: ".14em", color: "#e3a63e" }}>MODELLED WINDOW</div>
                  <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 21, marginTop: 2, letterSpacing: "-.01em" }}>{vaquita?.winText || "2026–2032"}</div>
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
            <div style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid rgba(236,227,208,.2)", padding: "8px 13px", fontFamily: MONO, fontSize: 11, letterSpacing: ".05em", color: "rgba(236,227,208,.72)" }}>
              <i className="ph-bold ph-arrows-out-line-horizontal" style={{ color: "#f04a26" }} />DRAG THE MARKER TO SCRUB ANY YEAR
            </div>
          </div>

          <div style={{ background: "#16221b", border: "1px solid rgba(236,227,208,.12)", borderRadius: 4, padding: "20px 22px 18px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
              {chart.groups.map((g) => (
                <button
                  key={g.key}
                  onClick={() => setChartOff((s) => ({ ...s, [g.key]: !s[g.key] }))}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    background: g.active ? "rgba(236,227,208,.08)" : "transparent",
                    border: g.active ? "1px solid rgba(236,227,208,.22)" : "1px solid rgba(236,227,208,.12)",
                    borderRadius: 2,
                    padding: "6px 11px",
                    fontFamily: MONO,
                    fontSize: 11,
                    letterSpacing: ".04em",
                    color: g.active ? "#ece3d0" : "rgba(236,227,208,.4)",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ width: 14, height: 3, background: g.color, display: "inline-block" }} />
                  {g.key}
                </button>
              ))}
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
                <g key={g.key}>
                  <polyline points={g.obs} fill="none" stroke={g.color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" opacity={g.opacity} />
                  {g.proj && <polyline points={g.proj} fill="none" stroke={g.color} strokeWidth={2} strokeDasharray="3 4" strokeLinecap="round" opacity={g.projOpacity} />}
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
              </div>
              {chart.groups
                .filter((g) => g.active)
                .map((g) => (
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
              { value: soonest, label: "NEAREST PROJECTED WINDOW", note: "Vaquita · Criterion E (modelled)", color: "#e3a63e", bg: "rgba(227,166,62,.12)", border: "#e3a63e" },
              { value: "~15×", label: "LIVESTOCK : WILD MAMMALS", note: "by biomass (Bar-On 2018)", color: "#ece3d0", bg: "rgba(176,78,111,.16)", border: "#b04e6f" },
            ].map((s) => (
              <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.border}`, borderTop: `3px solid ${s.border}`, borderRadius: 3, padding: "18px 20px" }}>
                <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 34, lineHeight: 1, color: s.color }}>{s.value}</div>
                <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 10, letterSpacing: ".12em", color: "rgba(236,227,208,.62)", marginTop: 11 }}>{s.label}</div>
                <div style={{ fontFamily: SERIF, fontSize: 13, color: "rgba(236,227,208,.55)", marginTop: 4 }}>{s.note}</div>
              </div>
            ))}
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
                <div style={{ fontFamily: SERIF, fontSize: 13.5, color: "rgba(236,227,208,.7)", marginTop: 5 }}>Wild mammals are about 4%. Livestock outweigh wild mammals roughly 15 to 1.</div>
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
                  <div style={{ width: 88, flex: "none", fontFamily: MONO, fontSize: 12, color: "#ece3d0", textAlign: "right" }}>{b.valueLabel}</div>
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
                  <div style={{ display: "flex", height: 38, overflow: "hidden", borderRadius: 2 }}>
                    <div style={{ width: c.bigPct + "%", background: c.bigColor, display: "flex", alignItems: "center", padding: "0 12px", fontFamily: DISPLAY, fontWeight: 700, fontSize: 15, color: "#1b1813", whiteSpace: "nowrap", overflow: "hidden" }}>{c.big}</div>
                    <div style={{ width: c.wildPct + "%", background: c.wildColor, display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "0 10px", fontFamily: MONO, fontWeight: 700, fontSize: 12, color: "#1b1813" }}>{c.rightInBar}</div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontFamily: MONO, fontSize: 10, letterSpacing: ".04em", color: "rgba(236,227,208,.6)" }}>
                    <span>{c.left}</span>
                    <span style={{ color: c.wildColor }}>{c.right}</span>
                  </div>
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

