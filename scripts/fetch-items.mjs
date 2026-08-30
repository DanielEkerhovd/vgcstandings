/**
 * Downloads held-item bag sprites from Bulbagarden Archives into public/items/,
 * and writes data/items.json mapping each item's slug to its filename.
 *
 *   npm run fetch:items
 *
 * ── Please read before running ──────────────────────────────────────────────
 * Same terms as fetch:champions, and for the same reason — these are Nintendo /
 * Creatures / GAME FREAK assets that Bulbagarden hosts as a fan resource, filed
 * under the same "Game sprites fair use images" category the Champions menu
 * sprites are.
 *
 *   • Non-commercial use only, and you must credit Bulbagarden Archives.
 *   • Don't hotlink their servers from your app — they're donation-funded and
 *     ask people not to. This script downloads once so you self-host; that's
 *     the whole reason it exists.
 *   • It runs at a deliberately gentle pace. Leave it that way.
 *
 * Until you run it, the app falls back to PokéAPI item icons and nothing
 * breaks — you just get a gap in the art wherever PokéAPI stops, which since
 * its sprite repo ends before generation 9 is most of a modern field.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Two sprite sets, in preference order:
 *
 *   SV  — Scarlet/Violet, the current-generation bag. The default, because it's
 *         the game the standings are played in.
 *   ZA  — Legends: Z-A. Every Mega Stone lives here and in no SV set, megas not
 *         being an SV mechanic, so this is what fills them in. Close enough in
 *         style to SV that the two sit side by side on one team card.
 *
 * Anything in neither still falls through to PokéAPI at request time.
 */
import { writeFile, mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const API = "https://archives.bulbagarden.net/w/api.php";
const CATEGORY = "Category:Bag sprites";
const OUT_DIR = "public/items";
const UA =
  "pokedata-demo/0.1 (personal project; https://github.com/you/pokedata-demo)";

/** Least-preferred last: a later set never displaces one already taken. */
const SETS = ["SV", "ZA"];

/** Same rules as slugify() in lib/dex.ts — the app looks the manifest up by
 *  the slug it computes from pokedata's item string, so the two must agree. */
function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[.'’:,]/g, "")
    .replace(/♀/g, "-f")
    .replace(/♂/g, "-m")
    .trim()
    .replace(/\s+/g, "-");
}

/** "File:Bag Fairy Feather SV Sprite.png" -> { key: "fairy-feather", set: "SV" } */
function parseTitle(title) {
  const m = title.match(/^File:Bag (.+) ([A-Za-z]+) Sprite\.png$/);
  if (!m) return null;
  const set = SETS.indexOf(m[2]);
  if (set < 0) return null;
  return { key: slugify(m[1]), set };
}

async function listCategory() {
  /** key -> best candidate so far, by SETS order. */
  const best = new Map();
  let cont = {};

  for (;;) {
    const params = new URLSearchParams({
      action: "query",
      generator: "categorymembers",
      gcmtitle: CATEGORY,
      gcmlimit: "500",
      gcmtype: "file",
      prop: "imageinfo",
      iiprop: "url",
      format: "json",
      formatversion: "2",
      ...cont,
    });

    const res = await fetch(`${API}?${params}`, { headers: { "user-agent": UA } });
    if (!res.ok) throw new Error(`category listing: HTTP ${res.status}`);
    const json = await res.json();

    for (const page of json.query?.pages ?? []) {
      const url = page.imageinfo?.[0]?.url;
      const hit = parseTitle(page.title);
      if (!url || !hit) continue;
      const prev = best.get(hit.key);
      if (!prev || hit.set < prev.set) best.set(hit.key, { ...hit, url });
    }

    if (!json.continue) break;
    cont = json.continue;
    await sleep(120); // be a good guest
  }

  return [...best.values()].map((v) => ({ key: v.key, url: v.url, set: SETS[v.set] }));
}

async function main() {
  console.log(`Listing ${CATEGORY} (${SETS.join(", ")}) …`);
  const files = await listCategory();
  const per = SETS.map((s) => `${s}: ${files.filter((f) => f.set === s).length}`);
  console.log(`${files.length} items found (${per.join(", ")})\n`);

  await mkdir(OUT_DIR, { recursive: true });
  const manifest = {};
  let ok = 0;
  let failed = 0;

  for (const [i, f] of files.entries()) {
    const filename = `${f.key}.png`;
    try {
      const res = await fetch(f.url, { headers: { "user-agent": UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(`${OUT_DIR}/${filename}`, buf);
      manifest[f.key] = filename;
      ok++;
    } catch (err) {
      failed++;
      console.warn(`  ! ${f.key}: ${err.message}`);
    }

    if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${files.length}`);
    await sleep(120); // be a good guest
  }

  await writeFile(
    "data/items.json",
    JSON.stringify(
      Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b))),
      null,
      0,
    ),
    "utf8",
  );

  console.log(`\n${ok} downloaded, ${failed} failed -> ${OUT_DIR}/`);
  console.log("Manifest written to data/items.json");

  report(manifest);

  console.log("\nRemember to credit Bulbagarden Archives (CC BY-NC-SA 2.5).");
}

/**
 * Sanity check against the items the bundled sample actually holds. A low
 * number here means the title convention has drifted and parseTitle() needs
 * adjusting — the app would still render, just with PokéAPI art and gaps.
 */
function report(manifest) {
  let sample;
  try {
    sample = JSON.parse(
      readFileSync("data/worlds-2026-masters-sample.json", "utf8"),
    );
  } catch {
    return; // nothing to check against; not an error
  }

  let slots = 0;
  let hit = 0;
  const misses = new Set();

  for (const p of sample) {
    if (!Array.isArray(p.decklist)) continue;
    for (const m of p.decklist) {
      if (!m.item) continue;
      slots++;
      if (manifest[slugify(m.item)]) hit++;
      else misses.add(m.item);
    }
  }

  const pct = slots ? Math.round((hit / slots) * 100) : 0;
  console.log(`\nCoverage: ${hit}/${slots} sample held items (${pct}%)`);
  if (misses.size) {
    console.log(`No sprite for ${misses.size}:`, [...misses].slice(0, 10).join(", "));
  }
  if (pct < 60) {
    console.log(
      "\nLow coverage — the title convention may have changed.\n" +
        "Sample manifest keys: " +
        Object.keys(manifest).slice(0, 8).join(", "),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
