/**
 * Builds data/pokedex.json — every Pokémon variety with its id and typing,
 * plus the ability of each Mega form.
 *
 * Why a build step instead of calling PokéAPI at runtime: a 400-player event
 * is ~2,400 team slots. Resolving each one live would be thousands of requests
 * per page load. PokéAPI's data is a static mirror on GitHub, so we pull it
 * once (18 type requests, then one per Mega form) and ship the result.
 *
 *   npm run build:dex
 *
 * Re-run it when a new generation lands. The committed file is fine until then.
 */
import { writeFile, mkdir } from "node:fs/promises";

// PokéAPI proper. Open to everyone, no key, generous rate limits.
const API = "https://pokeapi.co/api/v2";

// PokéAPI also publishes its entire dataset as static JSON on GitHub. Identical
// shape, different host — useful if pokeapi.co is unreachable from wherever this
// runs (a locked-down CI box, a corporate network, a sandbox with an allowlist).
const MIRROR =
  "https://raw.githubusercontent.com/PokeAPI/api-data/master/data/api/v2";

let useMirror = false;

/**
 * Try PokéAPI; on the first failure, switch to the mirror for the whole run.
 * Both hosts are addressed by numeric id, which the mirror always files under
 * even where it doesn't carry a directory for the name.
 */
async function get(path) {
  if (!useMirror) {
    try {
      const res = await fetch(`${API}/${path}`);
      if (res.ok) return res.json();
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      console.warn(
        `  pokeapi.co unreachable (${err.message}) — falling back to the GitHub mirror`,
      );
      useMirror = true;
    }
  }
  const res = await fetch(`${MIRROR}/${path}/index.json`);
  if (!res.ok) throw new Error(`${path}: mirror HTTP ${res.status}`);
  return res.json();
}

const TYPE_IDS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18,
];

const idFromUrl = (url) => Number(url.replace(/\/$/, "").split("/").pop());

/** "charizard-mega-y", "mewtwo-mega-x", "venusaur-mega". */
const MEGA = /-mega(-[xy])?$/;

/**
 * The ability each Mega form has once it's on the field.
 *
 * It isn't in the type payload, and it isn't reliably in the tournament data
 * either: a team sheet lists the ability of the Pokémon *before* it Mega
 * Evolves, so the field tells you Blaze where the answer is Drought. There are
 * fewer than a hundred Mega forms, so this is a cheap second pass rather than
 * a walk over all 1,300-odd varieties.
 *
 * Every Mega has exactly one ability and it is never hidden, so there is
 * nothing to choose between — but read the slot rather than assuming, and skip
 * anything that somehow arrives without one.
 */
async function addMegaAbilities(dex) {
  const slugs = Object.keys(dex).filter((s) => MEGA.test(s));
  let done = 0;

  for (const slug of slugs) {
    const json = await get(`pokemon/${dex[slug].id}`);
    const first = json.abilities?.find((a) => !a.is_hidden) ?? json.abilities?.[0];
    if (first) dex[slug].ability = first.ability.name;
    process.stdout.write(`\r  mega abilities ${++done}/${slugs.length}`);
  }

  process.stdout.write("\n");
  return slugs.length;
}

async function main() {
  /** slug -> { id, types: [slot-ordered type names], ability? } */
  const dex = {};

  for (const t of TYPE_IDS) {
    const json = await get(`type/${t}`);
    const typeName = json.name;

    for (const entry of json.pokemon) {
      const slug = entry.pokemon.name;
      const id = idFromUrl(entry.pokemon.url);
      const row = (dex[slug] ??= { id, types: [] });
      row.types[entry.slot - 1] = typeName;
    }
    process.stdout.write(`  ${typeName.padEnd(9)} ${json.pokemon.length}\n`);
  }

  // slot arrays can be sparse if a variety only has a slot-2 entry; compact them
  for (const row of Object.values(dex)) row.types = row.types.filter(Boolean);

  const megas = await addMegaAbilities(dex);

  const sorted = Object.fromEntries(
    Object.entries(dex).sort(([a], [b]) => a.localeCompare(b)),
  );

  await mkdir("data", { recursive: true });
  await writeFile("data/pokedex.json", JSON.stringify(sorted), "utf8");

  const dual = Object.values(sorted).filter((r) => r.types.length === 2).length;
  const named = Object.values(sorted).filter((r) => r.ability).length;
  console.log(
    `\n${Object.keys(sorted).length} varieties written to data/pokedex.json ` +
      `(${dual} dual-typed, ${named}/${megas} Mega abilities)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
