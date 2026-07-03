import type { LpiData } from "./types";

export const CHART = { X0: 64, X1: 920, Y0: 28, Y1: 320, W: 960, H: 356 };

export interface ChartGeom {
  yrMin: number;
  yrMax: number;
  yMax: number;
  groups: {
    key: string;
    color: string;
    obs: string;
    proj: string;
    opacity: string;
    projOpacity: string;
    active: boolean;
  }[];
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
  chartOff: Record<string, boolean>,
  showProj: boolean
): ChartGeom {
  const { X0, X1, Y0, Y1 } = CHART;
  const years = lpi.years;
  const yrMin = years[0];
  const yrMax = years[years.length - 1];
  const obsEnd = lpi.observedEnd;

  // Dynamic y-axis: fit the tallest series (some groups rise above the 1970=100 baseline).
  let peak = 100;
  for (const g of Object.values(lpi.groups)) peak = Math.max(peak, ...g.values);
  const step = peak <= 120 ? 20 : peak <= 220 ? 40 : 60;
  const yMax = Math.ceil(peak / step) * step;

  const px = (yr: number) => X0 + ((yr - yrMin) / (yrMax - yrMin)) * (X1 - X0);
  const py = (val: number) => Y1 - (val / yMax) * (Y1 - Y0);

  const groups: ChartGeom["groups"] = [];
  const dots: ChartGeom["dots"] = [];
  for (const [key, g] of Object.entries(lpi.groups)) {
    const active = !chartOff[key];
    // Each group has its own observed end — sparse groups (e.g. amphibians, whose
    // data thins out after 2017) go dashed earlier rather than faking observations.
    const gObsEnd = g.observedEnd ?? obsEnd;
    const obs: string[] = [];
    const proj: string[] = [];
    years.forEach((yr, i) => {
      const p = `${px(yr).toFixed(1)},${py(g.values[i]).toFixed(1)}`;
      if (yr <= gObsEnd) obs.push(p);
      if (yr >= gObsEnd) proj.push(p);
    });
    groups.push({
      key,
      color: g.color,
      obs: obs.join(" "),
      proj: showProj ? proj.join(" ") : "",
      opacity: active ? "1" : "0.12",
      projOpacity: active ? "0.7" : "0.06",
      active,
    });
    if (active) dots.push({ key, color: g.color, y: py(valueAt(g.values, years, scrubYear)).toFixed(1) });
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
  };
}
