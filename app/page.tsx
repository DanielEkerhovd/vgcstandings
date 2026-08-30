import Explorer from "@/components/Explorer";
import { listEvents } from "@/lib/pokedata";
import { listUpcoming, toCircuit } from "@/lib/events";

// Re-check the event catalogue hourly; it changes a few times a month.
export const revalidate = 3600;

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Page({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const [events, upcoming] = await Promise.all([listEvents(), listUpcoming()]);
  const circuit = [...toCircuit(events), ...upcoming];
  return (
    <Explorer
      circuit={circuit}
      initialTid={one(sp.tid)}
      initialDivision={one(sp.division)}
    />
  );
}
