import UsageBoard from "@/components/UsageBoard";
import { listEvents } from "@/lib/pokedata";
import { listUpcoming, toCircuit } from "@/lib/events";

export const revalidate = 3600;

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function UsagePage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const [events, upcoming] = await Promise.all([listEvents(), listUpcoming()]);
  const circuit = [...toCircuit(events), ...upcoming];
  return (
    <UsageBoard
      circuit={circuit}
      initialTid={one(sp.tid)}
      initialDivision={one(sp.division)}
      initialMon={one(sp.mon)}
    />
  );
}
