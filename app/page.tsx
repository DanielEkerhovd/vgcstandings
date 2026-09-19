import { redirect } from "next/navigation";
import EventShell from "@/components/EventShell";
import Explorer from "@/components/Explorer";
import { listUpcoming } from "@/lib/events";
import { asDiv, circuitEvents, eventSnapshot, latestEvent } from "@/lib/summary";
import { eventMetadata } from "@/lib/metadata";
import { toSeed } from "@/lib/seed";
import { isCrawler } from "@/lib/crawler";

/**
 * Standings for whatever event ran most recently.
 *
 * Events live at /event/<slug>/<division> now. This stays as the landing page,
 * and forwards any old `?tid=` link to its real address so the two URLs don't
 * compete for the same words in search.
 */
export const revalidate = 60;

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function generateMetadata({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const latest = await latestEvent();
  return eventMetadata({
    tid: one(sp.tid) ?? latest?.tid ?? undefined,
    division: one(sp.division),
    player: one(sp.player),
    canonical: "/",
    view: "standings",
  });
}

export default async function Page({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const division = asDiv(one(sp.division));

  // Old shared links: send them to the address the page actually lives at.
  const wanted = one(sp.tid);
  if (wanted) {
    const hit = (await circuitEvents()).find((e) => e.tid === wanted);
    if (hit?.slug) {
      const player = one(sp.player);
      redirect(
        `/event/${hit.slug}/${division}` +
          (player ? `?player=${encodeURIComponent(player)}` : ""),
      );
    }
  }

  const latest = await latestEvent();
  const [circuit, upcoming, snap] = await Promise.all([
    circuitEvents(),
    listUpcoming(),
    // Rows in the HTML only for crawlers — the event layout says why.
    latest?.tid
      ? eventSnapshot(latest.tid, division, { rows: await isCrawler() })
      : Promise.resolve(null),
  ]);

  /* The shell is normally the `[division]` layout's, so that a tab click
     doesn't re-render it. There is no such layout over a landing page — it's
     one view you tab *out* of, and its nav already points at the latest
     event's real address — so it wraps its own. */
  return (
    <EventShell
      circuit={[...circuit, ...upcoming]}
      initialTid={latest?.tid ?? undefined}
      division={division}
      seed={toSeed(snap)}
      view="standings"
    >
      <Explorer initialPlayer={one(sp.player)} />
    </EventShell>
  );
}
