import { UA, listEvents, normalize, type Player, type RawPlayer } from "./pokedata";
import { eventSlug, prettyName, tierOf, toCircuit, type CircuitEvent, type Tier } from "./events";

/**
 * A server-side read of one event, for the things that have to be true before
 * the page renders: the <title>, the description, and the link-preview card.
 *
 * The browser gets all of this from `/api/standings/...` already, but a
 * crawler never runs the client. Facebook, Discord and Google read the HTML
 * once and leave, so whatever they should see has to be in the first response.
 * That's the whole reason this file exists next to the proxy rather than
 * inside it.
 */

const DIVISIONS = { juniors: "Juniors", seniors: "Seniors", masters: "Masters" } as const;
export type Division = keyof typeof DIVISIONS;

export const asDiv = (v?: string | null): Division =>
  v === "juniors" || v === "seniors" ? v : "masters";

export interface EventSnapshot {
  tid: string;
  division: Division;
  /** "World Championship" — the same pretty label the masthead shows. */
  label: string;
  tier: Tier;
  dates: string | null;
  players: number | null;
  round: number | null;
  rounds: number | null;
  playing: number | null;
  /** Last round played out, nothing still on a table. */
  finished: boolean;
  standings: Player[];
}

/** The header line off the standings page. Same scrape as the proxy's. */
async function meta(tid: string, division: string) {
  try {
    const res = await fetch(`https://www.pokedata.ovh/standingsVGC/${tid}/${division}/`, {
      headers: { "user-agent": UA },
      next: { revalidate: 30 },
      // Rendering waits on this. One person's server having a bad afternoon
      // must not turn into a page that never answers.
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const text = (await res.text()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const m = text.match(
      /(\d+)\s*players\s*-\s*Round\s*(\d+)\s*\/\s*(\d+)\s*-\s*Tables Still Playing\s*:\s*(\d+)/i,
    );
    if (!m) return null;
    return {
      players: Number(m[1]),
      round: Number(m[2]),
      rounds: Number(m[3]),
      playing: Number(m[4]),
    };
  } catch {
    return null;
  }
}

/**
 * Null when the event can't be read — a bad id, or upstream being down. The
 * callers all fall back to generic copy rather than inventing a number, which
 * matters more here than anywhere else in the app: a wrong OG card gets cached
 * by Facebook and Discord for days.
 */
export async function eventSnapshot(
  rawTid: string | undefined,
  rawDivision: string | undefined,
): Promise<EventSnapshot | null> {
  const division = asDiv(rawDivision);
  const tid = rawTid ?? (await listEvents())[0]?.tid;
  if (!tid || !/^\d{7}$/.test(tid)) return null;

  const file = `${tid}_${DIVISIONS[division]}.json`;
  const url = `https://www.pokedata.ovh/standingsVGC/${tid}/${division}/${file}`;

  try {
    const [res, events, line] = await Promise.all([
      fetch(url, {
        headers: { "user-agent": UA },
        next: { revalidate: 30 },
        signal: AbortSignal.timeout(4000),
      }),
      listEvents(),
      meta(tid, division),
    ]);
    if (!res.ok) return null;

    const standings = normalize((await res.json()) as RawPlayer[]).sort(
      (a, b) => a.placing - b.placing,
    );
    if (standings.length === 0) return null;

    const event = events.find((e) => e.tid === tid);

    return {
      tid,
      division,
      label: event ? prettyName(event.name) : "VGC event",
      tier: tierOf(event?.name ?? ""),
      dates: event?.dates ?? null,
      players: line?.players ?? standings.length,
      round: line?.round ?? null,
      rounds: line?.rounds ?? null,
      playing: line?.playing ?? null,
      finished: Boolean(line && line.round === line.rounds && line.playing === 0),
      standings,
    };
  } catch {
    return null;
  }
}

/** Match a `?player=` value against a field, tolerating the [CC] suffix. */
export function findPlayer(snap: EventSnapshot, wanted?: string | null) {
  if (!wanted) return null;
  const want = wanted.trim().toLowerCase();
  return (
    snap.standings.find((p) => p.name.toLowerCase() === want) ??
    snap.standings.find((p) => p.display.toLowerCase() === want) ??
    null
  );
}

export const recordOf = (p: Player) => `${p.wins}-${p.losses}-${p.ties}`;

/** "Round 8 of 11 · 395 players", or as much of it as we actually know. */
export function progressLine(snap: EventSnapshot) {
  const bits: string[] = [];
  if (snap.round && snap.rounds) {
    bits.push(snap.finished ? `${snap.rounds} rounds` : `Round ${snap.round} of ${snap.rounds}`);
  }
  if (snap.players) bits.push(`${snap.players} players`);
  return bits.join(" · ");
}

/** 1 -> "1st". Used by both the <title> and the card. */
export function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/* ------------------------------------------------------------------ *
 * Slugs
 *
 * Pokédata has no slugs, only 7-digit ids, so the mapping is built from the
 * catalogue on every request — a cached fetch that the event picker already
 * makes anyway. Unknown slug means the event fell off the index or the URL was
 * invented, and both should 404 rather than quietly show the newest event.
 * ------------------------------------------------------------------ */

export async function circuitEvents(): Promise<CircuitEvent[]> {
  return toCircuit(await listEvents());
}

export async function eventBySlug(slug: string): Promise<CircuitEvent | null> {
  const events = await circuitEvents();
  return events.find((e) => e.slug === slug) ?? null;
}

/** The event the site opens on: whatever pokedata listed most recently. */
export async function latestEvent(): Promise<CircuitEvent | null> {
  return (await circuitEvents())[0] ?? null;
}

/** `/event/2026-world-championship/masters` for a given event. */
export const eventPath = (slug: string, division: Division) =>
  `/event/${slug}/${division}`;

export { eventSlug };
