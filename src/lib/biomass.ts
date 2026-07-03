// Global biomass, gigatonnes of carbon (Gt C). Bar-On, Phillips & Milo (2018),
// "The biomass distribution on Earth", PNAS. Table 1 / Fig. 1.
// https://www.pnas.org/doi/10.1073/pnas.1711842115

export type BiomassView = "Mammals only" | "Animals only" | "All life on Earth";

interface BiomassRow {
  label: string;
  v: number;
  color: string;
}

const ANIMALS: BiomassRow[] = [
  { label: "Arthropods (insects, crustaceans)", v: 1.0, color: "#8a8069" },
  { label: "Fish", v: 0.7, color: "#37a99d" },
  { label: "Molluscs", v: 0.2, color: "#b04e6f" },
  { label: "Livestock (cattle, pigs, poultry)", v: 0.1, color: "#f04a26" },
  { label: "Humans", v: 0.06, color: "#e3a63e" },
  { label: "Wild mammals", v: 0.007, color: "#e8ddc4" },
  { label: "Wild birds", v: 0.002, color: "#79bd6e" },
];

const ALL_LIFE: BiomassRow[] = [
  { label: "Plants", v: 450, color: "#79bd6e" },
  { label: "Bacteria", v: 70, color: "#37a99d" },
  { label: "Fungi", v: 12, color: "#e3a63e" },
  { label: "Archaea", v: 7, color: "#8a8069" },
  { label: "Protists", v: 4, color: "#b04e6f" },
  { label: "Animals (all)", v: 2, color: "#f04a26" },
];

// Mammals by biomass — the starkest cut. Livestock (cattle + pigs) and humans
// dwarf everything wild. Wild mammals are ~4% of mammal biomass.
const MAMMALS: BiomassRow[] = [
  { label: "Livestock (cattle, pigs, sheep)", v: 0.1, color: "#f04a26" },
  { label: "Humans", v: 0.06, color: "#e3a63e" },
  { label: "Wild mammals", v: 0.007, color: "#79bd6e" },
];

export function biomassRows(view: BiomassView) {
  const rows = view === "All life on Earth" ? ALL_LIFE : view === "Mammals only" ? MAMMALS : ANIMALS;
  const max = Math.max(...rows.map((r) => r.v));
  return rows.map((r) => ({
    label: r.label,
    color: r.color,
    widthCss: Math.max(0.7, (r.v / max) * 100).toFixed(2) + "%",
    valueLabel: (r.v >= 1 ? r.v.toFixed(0) : r.v.toFixed(3)) + " Gt C",
  }));
}

export const composition = [
  {
    label: "MAMMAL BIOMASS",
    unit: "by mass",
    big: "96% us + livestock",
    bigPct: 96,
    wildPct: 4,
    bigColor: "#f04a26",
    wildColor: "#79bd6e",
    left: "HUMANS + DOMESTICATED LIVESTOCK",
    right: "WILD 4%",
    rightInBar: "",
  },
  {
    label: "ALL BIRDS",
    unit: "by mass",
    big: "70% poultry",
    bigPct: 70,
    wildPct: 30,
    bigColor: "#e3a63e",
    wildColor: "#79bd6e",
    left: "DOMESTICATED POULTRY, MOSTLY CHICKENS",
    right: "WILD BIRDS",
    rightInBar: "30%",
  },
  {
    label: "PLANTS vs ANIMALS",
    unit: "all life, by mass",
    big: "Plants ≈ 225× all animals",
    bigPct: 99.5,
    wildPct: 0.5,
    bigColor: "#79bd6e",
    wildColor: "#f04a26",
    left: "PLANTS · 450 Gt C",
    right: "ANIMALS · 2 Gt C",
    rightInBar: "",
  },
];

export const sources = [
  { name: "IUCN Red List", desc: "Conservation status and Criterion E assessments", url: "https://www.iucnredlist.org" },
  { name: "Living Planet Index", desc: "Population abundance trends (ZSL / WWF)", url: "https://www.livingplanetindex.org" },
  { name: "GBIF", desc: "Occurrence records, sightings and images", url: "https://www.gbif.org" },
  { name: "Encyclopedia of Life", desc: "Species imagery and traits, Wikipedia fallback", url: "https://eol.org" },
  { name: "Wikimedia Commons", desc: "Species photography (used for the images here)", url: "https://commons.wikimedia.org" },
  { name: "Bar-On et al. 2018", desc: "The biomass distribution on Earth, PNAS", url: "https://www.pnas.org/doi/10.1073/pnas.1711842115" },
];
