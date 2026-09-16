"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useOptimistic,
  useState,
  useTransition,
} from "react";
import { useRouter, useSelectedLayoutSegment } from "next/navigation";
import type { CircuitEvent } from "@/lib/events";
import { isFixtureTid } from "@/lib/fixtures";
import { useFavorites } from "@/lib/favorites";
import { usage, type Player, type Tally } from "@/lib/pokedata";
import {
  Credits,
  DensityToggle,
  EventControls,
  Masthead,
  SourceBanner,
  type Division,
  type EventMeta,
  type Section,
  type Source,
  type StandingsSeed,
  ViewSkeleton,
  useAgo,
  useCircuit,
  useDensity,
  useEventTid,
  useStandings,
} from "./shared";

/* ------------------------------------------------------------------ *
 * The chrome, and the standings behind it, for all three views at once.
 *
 * This lives in `app/event/[slug]/[division]/layout.tsx`, which is the
 * whole point: Next does not re-invoke a layout when you navigate between
 * its sibling pages, so clicking Standings → Usage → Bracket re-renders
 * only the board. The masthead, the nav, the division control, the live
 * dot and the poll all stay exactly as they are — nothing refetches and
 * nothing blinks, because none of it is re-rendered at all.
 *
 * Before this the three boards each owned a copy of the six hooks below
 * and a copy of this header, so every tab click paid for a fresh
 * `eventSnapshot()`, a fresh 100KB of rows in the RSC payload, and a
 * fresh `/api/standings` fetch of what the browser already had.
 * ------------------------------------------------------------------ */

interface EventCtx {
  circuit: CircuitEvent[];
  /** The event on screen. Not always the URL's — see `useEventTid`. */
  tid: string;
  division: Division;
  /** null for a fixture, which has no address. */
  slug: string | null;
  view: Section;
  event?: CircuitEvent;

  players: Player[] | null;
  meta: EventMeta;
  source: Source;
  error: string | null;
  loading: boolean;

  /** The toolbar's search box. Kept per view — see the note on `queries`. */
  query: string;
  setQuery: (v: string) => void;

  favesOnly: boolean;
  faves: Set<string>;
  faveList: readonly string[];
  toggleFave: (name: string) => void;

  /** Folded once here so the toolbar's count and the list can't disagree. */
  usageRows: Tally[];
  /** Players whose team list is public — the only ones usage can be read from. */
  known: number;
}

const Ctx = createContext<EventCtx | null>(null);

export function useEvent(): EventCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useEvent must be used inside <EventShell>");
  return v;
}

