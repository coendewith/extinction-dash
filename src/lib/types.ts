export type Group =
  | "Mammals"
  | "Birds"
  | "Amphibians"
  | "Fish"
  | "Reptiles"
  | "Invertebrates";

export type Trend = "down" | "stable" | "up";
export type Kind = "window" | "recovering" | "fe";
export type StatusCode = "CR" | "EN" | "VU" | "EW" | "EX" | "CR (PE)";

export interface IucnMeta {
  sisId: number | null;
  category: string | null;
  yearPublished: string | null;
  possiblyExtinct: boolean;
  possiblyExtinctInWild: boolean;
  matchesSeed: boolean | null;
  url: string;
}

export interface Species {
  gbifId: number;
  common: string;
  sci: string;
  group: Group;
  region: string;
  status: StatusCode | string;
  critE: boolean;
  pop: string;
  popNum: number;
  trend: Trend;
  lastSeen: string;
  kind: Kind;
  win?: [number, number];
  conf?: string;
  feYear?: number;
  feKind?: string;
  wiki: string;
  iucn: IucnMeta;
}

export interface SpeciesPayload {
  generatedAt: string;
  source: string;
  count: number;
  enrichedFromIucn: number;
  species: Species[];
}

export interface LpiGroup {
  color: string;
  values: number[];
  /** Last year with an adequate sample; values after this are modelled. */
  observedEnd: number;
  nSpecies: number;
  nPops: number;
}

export interface LpiData {
  meta: {
    source: string;
    sourceUrl: string;
    method: string;
    populationsUsed: number;
    speciesUsed: number;
    observedEnd: number;
    projectedEnd: number;
  };
  years: number[];
  observedEnd: number;
  groups: Record<string, LpiGroup>;
  published: {
    note: string;
    globalDecline: number;
    coverage: string;
    bySystem: { label: string; decline: number }[];
    byRegion: { label: string; decline: number }[];
  };
}
