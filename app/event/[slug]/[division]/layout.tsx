import { notFound } from "next/navigation";
import EventShell from "@/components/EventShell";
import { listUpcoming } from "@/lib/events";
import { asDiv, circuitEvents, eventBySlug, eventSnapshot } from "@/lib/summary";
import { DIVISIONS, type Params } from "@/lib/eventView";
import { toSeed } from "@/lib/seed";
import { EventJsonLd } from "@/lib/jsonld";

/**
 * Everything the three views of an event have in common, fetched once.
 *
 * The fetches are here rather than in the three pages because Next does not
 * re-invoke a layout when you navigate between its sibling pages. Standings →
 * Usage → Bracket therefore re-renders only the board: no `eventSnapshot()`,
 * no second copy of four hundred rows in the payload, and no remount of the
 * masthead, the nav or the poll. They were in the pages, and every tab click
 * paid for all of it again while the reader sat on the old view.
 *
 * A division or a different event *does* change a segment above this, so those
 * two still render this layout and still wait for the server. `EventShell`
 * runs them through a transition so the current page stays up meanwhile.
 *
 * There is deliberately **no `loading.tsx` beside this file**. A Suspense
 * boundary above the shell would start the response before `notFound()` could
 * set a status, turning a bad slug's 404 into a 200 with a `noindex` tag, and
 * would put a skeleton ahead of the rows in the first HTML — which is the
 * thing `lib/seed.ts` exists to prevent. The per-view `loading.tsx` files sit
 * *below* this and are the right place for it. Don't move one up here.
 */
export default async function EventLayout({
  params,
  children,
}: {
  params: Params;
  children: React.ReactNode;
}) {
  const { slug, division } = await params;

  // A division that isn't one of the three is a typo or a probe, not a page.
  if (!DIVISIONS.includes(division as (typeof DIVISIONS)[number])) notFound();

  // Started before the catalogue is awaited: rk9's list has nothing to do with
  // which event this is, and waiting for the slug lookup first put a whole
  // round trip on the critical path for no reason.
  const upcomingP = listUpcoming();

  const event = await eventBySlug(slug);
  if (!event?.tid) notFound();

  const [upcoming, circuit, snap] = await Promise.all([
    upcomingP,
    circuitEvents(),
    eventSnapshot(event.tid, division),
  ]);

  return (
    <>
      {/* One event, one URL. The standings address names it from all three
          views rather than each view claiming to be the same event at a
          different address; `alternates.canonical` still differs per view. */}
      {snap && <EventJsonLd snap={snap} path={`/event/${slug}/${division}`} />}
      <EventShell
        circuit={[...circuit, ...upcoming]}
        initialTid={event.tid}
        division={asDiv(division)}
        seed={toSeed(snap)}
      >
        {children}
      </EventShell>
    </>
  );
}
