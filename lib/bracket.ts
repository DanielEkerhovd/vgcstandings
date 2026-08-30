import { indexByName, type MatchResult, type Player } from "./pokedata";

/* ------------------------------------------------------------------ *
 * Top cut, reconstructed.
 *
 * pokedata has no bracket field. What it does have is every cut match,
 * written into both players' `rounds` maps exactly like a Swiss round —
 * so the bracket is derivable, and this file is the derivation. It is
 * pure: no fetching, no React. Feed it `Player[]` and the Swiss round
 * count and it hands back a tree the page can lay out.
 *
 * Three facts from the live feed drive the whole design:
 *
 *   1. Cut rounds are just rounds numbered past the Swiss count.
 *   2. Both sides of a cut match are present, and byes are real entries
 *      ("BYE" upstream, normalised to `opponent: null`). A bye is one
 *      more node that produces one more advancer, which is what keeps
 *      the tree balanced even when the cut isn't a power of two —
 *      Worlds 2026 cut 13 players: 5 matches + 3 byes = 8 into the Top 8.
 *   3. `result` is null while the table is still out.
 * ------------------------------------------------------------------ */

const COUNTRY = /\s*\[([A-Za-z]{2,3})\]\s*$/;

/** Nothing above this many players in the last round can be a top cut.
 *  Only used by the heuristic; the header path has no such limit. */
const MAX_CUT_FIELD = 16;

/** Cut rounds roughly halve. Swiss rounds lose a few percent to drops,
 *  so anything above this ratio is Swiss, not a cut. */
const CUT_RATIO = 0.7;

export interface Record3 {
  wins: number;
  losses: number;
  ties: number;
}

export interface BracketSide {
  /** Full string including the [CC] suffix — still the join key. */
  name: string;
  display: string;
  country: string | null;
  /**
   * Current standing, NOT a frozen Swiss seed: pokedata re-sorts `placing`
   * as cut results land, which is why the UI labels it a rank.
   */
  placing: number | null;
  /** As the feed reports it — Swiss and cut wins mixed together. */
  record: Record3 | null;
  /** Swiss-only, so the seeding that produced this bracket stays readable.
   *  Null when the Swiss round count is unknown. */
  swiss: Record3 | null;
  /** From this side's point of view. Null = the table is still out. */
  result: MatchResult | null;
  /** Null when the feed names this player as an opponent but doesn't list
   *  them — a partial division, or someone pokedata never had a row for. */
  player: Player | null;
  /** An unfilled seat in a projected round. Every other field is empty and
   *  `name` is a synthetic key, not a player. */
  tbd: boolean;
}

export interface BracketNode {
  /** Round plus both names, sorted — stable across polls even as `placing`
   *  churns underneath, so React keys and the layout never thrash. */
  id: string;
  round: number;
  /** 0 = leftmost cut round. Drives the grid column. */
  depth: number;
  kind: "match" | "bye";
  /** One side for a bye, two for a match. Index-aligned with `from`. */
  sides: BracketSide[];
  /** Display metadata and the ordering key. 0 for a bye. */
  table: number;
  /** Index into `sides`, or null while the table is still out. */
  winner: number | null;
  /** A real match with no result yet. */
  live: boolean;
  /** Not in the feed at all — a round the bracket says must happen, which
   *  pokedata hasn't paired yet. Never live, never clickable. */
  projected: boolean;
  /** This card's own wire runs into a projected parent, so it should be
   *  drawn as provisionally as the card it points at. */
  parentProjected: boolean;
  /** Where each side came from in the previous cut round. */
  from: (BracketNode | null)[];
  /** Vertical position, in units of one leaf. Always a multiple of 0.5. */
  slot: number;
  hasParent: boolean;
  /** Slots from here to the parent; positive = the parent sits below. */
  dy: number | null;
}

export interface BracketRound {
  round: number;
  depth: number;
  /** Distinct players who played this round — or, for a projected round,
   *  who will. */
  size: number;
  label: string;
  /** Nothing in this round is in the feed yet. */
  projected: boolean;
  nodes: BracketNode[];
}

export interface Bracket {
  rounds: BracketRound[];
  /** Leaf count. The grid is twice this many rows tall. */
  slots: number;
  detected: "header" | "derived";
  swissRounds: number | null;
  /** False when the rounds couldn't be linked into a tree — render plain
   *  columns rather than a confidently wrong picture. */
  linked: boolean;
  liveCount: number;
  /** Rounds drawn ahead of the feed. 0 for a finished event. */
  projectedRounds: number;
}

/* ------------------------------------------------------------------ *
 * Round shape
 * ------------------------------------------------------------------ */

