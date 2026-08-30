/* ------------------------------------------------------------------ *
 * Raw shapes, exactly as pokedata.ovh serves them.
 * Every "| string" and "| number" below is a real quirk, not caution.
 * ------------------------------------------------------------------ */

export type MatchResult = "W" | "L" | "T";

export interface RawRound {
  /** Opponent's display name. "" for a Swiss bye — but the literal string
   *  "BYE" for a top-cut bye. Both mean the same thing. */
  name: string;
  /** null while the table is still playing. */
  result: MatchResult | null;
  /** VGC sends a padded string " 129 ". TCG sends a number. */
  table: string | number;
}

export interface RawMon {
  /** Usually a string "445". Special forms arrive as numbers (670005). */
  id: string | number;
  name: string;
  ability: string;
  item: string;
  /** The nature, oddly named. */
  stat_alignment: string;
  /** The four moves. */
  badges: string[];
}

export interface RawPlayer {
  name: string;
  placing: number;
  record: { wins: number; losses: number; ties: number };
  resistances: { self: number; opp: number; oppopp: number };
  /** An array when the team list is public, the empty STRING when it isn't. */
  decklist: RawMon[] | "";
  /** -1 = still in; otherwise the round after which they dropped. */
  drop: number;
  /** VGC only, and the key really does contain a space. */
  "Trainer name"?: string;
  /** Keys are round numbers as strings, and sparse if the player dropped. */
  rounds: Record<string, RawRound>;
}

/* ------------------------------------------------------------------ *
 * Normalised shapes — what the UI actually wants to work with.
 * ------------------------------------------------------------------ */

export interface Match {
  round: number;
  opponent: string | null; // null = bye
  result: MatchResult | null; // null = still playing
  table: number; // 0 = bye
}

export interface Mon {
  id: string;
  name: string;
  ability: string;
  item: string;
  nature: string;
  moves: string[];
}

export interface Player {
  name: string; // full string, still the join key
  display: string; // without the [CC] suffix
  country: string | null;
  trainerName: string | null;
  placing: number;
  wins: number;
  losses: number;
  ties: number;
  points: number;
  oppWinPct: number;
  oppOppWinPct: number;
  team: Mon[];
  hasTeam: boolean; // false = list not public, which is NOT "empty team"
  droppedAfter: number | null;
  matches: Match[];
}

const COUNTRY = /\s*\[([A-Za-z]{2,3})\]\s*$/;

export function normalize(raw: RawPlayer[]): Player[] {
  return raw.map((p) => {
    const country = p.name.match(COUNTRY)?.[1] ?? null;
    const hasTeam = Array.isArray(p.decklist);

    const matches: Match[] = Object.entries(p.rounds ?? {})
      .map(([round, r]) => {
        const opp = r.name?.trim() ?? "";
        return {
          round: Number(round),
          // Swiss byes arrive as "", cut byes as the literal "BYE".
          opponent: opp && opp.toUpperCase() !== "BYE" ? opp : null,
          // null while the table is still out. Anything unexpected is also
          // "not known yet" rather than a value the UI has to guess at.
          result:
            r.result === "W" || r.result === "L" || r.result === "T"
              ? r.result
              : null,
          table: Number(String(r.table).trim()) || 0,
        };
      })
      .sort((a, b) => a.round - b.round);

    const team: Mon[] = hasTeam
      ? (p.decklist as RawMon[]).map((m) => ({
          id: String(m.id), // ids mix string and number — pin it to string
          name: m.name,
          ability: m.ability,
          item: m.item,
          nature: m.stat_alignment,
          moves: m.badges ?? [],
        }))
      : [];

    return {
      name: p.name,
      display: p.name.replace(COUNTRY, ""),
      country: country ? country.toUpperCase() : null,
      trainerName: p["Trainer name"]?.trim() || null,
      placing: p.placing,
      wins: p.record.wins,
      losses: p.record.losses,
      ties: p.record.ties,
      points: p.record.wins * 3 + p.record.ties, // not in the JSON — derived
      oppWinPct: p.resistances.opp * 100,
      oppOppWinPct: p.resistances.oppopp * 100,
      team,
      hasTeam,
      droppedAfter: p.drop === -1 ? null : p.drop,
      matches,
    };
  });
}

/** Names are the only key the data gives you, so index on them once. */
export const indexByName = (players: Player[]) =>
  new Map(players.map((p) => [p.name, p]));

/** Species usage across the field, most-played first. */
export function usage(players: Player[]) {
  const counts = new Map<string, { id: string; name: string; count: number }>();
  for (const p of players) {
    for (const m of p.team) {
      const row = counts.get(m.name) ?? { id: m.id, name: m.name, count: 0 };
      row.count += 1;
      counts.set(m.name, row);
    }
  }
  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
  );
}

export interface Tally {
  name: string;
  count: number;
}

