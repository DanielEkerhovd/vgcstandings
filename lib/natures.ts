/* ------------------------------------------------------------------ *
 * Natures. Pokédata sends only the name ("Adamant"), which tells you
 * nothing unless you already know the table — so keep the table here
 * and let the UI render what the name actually does.
 *
 * Twenty natures raise one stat 10% and cut another 10%. The other five
 * cancel out. HP is never touched by any of them.
 * ------------------------------------------------------------------ */

/** Short label for the row, full name for the tooltip. */
const STAT = {
  atk: { short: "Atk", long: "Attack" },
  def: { short: "Def", long: "Defense" },
  spa: { short: "SpA", long: "Sp. Atk" },
  spd: { short: "SpD", long: "Sp. Def" },
  spe: { short: "Spe", long: "Speed" },
} as const;

type StatKey = keyof typeof STAT;
export type Stat = (typeof STAT)[StatKey];

export interface NatureShift {
  up: Stat;
  down: Stat;
}

/** Keyed lowercase — the upstream capitalises, but nothing guarantees it. */
const SHIFTS: Record<string, [StatKey, StatKey]> = {
  lonely: ["atk", "def"],
  brave: ["atk", "spe"],
  adamant: ["atk", "spa"],
  naughty: ["atk", "spd"],

  bold: ["def", "atk"],
  relaxed: ["def", "spe"],
  impish: ["def", "spa"],
  lax: ["def", "spd"],

  modest: ["spa", "atk"],
  mild: ["spa", "def"],
  quiet: ["spa", "spe"],
  rash: ["spa", "spd"],

  calm: ["spd", "atk"],
  gentle: ["spd", "def"],
  sassy: ["spd", "spe"],
  careful: ["spd", "spa"],

  timid: ["spe", "atk"],
  hasty: ["spe", "def"],
  jolly: ["spe", "spa"],
  naive: ["spe", "spd"],
};

/** The five that raise and cut the same stat, so nothing moves. */
const NEUTRAL = new Set([
  "hardy",
  "docile",
  "serious",
  "bashful",
  "quirky",
]);

/**
 * What a nature does, ready to render.
 *
 * `"neutral"` is a real answer — those five natures exist and saying so is
 * better than a blank. `null` means the name isn't one of the 25 at all,
 * which the feed shouldn't produce but has no obligation not to.
 */
export function natureShift(nature: string): NatureShift | "neutral" | null {
  const key = nature.trim().toLowerCase();
  if (NEUTRAL.has(key)) return "neutral";

  const shift = SHIFTS[key];
  if (!shift) return null;

  const [up, down] = shift;
  return { up: STAT[up], down: STAT[down] };
}