/** Participants per round. The empty states quote this, so it's exported. */
export function roundSizes(players: Player[]): Map<number, number> {
  const sizes = new Map<number, number>();
  for (const p of players) {
    for (const m of p.matches) sizes.set(m.round, (sizes.get(m.round) ?? 0) + 1);
  }
  return sizes;
}

const isPow2 = (n: number) => n >= 2 && (n & (n - 1)) === 0;

/**
 * Fallback naming, from the number of players actually in the round.
 *
 * The page prefers `stageOf`/`cutStages` in components/shared.tsx, which name
 * stages from the bracket size the masthead already derived — so the column
 * headings and the round-progress strip always agree. This only runs when the
 * round header didn't parse and there is no size to name stages from. Same
 * vocabulary ("Finals", not "Final") so the two can't read differently.
 *
 * A first cut round that isn't a power of two but feeds one is a play-in:
 * 13 players contesting 8 slots is exactly that.
 */
export function roundLabel(
  size: number,
  isFirstCutRound: boolean,
  nextSize: number | null,
): string {
  if (size === 2) return "Finals";
  if (isPow2(size)) return `Top ${size}`;
  if (isFirstCutRound && nextSize !== null && isPow2(nextSize)) return "Play-in";
  return "Top Cut";
}

/**
 * Which rounds are top cut, and how confident we are.
 *
 * The header is the truth when we have it: cut rounds are numbered past the
 * Swiss count. But it's scraped from an HTML line that can be missing
 * (offline, page reshuffled) or stale — it has been seen reading "Round
 * 11/11" while the first cut pairings were already out — so there's a
 * backstop that reads the shape of the rounds themselves.
 */
export function cutRounds(
  players: Player[],
  swissRounds: number | null,
): { rounds: number[]; detected: "header" | "derived" | "none" } {
  const sizes = roundSizes(players);
  const all = [...sizes.keys()].sort((a, b) => a - b);
  if (!all.length) return { rounds: [], detected: "none" };

  if (swissRounds !== null) {
    const past = all.filter((r) => r > swissRounds);
    if (past.length) return { rounds: past, detected: "header" };
  }

  // Backstop: walk back from the last round while each one is small and
  // roughly half its predecessor. A Swiss tail (29 → 28 players, ratio .97)
  // never qualifies, so this can't invent a bracket that isn't there.
  const last = all[all.length - 1];
  if ((sizes.get(last) ?? 0) > MAX_CUT_FIELD) return { rounds: [], detected: "none" };

  const found: number[] = [];
  for (let i = all.length - 1; i > 0 && found.length < 6; i--) {
    const size = sizes.get(all[i]) ?? 0;
    const prev = sizes.get(all[i - 1]) ?? 0;
    if (size < 2 || size > 64) break;
    if (size > prev * CUT_RATIO) break;
    found.unshift(all[i]);
  }

  return found.length
    ? { rounds: found, detected: "derived" }
    : { rounds: [], detected: "none" };
}

/* ------------------------------------------------------------------ *
 * The build
 * ------------------------------------------------------------------ */

const flip = (r: MatchResult | null): MatchResult | null =>
  r === "W" ? "L" : r === "L" ? "W" : r;

/** Byes sort last; everything else by table, low tables being the feature
 *  ones. Never by `placing` — that churns between polls and would make the
 *  cards jump around under the reader. */
const orderKey = (n: BracketNode | null) =>
  n && n.table ? n.table : Number.MAX_SAFE_INTEGER;

/** How a side should read: the card and the match detail must never
 *  disagree about who won, so the expression lives in one place. */
export const sideState = (n: BracketNode, i: number): "win" | "out" | "live" =>
  n.live ? "live" : n.winner === i ? "win" : "out";

/**
 * The whole thing, from the two values the page already holds.
 * Returns null when the event hasn't cut — that drives the empty state.
 */
