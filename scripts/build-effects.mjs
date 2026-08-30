/**
 * Builds data/effects.json — what a move, item or ability actually does.
 *
 * The popovers on the team cards and the usage panel read from this. It is a
 * build step for the same reason data/pokedex.json is: a 400-player event is
 * ~2,400 team slots and ~12,000 move mentions, and resolving those live would
 * be thousands of requests per page load.
 *
 *   npm run build:effects
 *
 * Unlike build-pokedex.mjs this reads the GitHub mirror FIRST and only falls
 * back to pokeapi.co. That script makes 18 requests and can politely point them
 * at the API; this one walks every move, item and ability one file at a time —
 * about 3,500 requests. That belongs on a CDN of static files, not on PokéAPI's
 * own boxes.
 *
 * Two holes in the upstream data, both of which this works around:
 *
 *  - No move released in gen 9 has an `effect_entries` record. Not one. So
 *    moves take their prose from the latest English *flavour* text instead —
 *    the line the games themselves print — which is complete, and reads in one
 *    consistent voice rather than switching registers halfway down a movepool.
 *  - Gen-9 items have neither effect nor flavour text: Covert Cloak, Booster
 *    Energy, Loaded Dice, Clear Amulet and friends come back empty. Those are
 *    exactly the items a VGC team is built on, so data/effects-extra.json
 *    supplies them by hand and is merged in below. That file should shrink as
 *    PokéAPI catches up — this script prints what is still missing from the
 *    held-item categories so it's obvious when an entry can be deleted.
 *
 * Re-run when a new generation lands. The committed file is fine until then.
 */
import { writeFile, readFile, mkdir } from "node:fs/promises";

// PokéAPI publishes its whole dataset as static JSON on GitHub. Same shape as
// the API, served from a CDN, which is what makes 3,500 requests reasonable.
const MIRROR =
  "https://raw.githubusercontent.com/PokeAPI/api-data/master/data/api/v2";
const API = "https://pokeapi.co/api/v2";

/** How many detail files to have in flight at once. */
const CONCURRENCY = 12;

let useApi = false;

async function get(path) {
  if (!useApi) {
    try {
      const res = await fetch(`${MIRROR}/${path}/index.json`);
      if (res.ok) return res.json();
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      console.warn(
        `  mirror unreachable (${err.message}) — falling back to pokeapi.co`,
      );
      useApi = true;
    }
  }
  const res = await fetch(`${API}/${path}`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

const idFromUrl = (url) => Number(url.replace(/\/$/, "").split("/").pop());

/** Run `fn` over every item with a fixed number in flight. */
async function pool(items, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker),
  );
  return out;
}

/** Upstream wraps prose at the width of a GBA text box. Undo that. */
const unwrap = (s) =>
  s
    ?.replace(/[\n\f\r]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/­/g, "")
    .trim() || null;

/** PokéAPI templates the odds into effect prose: "$effect_chance% chance". */
const fillChance = (s, chance) =>
  s && chance != null ? s.replace(/\$effect_chance/g, String(chance)) : s;

const englishEffect = (entries, chance) => {
  const en = entries?.find((e) => e.language?.name === "en");
  // `short_effect` is a sentence; `effect` is several paragraphs of wiki.
  return unwrap(fillChance(en?.short_effect ?? null, chance));
};

/**
 * The newest English flavour text. The array runs oldest-first, and the wording
 * gets revised between games, so the last entry is the current one.
 */
const englishFlavour = (entries, key) => {
  const en = (entries ?? []).filter((e) => e.language?.name === "en");
  return unwrap(en[en.length - 1]?.[key] ?? null);
};

async function index(resource) {
  const json = await get(resource);
  return json.results.map((r) => ({ name: r.name, id: idFromUrl(r.url) }));
}

function progress(label, done, total) {
  process.stdout.write(`\r  ${label.padEnd(10)} ${done}/${total}`);
}

async function buildMoves() {
  const list = await index("move");
  let done = 0;
  const out = {};

  await pool(list, async ({ name, id }) => {
    const m = await get(`move/${id}`);
    // Flavour first: it is the only text that covers gen 9, and mixing the two
    // sources would mean half the movepool reads as a rules citation and half
    // as a game description.
    const text =
      englishFlavour(m.flavor_text_entries, "flavor_text") ??
      englishEffect(m.effect_entries, m.effect_chance);

    out[name] = {
      type: m.type?.name ?? null,
      class: m.damage_class?.name ?? null,
      // Status moves report 0 power upstream in some rows and null in others.
      power: m.power || null,
      // null accuracy means "cannot miss", which the UI prints as "—".
      acc: m.accuracy ?? null,
      pp: m.pp ?? null,
      pri: m.priority ?? 0,
      text,
    };
    progress("moves", ++done, list.length);
  });

  process.stdout.write("\n");
  return out;
}