export interface MonDetail {
  /** Players running this species — the denominator for every percentage. */
  users: number;
  items: Tally[];
  moves: Tally[];
  abilities: Tally[];
  /** Of those users, how many held its Mega Stone. 0 = never Mega'd here. */
  megaUsers: number;
  /**
   * The abilities of the Mega forms the field actually used — a fact of the
   * form, not of the sheet. It's a list rather than one entry because a species
   * can have two stones: Charizardite X is Tough Claws, Y is Drought.
   */
  megaAbilities: Tally[];
  natures: Tally[];
  teammates: Tally[];
}

/**
 * What lib/dex.ts makes of a slot that Mega Evolved. Null from the callback
 * means the slot didn't Mega Evolve at all.
 */
export interface MegaSlot {
  /** The form's ability. Null for a stone PokéAPI has published no form for. */
  ability: string | null;
}

/** Same tiebreak as usage(), so every list in the app orders alike. */
const byCount = (t: Map<string, number>): Tally[] =>
  [...t.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

/**
 * Everything the field runs on one species: held items, moves, abilities,
 * natures and the Pokémon it's brought alongside.
 *
 * One pass over the whole field, so it's called on expand rather than folded
 * for every species up front. Percentages are all a share of `users` — "88%"
 * means 88% of this species' users, not 88% of the tournament. The one
 * exception is `megaAbilities`, which is a share of `megaUsers`.
 *
 * `mega` is passed in rather than imported because the Mega Stone test lives in
 * lib/dex.ts, and that pulls data/pokedex.json in behind it. This module is
 * also imported by the API routes, which have no use for either.
 */
export function monDetail(
  players: Player[],
  name: string,
  mega?: (mon: Mon) => MegaSlot | null,
): MonDetail {
  const items = new Map<string, number>();
  const moves = new Map<string, number>();
  const abilities = new Map<string, number>();
  const megaAbilities = new Map<string, number>();
  const natures = new Map<string, number>();
  const teammates = new Map<string, number>();
  let users = 0;
  let megaUsers = 0;

  // An unrevealed list is not a zero, so those players sit out entirely.
  const bump = (t: Map<string, number>, key: string) => {
    const k = key?.trim();
    if (k) t.set(k, (t.get(k) ?? 0) + 1);
  };

  for (const p of players) {
    if (!p.hasTeam) continue;
    // Species clause — a team carries this name at most once.
    const mon = p.team.find((m) => m.name === name);
    if (!mon) continue;

    users += 1;
    bump(items, mon.item);
    bump(abilities, mon.ability);
    bump(natures, mon.nature);
    const megaSlot = mega?.(mon);
    if (megaSlot) {
      megaUsers += 1;
      // mon.ability is deliberately not a fallback: a sheet lists the ability
      // the Pokémon has *before* it Mega Evolves, so falling back would file
      // Blaze under Mega Abilities, which is the one thing it isn't.
      if (megaSlot.ability) bump(megaAbilities, megaSlot.ability);
    }
    for (const mv of mon.moves) bump(moves, mv);
    for (const other of p.team) {
      if (other.name !== name) bump(teammates, other.name);
    }
  }

  return {
    users,
    items: byCount(items),
    moves: byCount(moves),
    abilities: byCount(abilities),
    megaUsers,
    megaAbilities: byCount(megaAbilities),
    natures: byCount(natures),
    teammates: byCount(teammates),
  };
}

/* ------------------------------------------------------------------ *
 * The event catalogue. Only available by scraping their index page —
 * there is no JSON for it.
 * ------------------------------------------------------------------ */

export interface EventSummary {
  tid: string;
  name: string;
  dates: string;
}

const EVENT_RE = /location\.href='(\d{7})\/'[^>]*>([\s\S]*?)<\/button>/g;

export const UA = "pokedata-demo/0.1 (learning project; swap in your contact)";

/** Fallback so the demo still runs when the index can't be reached. */
export const FALLBACK_EVENTS: EventSummary[] = [
  { tid: "0000191", name: "2026 Pokémon VGC World Championship", dates: "August 28-30, 2026" },
  { tid: "0000190", name: "2026 North America Pokémon VGC International Championships", dates: "June 12-14, 2026" },
  { tid: "0000189", name: "2026 Turin Pokémon VGC Cup", dates: "June 6-7, 2026" },
];

export async function listEvents(): Promise<EventSummary[]> {
  try {
    const res = await fetch("https://www.pokedata.ovh/standingsVGC/", {
      headers: { "user-agent": UA },
      next: { revalidate: 3600 }, // the catalogue changes a few times a month
    });
    if (!res.ok) return FALLBACK_EVENTS;

    const html = await res.text();
    const events = [...html.matchAll(EVENT_RE)].map(([, tid, label]) => {
      const text = label.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      const cut = text.lastIndexOf(" - "); // several event names contain hyphens
      return {
        tid,
        name: cut > 0 ? text.slice(0, cut) : text,
        dates: cut > 0 ? text.slice(cut + 3) : "",
      };
    });
    return events.length ? events : FALLBACK_EVENTS;
  } catch {
    return FALLBACK_EVENTS;
  }
}
