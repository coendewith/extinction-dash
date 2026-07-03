import Dashboard from "@/components/Dashboard";
import speciesData from "@/data/species.json";
import lpiData from "@/data/lpi.json";
import type { LpiData, Species } from "@/lib/types";

export default function Home() {
  const species = (speciesData as { species: Species[] }).species;
  return <Dashboard initialSpecies={species} lpi={lpiData as LpiData} />;
}