export default function EventShell({
  circuit: served,
  initialTid,
  division,
  seed,
  view: forcedView,
  children,
}: {
  circuit: CircuitEvent[];
  initialTid?: string;
  /** From the `[division]` segment, so the URL is the only source for it. */
  division: Division;
  /** Rows rendered on the server, so the first HTML isn't an empty shell. */
  seed?: StandingsSeed | null;
  /** Only for the legacy `/usage` and `/bracket` landings, which have no
   *  `[division]` layout under them to read a segment from. */
  view?: Section;
  children: React.ReactNode;
}) {
  const router = useRouter();

  /* Which of the three is on screen. Off the router rather than a prop,
     because the layout this renders in is deliberately *not* re-rendered
     when the view changes — a prop would be stale from the second click
     onwards. It also updates at the start of the transition, so the nav
     pill and the search placeholder flip on the click rather than when
     the new board lands. */
  const segment = useSelectedLayoutSegment();
  const view: Section =
    forcedView ?? (segment === "usage" || segment === "bracket" ? segment : "standings");

  /* ------------------------------------------------------------------ *
   * The section switch shows itself before the server has answered
   *
   * The comment above is true of the *tree* — but the router does not commit
   * the new tree until the first byte of the new page is back. Until then the
   * whole navigation is one held transition: `useSelectedLayoutSegment` still
   * says the old view, the nav pill stays put, and the per-view `loading.tsx`
   * — which can only render as part of the new tree — never gets its chance.
   * On a cold route, or wherever the link wasn't prefetched, that was seconds
   * of a page that looked ignored.
   *
   * So the links hand the click to us, and we do what the division control
   * already does: an optimistic view that flips now and reverts by itself when
   * the real segment lands, and a transition of our own whose `switching`
   * swaps the board for the next view's skeleton meanwhile. Its own transition,
   * not `pending` below — that one dims the division control, and a tab click
   * has nothing to do with the division.
   * ------------------------------------------------------------------ */
  const [shownView, showView] = useOptimistic(view);
  const [switching, startSwitch] = useTransition();
  const onView = useCallback(
    (v: Section, href: string) => {
      startSwitch(() => {
        showView(v);
        router.push(href);
      });
    },
    [router, showView],
  );

  const circuit = useCircuit(served);
  const [tid, setTid] = useEventTid(served, initialTid);

  const { players, meta, source, fetchedAt, error, loading } = useStandings(
    tid,
    division,
    30_000,
    seed,
  );
  const { compact, toggle: toggleDensity } = useDensity();
  const ago = useAgo(fetchedAt);
  const { list: faveList, set: faves, toggle: toggleFave, count: faveCount } = useFavorites();

  /* One box per view rather than one box reset on navigation. An effect that
     cleared it would run a frame late, which is the flash this whole change
     exists to remove — and remembering the search per tab is better than
     losing it, which is what happens today. */
  const [queries, setQueries] = useState<Record<Section, string>>({
    standings: "",
    usage: "",
    bracket: "",
  });
  const query = queries[shownView];
  const setQuery = useCallback(
    (v: string) => setQueries((q) => ({ ...q, [shownView]: v })),
    [shownView],
  );

  const [favesOnly, setFavesOnly] = useState(false);

  /**
   * Where this event lives, or null if it doesn't live anywhere.
   *
   * A fixture is invented and has no page, but it goes through `toCircuit`
   * like everything else and comes out with a slug all the same — so "has a
   * slug" is not the test, and using it sent the picker to
   * `/event/2026-fixture-swiss-round-4-of-11/masters`, which is a 404. The
   * reserved tid is the only thing that actually distinguishes one.
   */
  const event = circuit.find((e) => e.tid === tid);
  const slug = useMemo(
    () => (isFixtureTid(tid) ? null : (event?.slug ?? null)),
    [event, tid],
  );

  const known = useMemo(
    () => (players ?? []).filter((p) => p.hasTeam).length,
    [players],
  );

  /* Only folded for the tab that shows it — `usage()` is a pass over every
     team in the event, and the standings and bracket have no use for it. */
  const usageRows = useMemo(() => {
    if (shownView !== "usage" || !players) return [];
    const q = query.trim().toLowerCase();
    return usage(players).filter((m) => !q || m.name.toLowerCase().includes(q));
  }, [shownView, players, query]);

  /* ------------------------------------------------------------------ *
   * The URL is a navigation, not a side effect
   *
   * Picking an event or a division goes through the router to the address
   * that page actually lives at. This used to be an effect calling
   * `router.replace` on every change, which feeds itself: Next hands the new
   * URL to the router, the route re-renders, the effect runs again.
   *
   * Both change the `[slug]`/`[division]` segment, so unlike a tab click they
   * *do* re-render this layout and do have to wait for the server. In a
   * transition, which is why: the page you're reading stays up and stays
   * interactive while the next one loads, instead of freezing with no sign
   * that anything is happening. `pending` dims the control you touched.
   * ------------------------------------------------------------------ */
  const [pending, startTransition] = useTransition();
  const [shownDivision, showDivision] = useOptimistic(division);

  const suffix = shownView === "standings" ? "" : `/${shownView}`;

  const onDivision = useCallback(
    (d: Division) => {
      // A fixture has no address, and one set of rows serves all three of its
      // divisions anyway — so there is nothing to navigate to, and the thumb
      // stays where it is rather than sliding to a change that isn't.
      if (!slug) return;
      startTransition(() => {
        // Slides now. React reverts it when the real `division` prop lands,
        // by which point the two agree.
        showDivision(d);
        router.push(`/event/${slug}/${d}${suffix}`);
      });
    },
    [slug, suffix, router, showDivision],
  );

  const onPick = useCallback(
    (v: string) => {
      // A fixture has no address; it stays client-side state. Tested by its
      // reserved tid, not by a missing slug — see `slug` above.
      const to = isFixtureTid(v) ? null : (circuit.find((e) => e.tid === v)?.slug ?? null);
      if (!to) {
        setTid(v);
        return;
      }
      startTransition(() => router.push(`/event/${to}/${division}${suffix}`));
    },
    [circuit, division, suffix, router, setTid],
  );

  /* The right-hand end of the toolbar. Density is on all three; the rest is
     whatever that view has to say about what's under it. A plain node rather
     than a nested component — declaring one inside this function would give it
     a new identity every render and remount these buttons under the reader. */
  const right =
    shownView === "usage" ? (
      <>
        {players && (
          <span className="meta">
            <b>{usageRows.length}</b> Pokémon · <b>{known}</b> teams
          </span>
        )}
        <DensityToggle compact={compact} onToggle={toggleDensity} />
      </>
    ) : shownView === "bracket" ? (
      <DensityToggle compact={compact} onToggle={toggleDensity} />
    ) : (
      <>
        <DensityToggle compact={compact} onToggle={toggleDensity} />
        <button
          className={`pill${favesOnly ? " on" : ""}`}
          aria-pressed={favesOnly}
          onClick={() => setFavesOnly((v) => !v)}
          disabled={faveCount === 0}
          title={faveCount === 0 ? "Star a player first" : "Show only favourited players"}
        >
          {favesOnly ? "Close favorites" : "★ Show favorites"}
        </button>
      </>
    );

  const ctx: EventCtx = {
    circuit,
    tid,
    division,
    slug,
    view,
    event,
    players,
    meta,
    source,
    error,
    loading,
    query,
    setQuery,
    favesOnly,
    faves,
    faveList,
    toggleFave,
    usageRows,
    known,
  };

  return (
    <Ctx.Provider value={ctx}>
      <div className="shell">
        <header className="masthead">
          <Masthead
            circuit={circuit}
            tid={tid}
            onPick={onPick}
            meta={meta}
            source={source}
            ago={ago}
            loading={loading}
            hasData={Boolean(players)}
            pending={pending}
          />

          <EventControls
            slug={slug}
            active={shownView}
            division={shownDivision}
            onDivision={onDivision}
            onView={onView}
            pending={pending}
            right={right}
          >
            {shownView !== "bracket" && (
              <input
                className="search"
                placeholder={
                  shownView === "usage"
                    ? "Search Pokémon…"
                    : "Search name, IGN, country, Pokémon, item…"
                }
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label={
                  shownView === "usage"
                    ? "Search Pokémon"
                    : "Search by player name, in-game name, country, Pokémon or held item"
                }
              />
            )}
          </EventControls>
        </header>

        <SourceBanner source={source} tid={tid} />
        {error && !players && (
          <div className="banner">
            <b>Couldn&apos;t load standings.</b> {error}
          </div>
        )}

        {/* The board we're leaving is not the board that's coming, so it
            doesn't stay up as if it were. The same placeholder the new view's
            `loading.tsx` would draw — see `ViewSkeleton` for why that matters. */}
        {switching && shownView !== view ? <ViewSkeleton view={shownView} /> : children}

        <Credits event={event} />
      </div>
    </Ctx.Provider>
  );
}
