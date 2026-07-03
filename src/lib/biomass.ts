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

// Mammals by biomass — the starkest cut. Cattle alone ≈ humans, and each is
// ~9x ALL wild mammals combined. Bar-On 2018: livestock 0.1 Gt C total (cattle
// ~0.06, dominant), humans 0.06, wild mammals just 0.007.
const MAMMALS: BiomassRow[] = [
  { label: "Cattle", v: 0.06, color: "#f04a26" },
  { label: "Humans", v: 0.06, color: "#e3a63e" },
  { label: "Pigs, sheep & other livestock", v: 0.04, color: "#cf8f34" },
  { label: "Wild mammals (all, land + sea)", v: 0.007, color: "#79bd6e" },
];

export function biomassRows(view: BiomassView) {
  const rows = view === "All life on Earth" ? ALL_LIFE : view === "Mammals only" ? MAMMALS : ANIMALS;
  const max = Math.max(...rows.map((r) => r.v));
  const min = Math.min(...rows.map((r) => r.v));
  // For the Mammals cut, show each bar relative to wild mammals (the baseline) —
  // that multiple ("9× wild") is far more legible than the raw 0.06 vs 0.007 Gt C.
  const showRel = view === "Mammals only";
  return rows.map((r) => ({
    label: r.label,
    color: r.color,
    widthCss: Math.max(0.7, (r.v / max) * 100).toFixed(2) + "%",
    valueLabel: (r.v >= 1 ? r.v.toFixed(0) : r.v.toFixed(3)) + " Gt C",
    relLabel: showRel ? (r.v / min >= 1.5 ? `${Math.round(r.v / min)}× wild` : "baseline") : "",
  }));
}

export const composition = [
  {
    // Mammal total ≈ 0.167 Gt C: cattle .06, humans .06, other livestock .04, wild .007
    label: "MAMMAL BIOMASS",
    unit: "by mass · Gt C",
    caption: "Cattle, humans and other livestock are ~96% of mammal biomass. Wild mammals: ~4%.",
    segments: [
      { label: "Cattle", pct: 36, color: "#f04a26" },
      { label: "Humans", pct: 36, color: "#e3a63e" },
      { label: "Pigs & other livestock", pct: 24, color: "#cf8f34" },
      { label: "Wild mammals", pct: 4, color: "#79bd6e" },
    ],
  },
  {
    // Poultry ~0.005 vs wild birds ~0.002 Gt C
    label: "BIRD BIOMASS",
    unit: "by mass · Gt C",
    caption: "Domesticated poultry (mostly chickens) outweigh all wild birds ~7 to 3.",
    segments: [
      { label: "Poultry", pct: 70, color: "#e3a63e" },
      { label: "Wild birds", pct: 30, color: "#79bd6e" },
    ],
  },
  {
    // Plants 450 vs animals 2 Gt C
    label: "PLANTS vs ANIMALS",
    unit: "all life · by mass",
    caption: "Plants (450 Gt C) are ~225× the biomass of all animals combined (2 Gt C).",
    segments: [
      { label: "Plants", pct: 99.5, color: "#79bd6e" },
      { label: "Animals", pct: 0.5, color: "#f04a26" },
    ],
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
