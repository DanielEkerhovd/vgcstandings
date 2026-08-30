import pokedex from "@/data/pokedex.json";
import champions from "@/data/champions.json";
import items from "@/data/items.json";
import moveTypes from "@/data/move-types.json";

export type PokemonType =
  | "normal" | "fire" | "water" | "electric" | "grass" | "ice"
  | "fighting" | "poison" | "ground" | "flying" | "psychic" | "bug"
  | "rock" | "ghost" | "dragon" | "dark" | "steel" | "fairy";

/** `ability` is written for Mega forms only — see scripts/build-pokedex.mjs. */
interface DexEntry { id: number; types: string[]; ability?: string }
const DEX = pokedex as Record<string, DexEntry>;
const CHAMPIONS = champions as Record<string, string>;
const ITEMS = items as Record<string, string>;
const MOVE_TYPES = moveTypes as Record<string, string>;

/** How many Pokémon Champions menu icons are installed. 0 = none downloaded. */
export const CHAMPIONS_COUNT = Object.keys(CHAMPIONS).length;
/** How many held-item bag sprites are installed. 0 = none downloaded. */
export const ITEMS_COUNT = Object.keys(ITEMS).length;

export interface Resolved {
  /** PokéAPI variety slug, e.g. "charizard-mega-y". Null if unmatched. */
  slug: string | null;
  /** PokéAPI id for the exact variety — use for sprites. */
  dexId: number | null;
  /** National dex number of the base species — used for Champions filenames. */
  speciesId: number | null;
  types: PokemonType[];
  /** True when a held Mega Stone resolved to a real Mega form. */
  isMega: boolean;
  /** Set when the item looks like a Mega Stone but PokéAPI has no such form. */
  megaUnknown: boolean;
  /**
   * The ability the Mega form has, title-cased the way pokedata writes ability
   * names. Null unless a Mega Stone resolved, and null too for the newest forms
   * PokéAPI has a typing for but no ability yet.
   */
  megaAbility: string | null;
  /** Path to a self-hosted Champions menu icon, if one was downloaded. */
  championsIcon: string | null;
}

/** PokéAPI slugs: lowercase, punctuation dropped, spaces to hyphens. */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.'’:,]/g, "")
    .replace(/♀/g, "-f")
    .replace(/♂/g, "-m")
    .trim()
    .replace(/\s+/g, "-");
}

export const itemSlug = (item: string): string => slugify(item);

/**
 * A move's typing, for the coloured pill it sits in on a team card.
 *
 * Deliberately not read from the effect popovers' data: that arrives one word
 * at a time on hover, and a card has four moves that all need a colour before
 * anyone points at anything. data/move-types.json is the same build's output,
 * cut down to the one field the layout needs — see scripts/build-effects.mjs.
 *
 * Null for a move upstream has never heard of, which the card draws neutral.
 * Also null in effect for the handful of Shadow moves, which carry a type no
 * icon or colour exists for; TypeIcon and typeColor both fall back on their
 * own, so this doesn't have to filter them out.
 */
export function moveType(move: string): string | null {
  return MOVE_TYPES[slugify(move)] ?? null;
}

/**
 * "tough-claws" -> "Tough Claws". The inverse of slugify() for the shapes
 * abilities actually take, which matters twice over: it matches how pokedata
 * spells the same names, and slugify() takes the result back to the key the
 * effect popovers look up.
 */
const titleCase = (slug: string) =>
  slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

/**
 * A self-hosted bag sprite for a held item, if `npm run fetch:items` has been
 * run. Null otherwise, which is what sends ItemArt on to PokéAPI — and PokéAPI
 * has no item art past generation 8, so without these most of a modern field's
 * items have no icon at all.
 */
export function itemIcon(item: string): string | null {
  const file = ITEMS[itemSlug(item)];
  return file ? `/items/${file}` : null;
}

const pad3 = (n: number) => String(n).padStart(3, "0");
const pad4 = (n: number) => String(n).padStart(4, "0");

/**
 * Pokédata writes forms in brackets — "Basculegion [Male]", "Floette [Eternal
 * Flower]" — while PokéAPI uses suffixed slugs, and the two don't always agree
 * ("Eternal Flower" is just "eternal" upstream). Try the full form, then
 * progressively shorter suffixes, then each token alone, then the bare species.
 */
function matchVariety(name: string): { slug: string | null; base: string } {
  const m = name.match(/^(.*?)\s*\[(.+)\]\s*$/);
  const base = slugify(m ? m[1] : name);
  const tokens = m ? slugify(m[2]).split("-").filter(Boolean) : [];

  const candidates: string[] = [];
  for (let take = tokens.length; take > 0; take--) {
    candidates.push([base, ...tokens.slice(0, take)].join("-"));
  }
  for (const t of tokens) candidates.push(`${base}-${t}`);
  candidates.push(base);

  for (const slug of candidates) if (DEX[slug]) return { slug, base };

  // Last resort: some species exist only as forms — PokéAPI has no bare
  // "aegislash", only "aegislash-shield" and "aegislash-blade". Take the
  // shortest variety that starts with the species name.
  const fallback = varietiesOf(base)[0];
  return { slug: fallback ?? null, base };
}

