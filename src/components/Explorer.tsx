"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Species } from "@/lib/types";
import { STATUS, GROUP_ICON, since, ymd } from "@/lib/species";
import type { SpeciesRow } from "@/lib/supabase";
import COUNTRIES from "@/data/countries.json";

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
  const [sort, setSort] = useState<"severity" | "name" | "year">("severity");
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
  }, [debouncedQ, cats, group, country, sort, dir]);

  // fetch results
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    if (debouncedQ) params.set("q", debouncedQ);
    if (cats.size) params.set("category", [...cats].join(","));
    if (group) params.set("group", group);
    if (country) params.set("country", country);
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
  }, [debouncedQ, cats, group, country, sort, dir, page]);

  // lazy Wikipedia enrichment for the visible rows (image + common name + extract)
  useEffect(() => {
    let cancelled = false;
    rows.forEach((r) => {
      const key = r.scientific_name;
      if (wiki[key]?.loaded) return;
      fetch("https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(key.replace(/ /g, "_")))
        .then((res) => (res.ok ? res.json() : null))
        .then((j) => {
          if (cancelled) return;
          const info: WikiInfo = { loaded: true };
          if (j && j.type !== "disambiguation") {
            info.title = j.title;
            info.img = j.thumbnail?.source || j.originalimage?.source;
            info.extract = j.extract;
          }
          setWiki((prev) => ({ ...prev, [key]: info }));
        })
        .catch(() => {
          if (!cancelled) setWiki((prev) => ({ ...prev, [key]: { loaded: true } }));
        });
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
  const clickSort = (key: "severity" | "name" | "year") => {
    if (sort === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setDir(key === "name" ? "asc" : "desc");
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const chip = (active: boolean) =>
    active
      ? { background: "#1b1813", color: "#efe7d6", border: "1px solid #1b1813" }
      : { background: "transparent", color: "#4f4839", border: "1px solid rgba(27,24,19,.22)" };
  const GRID = "44px minmax(160px,1fr) 128px 150px 80px 30px";

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
          Every animal the IUCN has assessed
        </h2>
        <p style={{ fontFamily: SERIF, fontSize: 16, lineHeight: 1.55, color: "#4f4839", margin: "8px 0 0", maxWidth: "74ch" }}>
          The full IUCN Red List of animals — searched and filtered live against a database of{" "}
          <b>{total > 0 ? total.toLocaleString("en-US") : "—"}</b> species{country ? ` recorded in ${(COUNTRIES as { code: string; name: string }[]).find((c) => c.code === country)?.name || country}` : ""}, ranked by extinction
          risk. Filter by status, group and country. Photos and common names load from Wikipedia; search matches scientific names.
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

        {/* table */}
        <div style={{ background: "#f6f0e2", border: "1px solid rgba(27,24,19,.18)", borderRadius: 4, overflow: "hidden", marginTop: 16 }}>
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: 720 }}>
              <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 12, padding: "13px 22px", background: "rgba(27,24,19,.06)", alignItems: "center", borderBottom: "1px solid rgba(27,24,19,.14)" }}>
                <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 9.5, letterSpacing: ".1em", color: "#8a8069" }}>#</div>
                <SortHead label="SPECIES" active={sort === "name"} dir={dir} onClick={() => clickSort("name")} />
                <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 9.5, letterSpacing: ".1em", color: "#8a8069" }}>GROUP</div>
                <SortHead label="IUCN STATUS" active={sort === "severity"} dir={dir} onClick={() => clickSort("severity")} />
                <SortHead label="ASSESSED" active={sort === "year"} dir={dir} onClick={() => clickSort("year")} />
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
                return (
                  <div key={r.sis_id} style={{ borderTop: "1px solid rgba(27,24,19,.09)" }}>
                    <div
                      onClick={() => setExpanded((id) => (id === r.sis_id ? null : r.sis_id))}
                      className="wl-row"
                      style={{ display: "grid", gridTemplateColumns: GRID, gap: 12, alignItems: "center", padding: "10px 22px", cursor: "pointer", background: expandedRow ? "rgba(27,24,19,.05)" : "transparent" }}
                    >
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
                      <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".02em", color: "#4f4839", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.group_name}</div>
                      <div>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: st.bg, padding: "4px 8px", borderRadius: 2 }}>
                          <span style={{ width: 6, height: 6, background: st.dot, flex: "none" }} />
                          <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 10.5, color: "#1b1813" }}>{r.category}</span>
                        </span>
                      </div>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: "#4f4839" }}>{r.year_published || "—"}</div>
                      <div style={{ display: "flex", justifyContent: "center" }}>
                        <i className={expandedRow ? "ph ph-caret-up" : "ph ph-caret-down"} style={{ fontSize: 16, color: "#8a8069" }} />
                      </div>
                    </div>
                    {expandedRow && <Detail r={r} wiki={w} curated={curatedBySis.get(r.sis_id)} now={now} />}
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
          CLICK ANY ROW FOR DETAIL / SORT BY COLUMN / DATA: IUCN RED LIST v4 · PHOTOS &amp; NAMES: WIKIPEDIA
        </div>
      </div>
    </section>
  );
}

