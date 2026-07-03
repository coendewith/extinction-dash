#!/usr/bin/env python3
"""
Compute a per-taxonomic-group abundance index from the Living Planet Database
2024 public release, 1970 = 100.

Method (a pragmatic, pure-Python approximation of the WWF/ZSL Living Planet
Index method):
  1. Keep every monitored population time series with >= 2 positive observations
     in a supported class (mapped to Mammals/Birds/Amphibians/Fish/Reptiles).
  2. Smooth each series in log space: series with >= 6 points get a low-order
     polynomial fit (a stand-in for the LPI's GAM); shorter series get
     log-linear interpolation. No extrapolation beyond a series' observed span.
  3. For each year, compute the mean annual log-ratio across populations within
     a species, then the mean across species within the group (two-level nesting,
     as the LPI does, to stop over-monitored species dominating). Single-year
     swings are capped at +/-1 in log10 (10x), matching the LPI's cap.
  4. Chain the ratios into an index, 1970 = 100.
  5. Project 2020 -> 2050 by continuing each group's mean 2000-2020 log-rate
     (labelled "modelled" and drawn dashed in the UI).

This unweighted-by-class cut is intentionally NOT the headline WWF/ZSL figure:
the published *weighted* global index shows a 73% decline (1970-2020) because
losses concentrate in freshwater and tropical systems that a naive class mean
under-weights. Both are surfaced in the UI so the difference is explicit.

Input : data/lpi/LivingPlanetIndex_2024_PublicData/LPD_2024_public.csv
Output: src/data/lpi.json
"""
import csv, json, math, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV = os.path.join(ROOT, "data", "lpi", "LivingPlanetIndex_2024_PublicData", "LPD_2024_public.csv")
OUT = os.path.join(ROOT, "src", "data", "lpi.json")

YEARS_IN = list(range(1950, 2021))
BASE, OBS_END, PROJ_END = 1970, 2020, 2035

GROUP_MAP = {
    "Mammalia": "Mammals", "Aves": "Birds", "Amphibia": "Amphibians", "Reptilia": "Reptiles",
    "Actinopteri": "Fish", "Elasmobranchii": "Fish", "Myxini": "Fish", "Holocephali": "Fish",
    "Petromyzonti": "Fish", "Dipneusti": "Fish", "Coelacanthi": "Fish",
}
COLORS = {"Amphibians": "#f04a26", "Fish": "#37a99d", "Mammals": "#e3a63e", "Birds": "#e8ddc4", "Reptiles": "#79bd6e"}
ORDER = ["Amphibians", "Fish", "Mammals", "Birds", "Reptiles"]


def polyfit(xs, ys, deg):
    n = len(xs); deg = min(deg, n - 1)
    m = deg + 1
    S = [0.0] * (2 * deg + 1)
    for x in xs:
        p = 1.0
        for k in range(2 * deg + 1):
            S[k] += p; p *= x
    T = [0.0] * m
    for x, y in zip(xs, ys):
        p = 1.0
        for k in range(m):
            T[k] += y * p; p *= x
    A = [[S[i + j] for j in range(m)] for i in range(m)]
    b = T[:]
    for i in range(m):
        piv = max(range(i, m), key=lambda r: abs(A[r][i]))
        if abs(A[piv][i]) < 1e-12:
            return polyfit(xs, ys, deg - 1) if deg > 1 else [sum(ys) / len(ys)]
        A[i], A[piv] = A[piv], A[i]; b[i], b[piv] = b[piv], b[i]
        for r in range(m):
            if r != i:
                f = A[r][i] / A[i][i]
                for c in range(i, m):
                    A[r][c] -= f * A[i][c]
                b[r] -= f * b[i]
    return [b[i] / A[i][i] for i in range(m)]


def polyval(coef, x):
    r = 0.0
    for c in reversed(coef):
        r = r * x + c
    return r