async function buildAbilities() {
  const list = await index("ability");
  let done = 0;
  const out = {};

  await pool(list, async ({ name, id }) => {
    const a = await get(`ability/${id}`);
    // Abilities are the one resource PokéAPI has kept current, so the
    // mechanical sentence is available throughout and is the better read.
    const text =
      englishEffect(a.effect_entries, null) ??
      englishFlavour(a.flavor_text_entries, "flavor_text");
    if (text) out[name] = { text };
    progress("abilities", ++done, list.length);
  });

  process.stdout.write("\n");
  return out;
}

/**
 * Categories whose members can be brought to a table, and so are worth
 * reporting on when they come back wordless. Deliberately excludes
 * `all-machines`: 200 TMs with no text is a true statement about the dataset
 * and a useless thing to print under a list of gaps to go and fix.
 */
const HELD = new Set([
  "held-items", "choice", "bad-held-items", "training", "plates",
  "species-specific", "type-enhancement", "effort-training", "jewels",
  "mega-stones", "memories", "z-crystals", "in-a-pinch", "picky-healing",
  "type-protection", "baking-only", "spelunking", "scarves",
]);

async function buildItems() {
  const list = await index("item");
  let done = 0;
  const out = {};
  /** Held items upstream knows the name of but has no words for. */
  const blank = [];

  await pool(list, async ({ name, id }) => {
    const it = await get(`item/${id}`);
    const text =
      englishEffect(it.effect_entries, null) ??
      englishFlavour(it.flavor_text_entries, "text");

    if (text) out[name] = { text };
    else if (HELD.has(it.category?.name)) blank.push(name);

    progress("items", ++done, list.length);
  });

  process.stdout.write("\n");
  return { items: out, blank: blank.sort() };
}

async function main() {
  const [moves, abilities, itemsResult] = [
    await buildMoves(),
    await buildAbilities(),
    await buildItems(),
  ];
  const { items, blank } = itemsResult;

  // The hand-written overlay goes on last so it wins. It exists to fill gaps,
  // but if PokéAPI later publishes a better line for the same item, delete the
  // override rather than leaving two sources of truth in disagreement.
  let extra = { moves: {}, items: {}, abilities: {} };
  try {
    extra = JSON.parse(await readFile("data/effects-extra.json", "utf8"));
  } catch {
    console.warn("  no data/effects-extra.json — building without the overlay");
  }

  const merge = (base, over = {}) => {
    for (const [k, v] of Object.entries(over)) base[k] = { ...base[k], ...v };
    return base;
  };

  const dex = {
    moves: merge(moves, extra.moves),
    items: merge(items, extra.items),
    abilities: merge(abilities, extra.abilities),
  };

  // Upstream opens 279 of these with "Held:". It's addressed to a reader
  // browsing a bag, telling them which of an item's several behaviours this
  // sentence is about — but the only place this text is ever shown is under
  // the name of an item already in a Pokémon's hand, where it's a word of
  // preamble on every single line saying what the page has already said.
  for (const entry of Object.values(dex.items)) {
    if (!entry.text) continue;
    entry.text = entry.text
      .replace(/^Held:\s*/, "")
      .replace(/^./, (c) => c.toUpperCase());
  }

  // Sorted so a rebuild that changes nothing produces an identical file and
  // shows up as no diff at all.
  for (const kind of Object.keys(dex)) {
    dex[kind] = Object.fromEntries(
      Object.entries(dex[kind]).sort(([a], [b]) => a.localeCompare(b)),
    );
  }

  await mkdir("data", { recursive: true });
  await writeFile("data/effects.json", JSON.stringify(dex), "utf8");

  // Just the typing, split out into its own file. The team cards colour every
  // move by its type, which means they need this on first paint for all four
  // slots at once — effects.json is 400KB and stays behind /api/effect, but
  // 900 names and a type is ~20KB and rides in the bundle beside pokedex.json
  // rather than costing four round trips per Pokémon.
  const types = Object.fromEntries(
    Object.entries(dex.moves)
      .filter(([, m]) => m.type)
      .map(([slug, m]) => [slug, m.type]),
  );
  await writeFile("data/move-types.json", JSON.stringify(types), "utf8");

  console.log(
    `\nmoves ${Object.keys(dex.moves).length} · ` +
      `items ${Object.keys(dex.items).length} · ` +
      `abilities ${Object.keys(dex.abilities).length} ` +
      `written to data/effects.json\n` +
      `${Object.keys(types).length} move types written to data/move-types.json`,
  );

  // Asked of the overlay, not of the merged result: an entry the overlay
  // supplies for something upstream also covers isn't filling a gap, it's
  // quietly overriding PokéAPI, and that should show up as unaccounted for
  // rather than counted as a win.
  const covered = blank.filter((n) => extra.items?.[n]);
  const still = blank.filter((n) => !dex.items[n]);
  if (covered.length) {
    console.log(
      `\n${covered.length} held item(s) filled in by data/effects-extra.json.`,
    );
  }
  if (still.length) {
    console.log(
      `\n${still.length} held item(s) have no text anywhere — the popover ` +
        `won't open on these. Add them to data/effects-extra.json if they ` +
        `matter:\n  ${still.join(", ")}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