function SortHead({ label, active, dir, onClick }: { label: string; active: boolean; dir: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: MONO, fontWeight: 700, fontSize: 9.5, letterSpacing: ".1em", color: active ? "#1b1813" : "#8a8069", textAlign: "left" }}>
      {label}
      {active && <i className={dir === "desc" ? "ph-bold ph-caret-down" : "ph-bold ph-caret-up"} style={{ fontSize: 11 }} />}
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
  return (
    <div style={{ padding: "4px 22px 26px", background: "rgba(27,24,19,.035)" }}>
      <div className="detail-grid" style={{ display: "grid", gridTemplateColumns: "200px minmax(0,1fr)", gap: 26, alignItems: "start", paddingTop: 18 }}>
        <div>
          <div style={{ width: 200, maxWidth: "100%", height: 150, borderRadius: 3, background: "#16221b", border: "1px solid rgba(27,24,19,.12)", position: "relative", overflow: "hidden", display: "flex", alignItems: "flex-end", padding: 10 }}>
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
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 9 }}>
            <a href={wikiUrl} target="_blank" rel="noopener noreferrer" style={linkStyle}>WIKIPEDIA <i className="ph ph-arrow-square-out" style={{ fontSize: 12 }} /></a>
            <a href={iucnUrl} target="_blank" rel="noopener noreferrer" style={linkStyle}>IUCN <i className="ph ph-arrow-square-out" style={{ fontSize: 12 }} /></a>
            <a href={gbifUrl} target="_blank" rel="noopener noreferrer" style={linkStyle}>GBIF <i className="ph ph-arrow-square-out" style={{ fontSize: 12 }} /></a>
          </div>
        </div>

        <div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "14px 30px", marginBottom: wiki?.extract || curated ? 14 : 0 }}>
            <Fact label="IUCN STATUS">{st.full}</Fact>
            <Fact label="GROUP">{r.group_name}</Fact>
            <Fact label="ASSESSED">{r.year_published || "—"}</Fact>
            {curated?.region && <Fact label="REGION">{curated.region}</Fact>}
            {curated?.pop && <Fact label="EST. WILD POPULATION">{curated.pop}</Fact>}
            {curated?.lastSeen && (
              <Fact label="SINCE LAST SIGHTING">
                {since(curated.lastSeen, now)} ago <span style={{ color: "#8a8069" }}>· {ymd(curated.lastSeen)}</span>
              </Fact>
            )}
          </div>
          {curated?.kind === "window" && curated.win && (
            <div style={{ display: "inline-block", background: "#16221b", borderRadius: 4, padding: "12px 16px", color: "#ece3d0", marginBottom: 12 }}>
              <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 9.5, letterSpacing: ".12em", color: "#e3a63e" }}>MODELLED / PROJECTED WINDOW</div>
              <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 22, marginTop: 2 }}>{curated.win[0]}–{curated.win[1]}</div>
              {curated.conf && <div style={{ fontFamily: SERIF, fontSize: 12, color: "rgba(236,227,208,.62)", marginTop: 2 }}>{curated.conf}</div>}
            </div>
          )}
          {wiki?.extract && (
            <p style={{ fontFamily: SERIF, fontSize: 14.5, lineHeight: 1.6, color: "#4f4839", margin: 0, maxWidth: "70ch" }}>{wiki.extract}</p>
          )}
          {!wiki?.extract && !curated && (
            <p style={{ fontFamily: SERIF, fontSize: 14, lineHeight: 1.6, color: "#8a8069", margin: 0 }}>
              No Wikipedia summary found for <i>{r.scientific_name}</i>. Follow the IUCN link for the full assessment.
            </p>
          )}
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
