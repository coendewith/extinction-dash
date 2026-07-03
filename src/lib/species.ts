import type { Species, Trend, Group } from "./types";

export const STATUS: Record<
  string,
  { bg: string; dot: string; sev: number; full: string }
> = {
  EX: { bg: "rgba(27,24,19,.10)", dot: "#1b1813", sev: 0, full: "Extinct" },
  EW: { bg: "rgba(27,24,19,.08)", dot: "#4a3f6b", sev: 1, full: "Extinct in the Wild" },
  "CR (PE)": { bg: "rgba(138,58,85,.13)", dot: "#8a3a55", sev: 2, full: "Critically Endangered (Possibly Extinct)" },
  CR: { bg: "rgba(216,57,28,.13)", dot: "#d8391c", sev: 3, full: "Critically Endangered" },
  EN: { bg: "rgba(207,143,52,.15)", dot: "#cf8f34", sev: 4, full: "Endangered" },
  VU: { bg: "rgba(184,161,62,.16)", dot: "#b8a13e", sev: 5, full: "Vulnerable" },
  NT: { bg: "rgba(122,155,62,.15)", dot: "#7a9b3e", sev: 6, full: "Near Threatened" },
  DD: { bg: "rgba(138,128,105,.14)", dot: "#8a8069", sev: 8, full: "Data Deficient" },
  LC: { bg: "rgba(79,138,72,.13)", dot: "#4f8a48", sev: 7, full: "Least Concern" },
  "LR/nt": { bg: "rgba(122,155,62,.15)", dot: "#7a9b3e", sev: 6, full: "Lower Risk / near threatened" },
  "LR/cd": { bg: "rgba(122,155,62,.15)", dot: "#7a9b3e", sev: 6, full: "Lower Risk / conservation dependent" },
  "LR/lc": { bg: "rgba(79,138,72,.13)", dot: "#4f8a48", sev: 7, full: "Lower Risk / least concern" },
};

export const TREND: Record<Trend, { icon: string; color: string; label: string; order: number }> = {
  down: { icon: "ph-arrow-down", color: "#c23417", label: "Declining", order: 0 },
  stable: { icon: "ph-arrow-right", color: "#8a8069", label: "Stable", order: 1 },
  up: { icon: "ph-arrow-up", color: "#4f8a48", label: "Recovering", order: 2 },
};

export const GROUP_ICON: Record<string, string> = {
  Mammals: "ph-paw-print",
  Birds: "ph-bird",
  Amphibians: "ph-drop",
  Fish: "ph-fish",
  Reptiles: "ph-shrimp",
  Invertebrates: "ph-bug",
};

export const GROUPS: (Group | "All")[] = [
  "All",
  "Mammals",
  "Birds",
  "Amphibians",
  "Fish",
  "Reptiles",
  "Invertebrates",
];

/** Deterministic illustrative sparkline for a wild-population trend. */
export function genSpark(trend: Trend): { obs: string; proj: string } {
  const N = 10;
  const obs: number[] = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    let v: number;
    if (trend === "down") v = 100 * Math.pow(0.3, t * 0.95) + Math.sin(i * 1.2) * 1.5;
    else if (trend === "up") v = t < 0.5 ? 100 - 70 * (t / 0.5) : 30 + 46 * ((t - 0.5) / 0.5);
    else v = 100 - 42 * t + Math.sin(i) * 1.2;
    obs.push(Math.max(4, Math.min(100, v)));
  }
  const proj: number[] = [];
  let last = obs[obs.length - 1];
  for (let j = 1; j <= 3; j++) {
    const v = trend === "down" ? last * Math.pow(0.9, j) : trend === "up" ? last * (1 + 0.05 * j) : last * 0.99;
    proj.push(Math.max(2, Math.min(100, v)));
  }
  const full = obs.concat(proj);
  const W = 176, H = 46, n = full.length;
  const xf = (i: number) => (3 + (i / (n - 1)) * (W - 6)).toFixed(1);
  const yf = (v: number) => (H - 3 - (v / 100) * (H - 8)).toFixed(1);
  const mapped = full.map((v, i) => ({ x: xf(i), y: yf(v) }));
  const pts = (arr: { x: string; y: string }[]) => arr.map((p) => `${p.x},${p.y}`).join(" ");
  return { obs: pts(mapped.slice(0, N)), proj: pts(mapped.slice(N - 1)) };
}

export interface DecoratedSpecies extends Species {
  sev: number;
  statusBg: string;
  statusDot: string;
  statusFull: string;
  trendIcon: string;
  trendColor: string;
  trendLabel: string;
  trendOrder: number;
  isWindow: boolean;
  isRecovering: boolean;
  isFE: boolean;
  sortVal: number;
  winText: string;
  feText: string;
  estDate: string;
  estSub: string;
  estColor: string;
  groupIcon: string;
  sparkObs: string;
  sparkProj: string;
  sparkColor: string;
  wikiUrl: string;
  gbifUrl: string;
}