def smooth_series(series):
    ys = sorted(series)
    y0, y1, n = ys[0], ys[-1], len(ys)
    logv = [math.log10(series[y]) for y in ys]
    out = {}
    if n >= 6:
        coef = polyfit([y - y0 for y in ys], logv, min(4, n // 2))
        for y in range(y0, y1 + 1):
            out[y] = 10 ** polyval(coef, y - y0)
    else:
        for i in range(n - 1):
            a, b = ys[i], ys[i + 1]
            la, lb = logv[i], logv[i + 1]
            for y in range(a, b + 1):
                frac = (y - a) / (b - a) if b > a else 0
                out[y] = 10 ** (la + (lb - la) * frac)
    return out


def main():
    if not os.path.exists(CSV):
        sys.exit(f"LPI CSV not found at {CSV}\nUnzip the Living Planet Database into data/lpi/ first.")

    from collections import defaultdict
    data = defaultdict(lambda: defaultdict(list))
    total_pops = 0; species_set = set()
    with open(CSV, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            g = GROUP_MAP.get(row["Class"])
            if not g:
                continue
            series = {}
            for y in YEARS_IN:
                v = row.get(str(y), "NULL")
                if v not in ("NULL", "", "NA", None):
                    try:
                        fv = float(v)
                        if fv > 0:
                            series[y] = fv
                    except ValueError:
                        pass
            if len(series) >= 2:
                data[g][row["Binomial"]].append(series)
                total_pops += 1
                species_set.add(row["Binomial"])

    all_years = list(range(BASE, PROJ_END + 1))
    groups_out = {}
    for g in ORDER:
        species = data[g]
        interp = {sp: [smooth_series(s) for s in pops] for sp, pops in species.items()}
        idx = {BASE: 100.0}
        val = 100.0
        for y in range(BASE + 1, OBS_END + 1):
            sp_dts = []
            for pops in interp.values():
                pop_dts = []
                for s in pops:
                    if y in s and (y - 1) in s and s[y] > 0 and s[y - 1] > 0:
                        pop_dts.append(max(-1.0, min(1.0, math.log10(s[y] / s[y - 1]))))
                if pop_dts:
                    sp_dts.append(sum(pop_dts) / len(pop_dts))
            mean_dt = sum(sp_dts) / len(sp_dts) if sp_dts else 0.0
            val *= 10 ** mean_dt
            idx[y] = val
        # near-term projection: mean annual log-rate over 2000-2020, damped.
        # Kept short (to 2035) and tightly capped — extrapolating unweighted class
        # means further than ~15 years is not defensible.
        rate = (math.log10(idx[OBS_END]) - math.log10(idx[2000])) / (OBS_END - 2000)
        rate = max(-0.012, min(0.012, rate))  # cap at ~+/-2.8%/yr
        for y in range(OBS_END + 1, PROJ_END + 1):
            val *= 10 ** rate
            idx[y] = val
        groups_out[g] = {
            "color": COLORS[g],
            "values": [round(idx[y], 1) for y in all_years],
            "nSpecies": len(species),
            "nPops": sum(len(p) for p in species.values()),
        }

    out = {
        "meta": {
            "source": "Living Planet Database 2024 (WWF / ZSL), public release",
            "sourceUrl": "https://www.livingplanetindex.org/",
            "method": "Unweighted per-class abundance index, 1970=100, computed from the public LPD. See compute-lpi.py.",
            "populationsUsed": total_pops,
            "speciesUsed": len(species_set),
            "observedEnd": OBS_END,
            "projectedEnd": PROJ_END,
        },
        "years": all_years,
        "observedEnd": OBS_END,
        "groups": groups_out,
        # Published WWF/ZSL Living Planet Report 2024 headline figures (weighted global index).
        "published": {
            "note": "WWF/ZSL Living Planet Report 2024. Weighted global index, 1970-2020.",
            "globalDecline": 73,
            "coverage": "34,836 populations · 5,495 vertebrate species",
            "bySystem": [
                {"label": "Freshwater", "decline": 85},
                {"label": "Terrestrial", "decline": 69},
                {"label": "Marine", "decline": 56},
            ],
            "byRegion": [
                {"label": "Latin America & Caribbean", "decline": 95},
                {"label": "Africa", "decline": 76},
                {"label": "Asia & Pacific", "decline": 60},
                {"label": "North America", "decline": 39},
                {"label": "Europe & Central Asia", "decline": 35},
            ],
        },
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(out, f, indent=2)
    print(f"Wrote {OUT}")
    print(f"  {total_pops:,} populations · {len(species_set):,} species")
    for g in ORDER:
        v = groups_out[g]["values"]
        print(f"  {g:11s} 1970={v[0]:.0f}  2020={v[OBS_END-BASE]:.0f}  2050={v[-1]:.0f}  (n={groups_out[g]['nPops']})")


if __name__ == "__main__":
    main()
