import type { LpiData } from "./types";

export const CHART = { X0: 64, X1: 920, Y0: 28, Y1: 320, W: 960, H: 356 };

export interface ChartLine {
  key: string;
  color: string;
  obs: string;
  proj: string;
  opacity: string;
  projOpacity: string;
  active: boolean;
}

export interface ChartGeom {
  yrMin: number;
  yrMax: number;
  yMax: number;
  groups: ChartLine[];
  /** Sub-population lines for the focused group (empty when nothing is focused). */
  subLines: ChartLine[];
  dots: { key: string; color: string; y: string }[];
  xTicks: { x: string; label: string }[];
  yTicks: { y: string; label: string }[];
  scrubX: string;
  yearBoxX: string;
  baselineY: string;
  projX0: string;
  projW: string;
  projLabelX: string;
  showProj: boolean;
  focused: string | null;
}

export function valueAt(values: number[], years: number[], year: number): number {
  const i = year - years[0];
  if (i <= 0) return values[0];
  if (i >= values.length - 1) return values[values.length - 1];
  return values[i];
}

export function buildChart(
  lpi: LpiData,
  scrubYear: number,
  focused: string | null,
  showProj: boolean
): ChartGeom {
  const { X0, X1, Y0, Y1 } = CHART;
  const years = lpi.years;
  const yrMin = years[0];
  const yrMax = years[years.length - 1];
  const obsEnd = lpi.observedEnd;
  const focusGroup = focused ? lpi.groups[focused] : null;
  const subgroups = focusGroup?.subgroups ?? [];

  // Dynamic y-axis: fit the tallest visible series. In focus mode the group's
  // sub-lines can rise well above the main lines (e.g. marine mammals), so the
  // axis zooms to include them.
  let peak = 100;
  for (const g of Object.values(lpi.groups)) peak = Math.max(peak, ...g.values);
  if (focusGroup) for (const s of subgroups) peak = Math.max(peak, ...s.values);
  const step = peak <= 120 ? 20 : peak <= 220 ? 40 : peak <= 320 ? 60 : 80;
  const yMax = Math.ceil(peak / step) * step;

  const px = (yr: number) => X0 + ((yr - yrMin) / (yrMax - yrMin)) * (X1 - X0);
  const py = (val: number) => Y1 - (val / yMax) * (Y1 - Y0);

  const buildLine = (key: string, color: string, values: number[], gObsEnd: number, active: boolean): ChartLine => {
    const obs: string[] = [];
    const proj: string[] = [];
    years.forEach((yr, i) => {
      const p = `${px(yr).toFixed(1)},${py(values[i]).toFixed(1)}`;
      if (yr <= gObsEnd) obs.push(p);
      if (yr >= gObsEnd) proj.push(p);
    });
    return {
      key,
      color,
      obs: obs.join(" "),
      proj: showProj ? proj.join(" ") : "",
      opacity: active ? "1" : "0.12",
      projOpacity: active ? "0.7" : "0.06",
      active,
    };
  };

  const groups: ChartLine[] = [];
  const dots: ChartGeom["dots"] = [];
  for (const [key, g] of Object.entries(lpi.groups)) {
    // In focus mode the focused group's main line dims too (its sub-lines carry
    // the detail); everything else dims to context.
    const active = focused === null;
    groups.push(buildLine(key, g.color, g.values, g.observedEnd ?? obsEnd, active));
    if (active) dots.push({ key, color: g.color, y: py(valueAt(g.values, years, scrubYear)).toFixed(1) });
  }

  const subLines: ChartLine[] = [];
  if (focusGroup) {
    // faint context line for the focused group's overall trend
    groups.forEach((l) => { if (l.key === focused) { l.opacity = "0.28"; l.projOpacity = "0.14"; } });
    for (const s of subgroups) {
      subLines.push(buildLine(s.key, s.color, s.values, s.observedEnd ?? obsEnd, true));
      dots.push({ key: s.key, color: s.color, y: py(valueAt(s.values, years, scrubYear)).toFixed(1) });
    }
  }

  const decadeTicks = years.filter((y) => y % 10 === 0);
  if (!decadeTicks.includes(obsEnd)) decadeTicks.push(obsEnd);
  const scrubX = px(scrubYear);
  const yTicks: ChartGeom["yTicks"] = [];
  for (let v = 0; v <= yMax; v += step) yTicks.push({ y: py(v).toFixed(1), label: String(v) });

  return {
    yrMin,
    yrMax,
    yMax,
    groups,
    subLines,
    dots,
    xTicks: decadeTicks.sort((a, b) => a - b).map((y) => ({ x: px(y).toFixed(1), label: String(y) })),
    yTicks,
    scrubX: scrubX.toFixed(1),
    yearBoxX: (scrubX - 29).toFixed(1),
    baselineY: py(100).toFixed(1),
    projX0: px(obsEnd).toFixed(1),
    projW: (X1 - px(obsEnd)).toFixed(1),
    projLabelX: (px(obsEnd) + 8).toFixed(1),
    showProj,
    focused,
  };
}
