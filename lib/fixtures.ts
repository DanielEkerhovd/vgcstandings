import type { EventSummary } from "./pokedata";

/* ------------------------------------------------------------------ *
 * Synthetic tournaments.
 *
 * Three states the live feed only passes through for a few minutes a year,
 * frozen so they can be looked at on a Tuesday. `scripts/build-fixtures.mjs`
 * writes the rows; this file is only the catalogue entry and the header line
 * that would have been scraped off the standings page.
 *
 * Deliberately no JSON imports here — this module is reachable from client
 * components through `listEvents`, and the row files have no business in a
 * browser bundle. The route does the loading, dynamically, so they don't ride
 * along in a build that isn't serving them either.
 * ------------------------------------------------------------------ */

export interface Fixture {
  tid: string;
  name: string;
  dates: string;
  /**
   * The header line, exactly as `fetchMeta` would have parsed it:
   * "128 players - Round 13/11 - Tables Still Playing : 1 - Tie Rate : 0.02"
   *
   * Round numbers past `rounds` are cut rounds — that's the signal the whole
   * bracket derivation hangs off, so a fixture that lies here tests nothing.
   */
  players: number;
  round: number;
  rounds: number;
  playing: number;
  tieRate: string;
  /** Shown on the fixture banner, so what you're looking at is never a guess. */
  note: string;
}

export const FIXTURES: Fixture[] = [
  {
    tid: "9000001",
    name: "Fixture — Swiss, Round 4 of 11",
    dates: "August 30, 2026",
    players: 128,
    round: 4,
    rounds: 11,
    playing: 0,
    tieRate: "0.03",
    note: "Mid-Swiss, no cut. The bracket page should show its “no top cut yet” state.",
  },
  {
    tid: "9000002",
    name: "Fixture — Top 8 done, nothing paired above",
    dates: "August 30, 2026",
    players: 128,
    round: 12,
    rounds: 11,
    playing: 0,
    tieRate: "0.02",
    note:
      "All four quarter-finals are in and pokedata hasn't paired the semis. " +
      "Top 4 and Finals are projected, and stay blank: the four winners are " +
      "known but which of them meet isn't.",
  },
  {
    tid: "9000003",
    name: "Fixture — Top 4, one match still out",
    dates: "August 30, 2026",
    players: 128,
    round: 13,
    rounds: 11,
    playing: 1,
    tieRate: "0.02",
    note:
      "One semi-final decided, one still playing. The projected final names " +
      "the winner that's in and leaves the other seat empty — the pairing has " +
      "nowhere else to go.",
  },
];

/**
 * Whether these are in play isn't decided here — `toolsOn()` in `devtools.ts`
 * owns that, and the rows stay on disk either way. Nothing in this file gates
 * itself, so testing a bracket state is never a reason to add or delete a
 * file.
 */
export const isFixtureTid = (tid?: string | null): boolean =>
  FIXTURES.some((f) => f.tid === tid);

export const fixtureFor = (tid: string, on: boolean): Fixture | null =>
  (on && FIXTURES.find((f) => f.tid === tid)) || null;

/** The catalogue rows, in the shape pokedata's index would have produced. */
export const fixtureEvents = (): EventSummary[] =>
  FIXTURES.map(({ tid, name, dates }) => ({ tid, name, dates }));