/** PokéAPI files alternate forms above 10000; real dex numbers stay below it. */
const isDefaultForm = (slug: string) => (DEX[slug]?.id ?? 1e9) < 10000;

let byBase: Map<string, string[]> | null = null;
function varietiesOf(base: string): string[] {
  if (!byBase) {
    byBase = new Map();
    for (const slug of Object.keys(DEX)) {
      const cut = slug.indexOf("-");
      if (cut < 0) continue;
      const stem = slug.slice(0, cut);
      const list = byBase.get(stem) ?? [];
      list.push(slug);
      byBase.set(stem, list);
    }
    // Default form first (it keeps the national-dex number; alternate forms are
    // filed above 10000), then shortest name.
    for (const list of byBase.values()) {
      list.sort(
        (a, b) =>
          Number(!isDefaultForm(a)) - Number(!isDefaultForm(b)) ||
          a.length - b.length,
      );
    }
  }
  return byBase.get(base) ?? [];
}

/**
 * Does this held item Mega-evolve this Pokémon?
 *
 * Name alone isn't enough — Eviolite ends in "ite" too. So we require both that
 * a Mega form actually exists for the species, and that the stone's name starts
 * with the species' own name ("Charizardite Y" -> charizard, "Blastoisinite" ->
 * blastois…). That rules out a Mega-capable Pokémon holding an unrelated item.
 */
function megaFor(base: string, item?: string): { slug: string | null; looksLikeStone: boolean } {
  if (!item) return { slug: null, looksLikeStone: false };

  const stone = itemSlug(item);
  const suffix = stone.match(/-([xy])$/)?.[1];
  const stem = base.slice(0, Math.min(5, base.length));
  const belongs = stone.startsWith(stem) && /ite(-[xy])?$/.test(stone);
  if (!belongs) return { slug: null, looksLikeStone: false };

  const tries = suffix
    ? [`${base}-mega-${suffix}`, `${base}-mega`]
    : [`${base}-mega`, `${base}-mega-x`, `${base}-mega-y`];

  for (const slug of tries) if (DEX[slug]) return { slug, looksLikeStone: true };
  return { slug: null, looksLikeStone: true };
}

/** Champions files are "Menu CP 006-Mega Y.png" -> key "006-mega-y". */
function championsIconFor(speciesId: number | null, slug: string | null, base: string) {
  if (speciesId === null) return null;

  // Bulbagarden pads dex numbers to four: "Menu CP 0006-Mega Y.png".
  // The others are tolerance in case that convention ever shifts.
  const dexes = [pad4(speciesId), pad3(speciesId), String(speciesId)];

  const remainder =
    slug && slug.startsWith(`${base}-`) ? slug.slice(base.length + 1) : "";
  const suffixes = [""];
  if (remainder) {
    const trimmed = remainder.split("-").slice(0, -1).join("-");
    suffixes.unshift(remainder, ...(trimmed ? [trimmed] : []));
  }

  for (const suffix of suffixes) {
    for (const dex of dexes) {
      const key = suffix ? `${dex}-${suffix}` : dex;
      if (CHAMPIONS[key]) return `/champions/${CHAMPIONS[key]}`;
    }
  }
  return null;
}

/**
 * The dex number the Champions icons are filed under.
 *
 * Usually just `DEX[base]`, but a few species have no bare entry upstream —
 * PokéAPI knows "basculegion-male" and "basculegion-female", never plain
 * "basculegion". Fall back to whichever variety carries the national-dex
 * number, so those still get an icon instead of silently dropping out.
 */
function speciesIdFor(base: string, matched: string | null): number | null {
  const direct = DEX[base]?.id;
  if (direct != null) return direct;

  const own = matched ? DEX[matched]?.id : undefined;
  if (own != null && own < 10000) return own;

  for (const slug of varietiesOf(base)) {
    const id = DEX[slug]?.id;
    if (id != null && id < 10000) return id;
  }
  return null;
}

const cache = new Map<string, Resolved>();

/**
 * Resolve one team slot. Pass the held item too — a Mega Stone changes the
 * sprite, the typing and the ability (Charizard + Charizardite X becomes
 * Fire/Dragon with Tough Claws; the Y stone makes the same Charizard
 * Fire/Flying with Drought).
 */
export function resolveMon(name: string, item?: string): Resolved {
  const cacheKey = `${name}||${item ?? ""}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  const { slug: baseVariety, base } = matchVariety(name);
  const speciesId = speciesIdFor(base, baseVariety);

  const mega = megaFor(base, item);
  const finalSlug = mega.slug ?? baseVariety;
  const entry = finalSlug ? DEX[finalSlug] : undefined;

  const out: Resolved = {
    slug: finalSlug,
    dexId: entry?.id ?? null,
    speciesId,
    types: (entry?.types ?? []) as PokemonType[],
    isMega: Boolean(mega.slug),
    megaUnknown: mega.looksLikeStone && !mega.slug,
    // Off the Mega row specifically: the base form's ability is whatever the
    // sheet says, and only the Mega's is a fact of the form.
    megaAbility: mega.slug ? (entry?.ability ? titleCase(entry.ability) : null) : null,
    championsIcon: championsIconFor(speciesId, finalSlug, base),
  };

  cache.set(cacheKey, out);
  return out;
}
