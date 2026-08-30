import { UA } from "@/lib/pokedata";

/**
 * Sprite proxy for PokéAPI's asset repo.
 *
 *   /api/sprite/pokemon/445   small pixel sprite, for table rows
 *   /api/sprite/home/445      3D render, for the expanded team cards
 *   /api/sprite/item/life-orb item icon
 *
 * PokéAPI is open and unmetered, but these are static files that never change,
 * so we cache them on our own edge for a year and stop asking.
 *
 * Champions menu icons aren't here — those are self-hosted under
 * /public/champions/ by `npm run fetch:champions` and served as plain statics.
 */
const SPRITES = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites";

function upstreamFor(path: string[]): string | null {
  const [kind, key] = path;
  if (!key) return null;

  if (kind === "pokemon" && /^\d{1,7}$/.test(key)) {
    return `${SPRITES}/pokemon/${key}.png`;
  }
  if (kind === "home" && /^\d{1,7}$/.test(key)) {
    return `${SPRITES}/pokemon/other/home/${key}.png`;
  }
  if (kind === "item" && /^[a-z0-9-]{1,60}$/.test(key)) {
    return `${SPRITES}/items/${key}.png`;
  }
  return null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const url = upstreamFor(path);
  if (!url) return new Response("bad sprite path", { status: 400 });

  try {
    const upstream = await fetch(url, {
      headers: { "user-agent": UA },
      next: { revalidate: 31536000 },
    });
    // 404 is normal and expected: the sprites repo stops before gen 9, so
    // Fairy Feather, Booster Energy, the Punching Glove and the 2026 Mega
    // Stones all miss. (PokéAPI's API knows those items — it's the art that
    // isn't there, sprite field null — so there's nothing to fix by changing
    // the slug.) ItemArt falls back to a mark of its own.
    if (!upstream.ok) throw new Error(String(upstream.status));

    return new Response(upstream.body, {
      headers: {
        "content-type": "image/png",
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("sprite unavailable", { status: 404 });
  }
}
