// Curated watchlist — the editorial source of truth.
//
// Each entry carries fields that are genuinely editorial (population estimates,
// projected functional-extinction windows from IUCN Criterion E assessments,
// last-confirmed-sighting dates, regions). The build step (build-data.mjs)
// overlays the *live* IUCN Red List category + possibly-extinct flags + the
// canonical assessment URL on top of this, so the conservation status shown is
// always current rather than frozen at authoring time.
//
// Fields:
//   gbifId    GBIF taxon key (for gbif.org/species/<id> links + occurrence maps)
//   common    common name
//   sci       scientific (binomial) name — the key used to query IUCN v4
//   group     Mammals | Birds | Amphibians | Fish | Reptiles | Invertebrates
//   region    plain-language range
//   status    fallback IUCN category if the live lookup fails (CR, EW, EX, CR (PE))
//   critE     assessed against IUCN Red List Criterion E (quantitative extinction risk)
//   pop       human-readable wild population estimate
//   popNum    numeric wild population (for sorting)
//   trend     down | stable | up  (wild population direction)
//   lastSeen  ISO date of last confirmed wild sighting / most recent survey
//   kind      window (projected extinction window) | recovering | fe (functionally extinct)
//   win       [startYear, endYear] projected functional-extinction window (kind=window)
//   conf      confidence / caveat note on the window
//   feYear    year declared functionally extinct (kind=fe)
//   feKind    qualifier, e.g. "in the wild" (kind=fe)
//   wiki      Wikipedia page title (for the article link + REST image lookup)

