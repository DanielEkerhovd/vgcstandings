/**
 * Downloads the Pokémon Champions menu sprites from Bulbagarden Archives into
 * public/champions/, and writes data/champions.json mapping each file's key to
 * its filename.
 *
 *   npm run fetch:champions
 *
 * ── Please read before running ──────────────────────────────────────────────
 * Bulbagarden Archives content is published under CC BY-NC-SA 2.5, and the
 * sprites themselves are Nintendo / Creatures / GAME FREAK assets that
 * Bulbagarden hosts as a fan resource. Practically that means:
 *
 *   • Non-commercial use only, and you must credit Bulbagarden Archives.
 *   • Don't hotlink their servers from your app — they're donation-funded and
 *     ask people not to. This script downloads once so you self-host; that's
 *     the whole reason it exists.
 *   • It runs at a deliberately gentle pace. Leave it that way.
 *
 * Until you run it, the app falls back to PokéAPI sprites and nothing breaks.
 * ────────────────────────────────────────────────────────────────────────────
 */
import { writeFile, mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const API = "https://archives.bulbagarden.net/w/api.php";
const CATEGORY = "Category:Champions menu sprites";
const OUT_DIR = "public/champions";
const UA =
  "pokedata-demo/0.1 (personal project; https://github.com/you/pokedata-demo)";

/** "Menu CP 0006-Mega Y.png" -> "0006-mega-y" ; "Menu CP 0445.png" -> "0445" */
function keyFromTitle(title) {
  const m = title.match(/^File:Menu CP (.+)\.png$/i);
  if (!m) return null;
  return m[1].toLowerCase().replace(/\s+/g, "-");
}

async function listCategory() {
  const files = [];
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
      const key = keyFromTitle(page.title);
      if (url && key) files.push({ key, url });
    }

    if (!json.continue) break;
    cont = json.continue;
  }

  return files;
}

async function main() {
  console.log(`Listing ${CATEGORY} …`);
  const files = await listCategory();
  console.log(`${files.length} files found\n`);

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

    if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${files.length}`);
    await sleep(120); // be a good guest
  }

  await writeFile(
    "data/champions.json",
    JSON.stringify(
      Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b))),
      null,
      0,
    ),
    "utf8",
  );

  console.log(`\n${ok} downloaded, ${failed} failed -> ${OUT_DIR}/`);
  console.log("Manifest written to data/champions.json");

  report(manifest);

  console.log("\nRemember to credit Bulbagarden Archives (CC BY-NC-SA 2.5).");
}

/**
 * Sanity check: how many team slots in the bundled sample actually find an
 * icon? If this comes back low, the filename convention has drifted and
 * championsIconFor() in lib/dex.ts needs its key candidates adjusting.
 */
function report(manifest) {
  let dex, sample;
  try {
    dex = JSON.parse(readFileSync("data/pokedex.json", "utf8"));
    sample = JSON.parse(
      readFileSync("data/worlds-2026-masters-sample.json", "utf8"),
    );
  } catch {
    return; // nothing to check against; not an error
  }

  const slugify = (x) =>
    x.toLowerCase().replace(/[.'’:,]/g, "").trim().replace(/\s+/g, "-");
  const pad4 = (n) => String(n).padStart(4, "0");

  let slots = 0;
  let hit = 0;
  const misses = new Set();

  for (const p of sample) {
    if (!Array.isArray(p.decklist)) continue;
    for (const m of p.decklist) {
      slots++;
      const base = slugify(m.name.replace(/\s*\[.*\]$/, ""));
      const id = dex[base]?.id;
      if (id && (manifest[pad4(id)] || manifest[String(id)])) hit++;
      else misses.add(m.name);
    }
  }

  const pct = slots ? Math.round((hit / slots) * 100) : 0;
  console.log(`\nCoverage: ${hit}/${slots} sample team slots (${pct}%)`);
  const megaKeys = Object.keys(manifest).filter((k) => k.includes("mega"));
  console.log(`Mega variants in manifest: ${megaKeys.length}`);
  if (misses.size) {
    console.log(`No icon for ${misses.size}:`, [...misses].slice(0, 10).join(", "));
  }
  if (pct < 60) {
    console.log(
      "\nLow coverage — the filename convention may have changed.\n" +
        "Sample manifest keys: " +
        Object.keys(manifest).slice(0, 8).join(", "),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