export function buildBracket(
  players: Player[] | null,
  swissRounds: number | null,
  /** Gates the projection: an event that's over has no rounds still to come,
   *  and drawing one would invent a match that will never be played. */
  ended = false,
): Bracket | null {
  if (!players?.length) return null;

  const { rounds: cut, detected } = cutRounds(players, swissRounds);
  if (detected === "none" || !cut.length) return null;

  const byName = indexByName(players);
  const sizes = roundSizes(players);

  /** Swiss-only record, so the seeding behind the bracket stays readable
   *  once cut wins start landing in `record`. */
  const swissRecord = (p: Player | null): Record3 | null => {
    if (!p || swissRounds === null) return null;
    const rec = { wins: 0, losses: 0, ties: 0 };
    for (const m of p.matches) {
      if (m.round > swissRounds) continue;
      if (m.result === "W") rec.wins++;
      else if (m.result === "L") rec.losses++;
      else if (m.result === "T") rec.ties++;
    }
    return rec;
  };

  const side = (
    p: Player | null,
    name: string,
    result: MatchResult | null,
  ): BracketSide => ({
    name,
    display: p?.display ?? name.replace(COUNTRY, ""),
    country: p?.country ?? name.match(COUNTRY)?.[1]?.toUpperCase() ?? null,
    placing: p?.placing ?? null,
    record: p ? { wins: p.wins, losses: p.losses, ties: p.ties } : null,
    swiss: swissRecord(p),
    result,
    player: p,
    tbd: false,
  });

  /* 1. Build the nodes, one pass per cut round. Pairing is by opponent
   *    name, not by table: every bye carries table 0, so grouping on the
   *    table number would fuse all of a round's byes into one node. */
  const byRound = new Map<number, BracketNode[]>();

  cut.forEach((round, depth) => {
    const used = new Set<string>();
    const nodes: BracketNode[] = [];

    for (const p of players) {
      if (used.has(p.name)) continue;
      const m = p.matches.find((x) => x.round === round);
      if (!m) continue;

      if (m.opponent === null) {
        used.add(p.name);
        nodes.push(
          makeNode(round, depth, "bye", [side(p, p.name, "W")], 0),
        );
        continue;
      }

      // Their half of this match was already emitted from the other side.
      if (used.has(m.opponent)) continue;

      used.add(p.name);
      used.add(m.opponent);
      const opp = byName.get(m.opponent) ?? null;
      nodes.push(
        makeNode(round, depth, "match", [
          side(p, p.name, m.result),
          side(opp, m.opponent, flip(m.result)),
        ], m.table),
      );
    }

    nodes.sort((a, b) => orderKey(a) - orderKey(b) || a.id.localeCompare(b.id));
    byRound.set(round, nodes);
  });

  /* 2. Link each round back to the one before it, by name. */
  let links = 0;
  for (let depth = 1; depth < cut.length; depth++) {
    const prev = new Map<string, BracketNode>();
    for (const n of byRound.get(cut[depth - 1]) ?? []) {
      for (const s of n.sides) prev.set(s.name, n);
    }
    for (const n of byRound.get(cut[depth]) ?? []) {
      n.from = n.sides.map((s) => {
        const child = prev.get(s.name) ?? null;
        if (child) {
          child.hasParent = true;
          links++;
        }
        return child;
      });
    }
  }

  const linked = cut.length < 2 || links > 0;

  /* 2b. The rounds that must happen but aren't in the feed yet.
   *
   * pokedata writes a round only once its pairings exist, so between the
   * semis finishing and the final being called there is simply no round 15
   * to read. What's left is not in doubt — every remaining round halves the
   * field — so it's drawn as empty cards rather than left as a gap the
   * reader has to hold in their head.
   *
   * Two cards pair into the one above them in table order, which is how a
   * bracket is laid out and what this event's own played rounds did (tables
   * 110 and 111 fed 110; 112 and 113 fed 111). But a *name* only ever goes
   * into a projected card when that pairing is forced — a round with one
   * card left, where the two remaining winners have nowhere else to be.
   * Earlier rounds stay blank even where the winner is known: the shape is
   * certain, the seeding that pairs them isn't, and a confidently wrong
   * finalist is a worse answer than an empty seat.
   */
  const blank = (key: string): BracketSide => ({
    name: key,
    display: "TBD",
    country: null,
    placing: null,
    record: null,
    swiss: null,
    result: null,
    player: null,
    tbd: true,
  });

  const advancer = (child: BracketNode, forced: boolean, key: string) => {
    const won = forced && child.winner !== null ? child.sides[child.winner] : null;
    // `result` is the outcome of *this* card, and this card hasn't happened.
    return won ? { ...won, result: null } : blank(key);
  };

  const ahead: number[] = [];
  if (linked && !ended) {
    let kids = byRound.get(cut[cut.length - 1]) ?? [];
    let round = cut[cut.length - 1];
    let depth = cut.length - 1;

    // A power of two is the guard against projecting off the back of a
    // half-written round: 3 cards can't halve, and 8 is a real Top 8 rather
    // than a round the feed is still filling in.
    //
    // Byes stop it dead. They carry table 0, so they sort to the end of their
    // round rather than into the bracket position they actually hold, and
    // pairing off that order would wire the tree somewhere the feed never
    // said. A round of real tables is the only one whose order means
    // anything — which in practice means the play-in never projects, and
    // everything above it does.
    while (
      kids.length >= 2 &&
      isPow2(kids.length) &&
      kids.every((k) => k.kind === "match") &&
      ahead.length < 5
    ) {
      round += 1;
      depth += 1;
      const forced = kids.length === 2;
      const nodes: BracketNode[] = [];

      for (let i = 0; i + 1 < kids.length; i += 2) {
        const from = [kids[i], kids[i + 1]];
        const node = makeGhost(
          round,
          depth,
          i / 2,
          from,
          from.map((c, j) => advancer(c, forced, `p${round}:${i / 2}:${j}`)),
        );
        for (const c of from) {
          c.hasParent = true;
          c.parentProjected = true;
        }
        nodes.push(node);
      }

      byRound.set(round, nodes);
      ahead.push(round);
      kids = nodes;
    }
  }

  const shape = [...cut, ...ahead];
  const all = shape.flatMap((r) => byRound.get(r) ?? []);

  /* 3. Lay out. Right-to-left depth-first: leaves take the next free slot,
   *    a parent takes the mean of its children's. Sorting `sides` in
   *    lockstep with `from` is what guarantees side *i* is always the
   *    winner of the card wired to position *i* — i.e. no crossed wires. */
  let cursor = 0;

  const visit = (n: BracketNode) => {
    const kids = n.from.filter((c): c is BracketNode => c !== null);
    if (!kids.length) {
      n.slot = cursor++;
      return;
    }

    const order = n.sides
      .map((_, i) => i)
      .sort((a, b) => orderKey(n.from[a]) - orderKey(n.from[b]));
    n.sides = order.map((i) => n.sides[i]);
    n.from = order.map((i) => n.from[i]);
    // `winner` is an index into `sides`, so it has to move with them.
    const w = n.sides.findIndex((s) => s.result === "W");
    n.winner = w === -1 ? null : w;

    for (const c of n.from) if (c) visit(c);

    const slots = n.from
      .filter((c): c is BracketNode => c !== null)
      .map((c) => c.slot);
    // Snap to a half-slot so `slot * 2` is always a whole grid row.
    n.slot = Math.round((slots.reduce((a, b) => a + b, 0) / slots.length) * 2) / 2;
  };

  if (linked) {
    // Roots first, latest round outward, so the final anchors the picture —
    // the projected final included, since it is the root once one exists.
    for (let depth = shape.length - 1; depth >= 0; depth--) {
      for (const n of byRound.get(shape[depth]) ?? []) {
        if (!n.hasParent) visit(n);
      }
    }
    for (const n of all) {
      for (const c of n.from) if (c) c.dy = n.slot - c.slot;
    }
  } else {
    // Couldn't build a tree. Plain columns, no wires, nothing implied.
    for (const r of cut) {
      (byRound.get(r) ?? []).forEach((n, i) => {
        n.slot = i;
        n.from = n.sides.map(() => null);
        n.hasParent = false;
        n.dy = null;
      });
    }
    cursor = Math.max(...cut.map((r) => (byRound.get(r) ?? []).length), 0);
  }

  // A projected round has no rows in the feed to count, so its field is its
  // own card count doubled — two seats per card, filled or not.
  const sizeAt = shape.map((round, depth) =>
    depth < cut.length
      ? (sizes.get(round) ?? 0)
      : (byRound.get(round) ?? []).length * 2,
  );

  return {
    rounds: shape.map((round, depth) => ({
      round,
      depth,
      size: sizeAt[depth],
      label: roundLabel(sizeAt[depth], depth === 0, sizeAt[depth + 1] ?? null),
      projected: depth >= cut.length,
      nodes: byRound.get(round) ?? [],
    })),
    slots: cursor,
    detected,
    swissRounds,
    linked,
    liveCount: all.filter((n) => n.live).length,
    projectedRounds: ahead.length,
  };
}