export function ymd(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function decorate(list: Species[]): DecoratedSpecies[] {
  return list.map((r) => {
    const st = STATUS[r.status] || STATUS.CR;
    const tr = TREND[r.trend] || TREND.stable;
    const spark = genSpark(r.trend);
    const isWindow = r.kind === "window";
    const isRecovering = r.kind === "recovering";
    const isFE = r.kind === "fe";
    const sortVal = isWindow && r.win ? r.win[0] : isRecovering ? 3000 : 4000;
    const feText = isFE ? `Functionally extinct${r.feKind ? " " + r.feKind : ""} · ${r.feYear}` : "";
    return {
      ...r,
      sev: st.sev,
      statusBg: st.bg,
      statusDot: st.dot,
      statusFull: st.full,
      trendIcon: tr.icon,
      trendColor: tr.color,
      trendLabel: tr.label,
      trendOrder: tr.order,
      isWindow,
      isRecovering,
      isFE,
      sortVal,
      winText: isWindow && r.win ? `${r.win[0]}–${r.win[1]}` : "",
      feText,
      estDate: isWindow && r.win ? "≈" + Math.round((r.win[0] + r.win[1]) / 2) : isRecovering ? "Recovering" : String(r.feYear || ""),
      estSub: isWindow && r.win ? `${r.win[0]}–${r.win[1]}` : isRecovering ? "no countdown" : "functionally extinct",
      estColor: isWindow ? "#c23417" : isRecovering ? "#4f8a48" : "#8a8069",
      groupIcon: GROUP_ICON[r.group] || "ph-paw-print",
      sparkObs: spark.obs,
      sparkProj: spark.proj,
      sparkColor: isRecovering ? "#2c8a80" : isFE ? "#8a8069" : r.trend === "down" ? "#d8391c" : r.trend === "up" ? "#4f8a48" : "#cf8f34",
      wikiUrl: "https://en.wikipedia.org/wiki/" + encodeURIComponent(r.wiki),
      gbifUrl: "https://www.gbif.org/species/" + r.gbifId,
    };
  });
}

export type SortKey = "soonest" | "name" | "group" | "status" | "population" | "trend";

export function filterSort(
  rows: DecoratedSpecies[],
  opts: { search: string; groupFilter: string; kindFilter: string; sortKey: SortKey; sortDir: "asc" | "desc" }
): DecoratedSpecies[] {
  const q = opts.search.trim().toLowerCase();
  let out = rows;
  if (opts.groupFilter) out = out.filter((r) => r.group === opts.groupFilter);
  if (opts.kindFilter)
    out = out.filter((r) => (opts.kindFilter === "window" ? r.isWindow : opts.kindFilter === "recovering" ? r.isRecovering : r.isFE));
  if (q) out = out.filter((r) => (r.common + " " + r.sci).toLowerCase().includes(q));
  const dir = opts.sortDir === "desc" ? -1 : 1;
  const key = opts.sortKey;
  return [...out].sort((a, b) => {
    let c: number;
    if (key === "name") c = a.common.localeCompare(b.common);
    else if (key === "group") c = a.group.localeCompare(b.group);
    else if (key === "status") c = a.sev - b.sev;
    else if (key === "population") c = a.popNum - b.popNum;
    else if (key === "trend") c = a.trendOrder - b.trendOrder;
    else c = a.sortVal - b.sortVal;
    if (c === 0) c = a.sortVal - b.sortVal;
    return c * dir;
  });
}

export interface Elapsed {
  years: number;
  days: number;
  hours: string;
  mins: string;
  secs: string;
  totalDays: string;
}

// Decompose an elapsed duration into whole years + day remainder using true
// calendar (anniversary) arithmetic in UTC, not a fixed 365.25-day year — so the
// YR/DAY split matches a real calendar rather than drifting a day per leap cycle.
function calendarSplit(fromISO: string, now: number): { years: number; anniversaryMs: number; startMs: number; nowMs: number } {
  const a = new Date(fromISO);
  const startMs = a.getTime();
  const nowMs = Math.max(startMs, now);
  const b = new Date(nowMs);
  let years = b.getUTCFullYear() - a.getUTCFullYear();
  const anniv = (y: number) =>
    Date.UTC(a.getUTCFullYear() + y, a.getUTCMonth(), a.getUTCDate(), a.getUTCHours(), a.getUTCMinutes(), a.getUTCSeconds());
  if (anniv(years) > nowMs) years -= 1;
  return { years, anniversaryMs: anniv(years), startMs, nowMs };
}

export function elapsed(fromISO: string, now: number): Elapsed {
  const { years, anniversaryMs, startMs, nowMs } = calendarSplit(fromISO, now);
  let s = Math.floor((nowMs - anniversaryMs) / 1000);
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return { years, days: d, hours: pad(h), mins: pad(m), secs: pad(s), totalDays: Math.floor((nowMs - startMs) / 86400000).toLocaleString("en-US") };
}

export function since(fromISO: string, now: number): string {
  const { years, anniversaryMs, nowMs } = calendarSplit(fromISO, now);
  const d = Math.floor((nowMs - anniversaryMs) / 86400000);
  return years > 0 ? `${years} yr ${d} d` : `${d} d`;
}
