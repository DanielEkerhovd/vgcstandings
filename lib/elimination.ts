import { cutRounds } from "./bracket";
import type { Player } from "./pokedata";

/* ------------------------------------------------------------------ *
 * Who is out.
 *
 * pokedata publishes no such field. `drop` is voluntary drops only —
 * someone who packed up and went home — and nothing anywhere says a
 * player can no longer reach the cut. So it's derived here, and like
 * bracket.ts this file is pure: no fetching, no React.
 *
 * Two rules, and a player is out if either fires.
 *
 * ARITHMETIC. Points only ever go up, so a player's ceiling is what
 * they hold plus 3 for every round left. If `cut` others ALREADY hold
 * more than that ceiling, every one of them finishes above whatever
 * happens next. Certain, and it ignores resistance and the fact that
 * the field can't all win out at once — both of which only ever kill
 * more people, never fewer.
 *
 * PROJECTION. The arithmetic alone is useless in practice: at Worlds
 * 2026 Masters it stayed silent until round 7, by which point 301 of
 * the 395 were already on three losses and everyone watching had known
 * for four rounds. What people actually mean by out is X-3, and the
 * data backs them — of 173 Masters players who finished X-3, none made
 * cut, and the worst record that did was 9-2. Same in Seniors and
 * Juniors.
 *
 * So the threshold is derived rather than assumed. Swiss halves the
 * undefeated each round, so the players finishing on k losses is about
 * N * C(rounds,k) / 2^rounds; the cut fills from the top, so the last
 * record that makes it is the smallest k whose running total reaches
 * `cut`. That gives X-3 at Worlds Masters and Juniors — matching what
 * happened — X-4 at Seniors, which is one too generous, and X-2 for a
 * 1200-player regional. It errs toward leaving people alive, which is
 * the failure this file should have.
 *
 * It IS a projection, though, and that's the honest difference from
 * the rule above: an X-3 making cut is rare, not impossible. Nothing on
 * the page says which of the two rules drew the line, so if that ever
 * needs stating, `maxLosses` is the number to state it with.
 * ------------------------------------------------------------------ */

/** The slice of EventMeta this needs. Stated structurally so lib/ doesn't
 *  have to reach up into components/ for a type. */
export interface EventShape {
  round: number | null;
  rounds: number | null;
  ended: boolean;
}

export interface Elimination {
  /** Lowest `placing` that is out — the divider goes above that row.
   *  null when nobody is, which is also every case we can't answer. */
  line: number | null;
  /** The cut size the Swiss maths was run against. An assumption rather
   *  than something we were told, so the label quotes it. */
  cut: number;
  /** Most losses that can still make cut, projected — so `maxLosses + 1` is
   *  the "X-3" people say. null outside the Swiss phase. */
  maxLosses: number | null;
  phase: "swiss" | "cut";
  /** Bracket players already knocked out, name → the round it happened.
   *  These sit *above* the line, so the divider can't speak for them. */
  outIn: Map<string, number>;
}

/** Nothing upstream announces the cut size until the bracket is paired, and
 *  every VGC premier event this app can reach cuts to 8.
 *
 *  Note this deliberately does NOT defer to `meta.cutSize`. That number is
 *  the *bracket* size — the count of paired players snapped up to a power of
 *  two, which is what a tree has to be laid out on. It is not how many made
 *  cut: Worlds 2026 cut 13, so cutSize reads 16. Right for the bracket, wrong
 *  for a label, and it's only ever known once the maths here has stopped
 *  mattering anyway. */
const DEFAULT_CUT = 8;

const none = (cut: number): Elimination => ({
  line: null,
  cut,
  maxLosses: null,
  phase: "swiss",
  outIn: new Map(),
});