function makeNode(
  round: number,
  depth: number,
  kind: "match" | "bye",
  sides: BracketSide[],
  table: number,
): BracketNode {
  const winner = sides.findIndex((s) => s.result === "W");
  return {
    id: `${round}:${sides.map((s) => s.name).sort().join("|")}`,
    round,
    depth,
    kind,
    sides,
    table,
    winner: winner === -1 ? null : winner,
    live: kind === "match" && sides.every((s) => s.result === null),
    projected: false,
    parentProjected: false,
    from: sides.map(() => null),
    slot: 0,
    hasParent: false,
    dy: null,
  };
}

/**
 * A card for a match the feed hasn't paired yet.
 *
 * Not `makeNode` with a flag: a ghost is the one node whose sides are all
 * result-less and which is nonetheless *not* live, and whose id has to be
 * structural rather than name-based — its names change from TBD to a player
 * as the round below resolves, and an id that churned with them would
 * remount the card underneath the reader on every poll.
 */
function makeGhost(
  round: number,
  depth: number,
  index: number,
  from: BracketNode[],
  sides: BracketSide[],
): BracketNode {
  return {
    id: `p${round}:${index}`,
    round,
    depth,
    kind: "match",
    sides,
    table: 0,
    winner: null,
    live: false,
    projected: true,
    parentProjected: false,
    from,
    slot: 0,
    hasParent: false,
    dy: null,
  };
}