export const SPECIES_SEED = [
  { gbifId: 4302145, common: "Vaquita", sci: "Phocoena sinus", group: "Mammals", region: "Gulf of California, Mexico", status: "CR", critE: true, pop: "~10", popNum: 10, trend: "down", lastSeen: "2023-05-26", kind: "window", win: [2026, 2032], conf: "50% probability by ~2029", wiki: "Vaquita" },
  { gbifId: 2440947, common: "Saola", sci: "Pseudoryx nghetinhensis", group: "Mammals", region: "Annamite Range, Vietnam / Laos", status: "CR (PE)", critE: true, pop: "unknown (<100)", popNum: 50, trend: "down", lastSeen: "2013-09-07", kind: "window", win: [2027, 2036], conf: "wide uncertainty, no recent survey", wiki: "Saola" },
  { gbifId: 2422158, common: "Axolotl", sci: "Ambystoma mexicanum", group: "Amphibians", region: "Lake Xochimilco, Mexico", status: "CR", critE: true, pop: "50-1,000 wild", popNum: 500, trend: "down", lastSeen: "2024-02-01", kind: "window", win: [2030, 2045], conf: "wild only; captive population large", wiki: "Axolotl" },
  { gbifId: 4262283, common: "Sumatran rhino", sci: "Dicerorhinus sumatrensis", group: "Mammals", region: "Sumatra & Borneo", status: "CR", critE: true, pop: "~40", popNum: 40, trend: "down", lastSeen: "2024-06-01", kind: "window", win: [2035, 2060], conf: "fragmented sub-populations", wiki: "Sumatran_rhinoceros" },
  { gbifId: 5219243, common: "Chinese giant salamander", sci: "Andrias davidianus", group: "Amphibians", region: "Central & southern China", status: "CR", critE: false, pop: "declining", popNum: 5000, trend: "down", lastSeen: "2024-04-01", kind: "window", win: [2035, 2065], conf: "wild vs farmed hard to separate", wiki: "Chinese_giant_salamander" },
  { gbifId: 2340686, common: "Devils Hole pupfish", sci: "Cyprinodon diabolis", group: "Fish", region: "Devils Hole, Nevada, USA", status: "CR", critE: true, pop: "~200", popNum: 200, trend: "stable", lastSeen: "2025-03-01", kind: "window", win: [2035, 2070], conf: "single locality, count-based", wiki: "Devils_Hole_pupfish" },
  { gbifId: 2440672, common: "Ploughshare tortoise", sci: "Astrochelys yniphora", group: "Reptiles", region: "Baly Bay, Madagascar", status: "CR", critE: true, pop: "~500", popNum: 500, trend: "down", lastSeen: "2024-05-01", kind: "window", win: [2035, 2060], conf: "poaching-driven decline", wiki: "Ploughshare_tortoise" },
  { gbifId: 2440895, common: "Yangtze finless porpoise", sci: "Neophocaena asiaeorientalis", group: "Mammals", region: "Yangtze River, China", status: "CR", critE: true, pop: "~1,000", popNum: 1000, trend: "down", lastSeen: "2024-09-01", kind: "window", win: [2040, 2070], conf: "river-wide survey based", wiki: "Yangtze_finless_porpoise" },
  { gbifId: 2481010, common: "Regent honeyeater", sci: "Anthochaera phrygia", group: "Birds", region: "South-eastern Australia", status: "CR", critE: true, pop: "~300", popNum: 300, trend: "down", lastSeen: "2025-01-15", kind: "window", win: [2045, 2080], conf: "song loss accelerating decline", wiki: "Regent_honeyeater" },
  { gbifId: 2440449, common: "European eel", sci: "Anguilla anguilla", group: "Fish", region: "Europe & North Africa", status: "CR", critE: false, pop: "declining", popNum: 900000, trend: "down", lastSeen: "2025-04-01", kind: "window", win: [2050, 2090], conf: "recruitment index based", wiki: "European_eel" },
  { gbifId: 4262265, common: "Javan rhino", sci: "Rhinoceros sondaicus", group: "Mammals", region: "Ujung Kulon, Java", status: "CR", critE: true, pop: "~76", popNum: 76, trend: "stable", lastSeen: "2025-02-01", kind: "window", win: [2050, 2090], conf: "single population, camera-trap", wiki: "Javan_rhinoceros" },
  { gbifId: 5845958, common: "Amur leopard", sci: "Panthera pardus orientalis", group: "Mammals", region: "Russian Far East / NE China", status: "CR", critE: true, pop: "~130", popNum: 130, trend: "stable", lastSeen: "2025-05-01", kind: "window", win: [2055, 2100], conf: "slow recovery, still tiny", wiki: "Amur_leopard" },
  { gbifId: 2441022, common: "Gharial", sci: "Gavialis gangeticus", group: "Reptiles", region: "India & Nepal river systems", status: "CR", critE: false, pop: "~650 adults", popNum: 650, trend: "up", lastSeen: "2025-03-20", kind: "window", win: [2055, 2100], conf: "stabilising with reintroductions", wiki: "Gharial" },
  { gbifId: 2454356, common: "Archey’s frog", sci: "Leiopelma archeyi", group: "Amphibians", region: "Coromandel & Whareorino, NZ", status: "CR", critE: false, pop: "5,000-20,000", popNum: 12000, trend: "stable", lastSeen: "2024-11-01", kind: "window", win: [2060, 2100], conf: "chytrid risk, monitored", wiki: "Archey's_frog" },
  { gbifId: 2440755, common: "Hawksbill turtle", sci: "Eretmochelys imbricata", group: "Reptiles", region: "Pantropical oceans", status: "CR", critE: false, pop: "declining", popNum: 80000, trend: "down", lastSeen: "2025-06-01", kind: "window", win: [2060, 2100], conf: "nesting-count based", wiki: "Hawksbill_sea_turtle" },
  { gbifId: 2473958, common: "Kakapo", sci: "Strigops habroptilus", group: "Birds", region: "Predator-free islands, NZ", status: "CR", critE: false, pop: "~250", popNum: 250, trend: "up", lastSeen: "2025-05-20", kind: "recovering", wiki: "Kakapo" },
  { gbifId: 2481740, common: "California condor", sci: "Gymnogyps californianus", group: "Birds", region: "California, Arizona, Baja", status: "CR", critE: false, pop: "~350 wild", popNum: 350, trend: "up", lastSeen: "2025-06-10", kind: "recovering", wiki: "California_condor" },
  { gbifId: 2479120, common: "Spix’s macaw", sci: "Cyanopsitta spixii", group: "Birds", region: "Bahia, Brazil (reintroduced)", status: "EW", critE: false, pop: "~40 released", popNum: 40, trend: "up", lastSeen: "2025-04-01", kind: "recovering", wiki: "Spix's_macaw" },
  { gbifId: 2481050, common: "Black stilt / Kakī", sci: "Himantopus novaezelandiae", group: "Birds", region: "Mackenzie Basin, NZ", status: "CR", critE: false, pop: "~169", popNum: 169, trend: "up", lastSeen: "2025-02-20", kind: "recovering", wiki: "Black_stilt" },
  { gbifId: 2422131, common: "Panamanian golden frog", sci: "Atelopus zeteki", group: "Amphibians", region: "Central Panama", status: "CR (PE)", critE: false, pop: "0 confirmed wild", popNum: 0, trend: "down", lastSeen: "2009-01-01", kind: "fe", feYear: 2009, feKind: "in the wild", wiki: "Panamanian_golden_frog" },
  { gbifId: 4302147, common: "Northern white rhino", sci: "Ceratotherium simum cottoni", group: "Mammals", region: "Central Africa (extinct in wild)", status: "EW", critE: false, pop: "2 (non-wild)", popNum: 2, trend: "stable", lastSeen: "2018-03-19", kind: "fe", feYear: 2018, feKind: "", wiki: "Northern_white_rhinoceros" },
  { gbifId: 2440894, common: "Baiji", sci: "Lipotes vexillifer", group: "Mammals", region: "Yangtze River, China", status: "CR (PE)", critE: false, pop: "0 confirmed", popNum: 0, trend: "down", lastSeen: "2004-09-01", kind: "fe", feYear: 2006, feKind: "", wiki: "Baiji" },
  { gbifId: 2418565, common: "Chinese paddlefish", sci: "Psephurus gladius", group: "Fish", region: "Yangtze River, China", status: "EX", critE: false, pop: "0", popNum: 0, trend: "down", lastSeen: "2003-01-01", kind: "fe", feYear: 2022, feKind: "", wiki: "Chinese_paddlefish" },
  { gbifId: 1340503, common: "Franklin’s bumblebee", sci: "Bombus franklini", group: "Invertebrates", region: "Oregon & California, USA", status: "CR (PE)", critE: false, pop: "0 recent", popNum: 0, trend: "down", lastSeen: "2006-08-09", kind: "fe", feYear: 2006, feKind: "", wiki: "Franklin's_bumblebee" },
];