/** How many entries of a descending array are strictly greater than `x`. */
function countAbove(desc: number[], x: number): number {
  let lo = 0;
  let hi = desc.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (desc[mid] > x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Multiplicative form — no factorials, so nothing overflows at any round
 *  count a tournament could have. */
function choose(n: number, k: number): number {
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}

/**
 * Most losses that still makes the cut, from the shape of a Swiss field:
 * about `n * C(rounds,k) / 2^rounds` players finish on k losses, and the cut
 * fills from the top.
 */
export function maxLossesForCut(n: number, rounds: number, cut: number): number {
  let sum = 0;
  for (let k = 0; k <= rounds; k++) {
    sum += (n * choose(rounds, k)) / 2 ** rounds;
    if (sum >= cut) return k;
  }
  return rounds;
}

export function eliminate(
  players: Player[],
  meta: EventShape,
  cut = DEFAULT_CUT,
): Elimination {
  // A finished event doesn't need telling. The gold leader card and the
  // Top N divider are the whole story by then, and a red line across final
  // standings would just be reading the table back to you.
  if (meta.ended) return none(cut);
  // Too small a field for anyone to be outside the cut.
  if (players.length <= cut) return none(cut);

  // The header is what tells Swiss from cut, but it has been seen reading
  // "Round 11/11" with the first cut pairings already in the file — so ask
  // bracket.ts, which has the backstop for exactly that.
  const { rounds: cr } = cutRounds(players, meta.rounds);
  if (cr.length) return inCut(players, cut, cr[0]);

  // ── Swiss ──────────────────────────────────────────────────────
  // Both numbers come from the scraped header line. Without them there is
  // no ceiling to compute, and an event we know nothing about gets no line
  // — the same rule that stops the crown appearing on a guess.
  if (meta.round === null || meta.rounds === null) return none(cut);

  const remaining = Math.max(0, meta.rounds - meta.round);
  const desc = players.map((p) => p.points).sort((a, b) => b - a);
  const maxLosses = maxLossesForCut(players.length, meta.rounds, cut);

  const isDead = (p: Player) =>
    p.losses > maxLosses ||
    // A player never counts against themselves: ceiling >= points always, so
    // their own entry is never strictly above it. Worth keeping alongside the
    // projection — in the last round it's the sharper of the two, because by
    // then `remaining` is 0 and it reads the real table rather than a model.
    countAbove(desc, p.points + 3 * remaining) >= cut;

  // Take the longest run of out players at the BOTTOM of the table, rather
  // than the highest-placed one anywhere. The rules don't agree with the sort:
  // standings order on points, and a 1-1-3 and a 2-3-0 both hold 6, so a dead
  // player can sit directly above a live one. Scanning up from the bottom and
  // stopping at the first survivor means nobody below the line is ever still
  // alive — the line under-claims instead, the same way round as every other
  // call in this file.
  //
  // Drops are transparent to the scan: they don't stop it, because they really
  // are out, but they can't start the block either. Someone who went home in
  // round 1 is not "X-4 or worse", and letting one anchor the line would put a
  // red rule across a table on which nothing has happened yet. Their row says
  // "dropped R1" on its own.
  const byPlacing = [...players].sort((a, b) => a.placing - b.placing);
  const dropped = (p: Player) => p.droppedAfter !== null;

  let i = byPlacing.length;
  while (i > 0 && (isDead(byPlacing[i - 1]) || dropped(byPlacing[i - 1]))) i--;
  // Walk the top edge back down onto a player the projection actually killed.
  while (i < byPlacing.length && !isDead(byPlacing[i])) i++;

  // Never contradict the Top N divider by calling someone inside the cut out.
  const line = i >= byPlacing.length || i < cut ? null : byPlacing[i].placing;

  return { line, cut, maxLosses, phase: "swiss", outIn: new Map() };
}

/**
 * Once the bracket is paired, "out" is a fact rather than a projection: the
 * first cut round holds exactly the players who made it, so nothing has to be
 * projected and no cut size has to be assumed — which is why the label drops
 * the number here and just says "missed cut".
 *
 * The line is the lowest placing that isn't in it. pokedata re-sorts `placing`
 * as cut results land but keeps the cut on top, so that is the boundary.
 */
function inCut(players: Player[], cut: number, first: number): Elimination {
  const outIn = new Map<string, number>();
  let line: number | null = null;

  for (const p of players) {
    const made = p.matches.some((m) => m.round === first);
    if (!made) {
      if (line === null || p.placing < line) line = p.placing;
      continue;
    }
    const lost = p.matches.find((m) => m.round >= first && m.result === "L");
    if (lost) outIn.set(p.name, lost.round);
  }

  return { line, cut, maxLosses: null, phase: "cut", outIn };
}
