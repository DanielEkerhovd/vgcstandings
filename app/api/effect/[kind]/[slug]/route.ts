import effects from "@/data/effects.json";

/**
 * One line of reference text, for the hover popovers.
 *
 *   /api/effect/move/fake-out
 *   /api/effect/item/covert-cloak
 *   /api/effect/ability/intimidate
 *
 * data/effects.json is around half a megabyte and is imported here rather than
 * in the components on purpose: a client-side import would put the whole file
 * in the standings bundle so that someone could hover one word. This route
 * reads it on the server — where it's a module loaded once for the lifetime of
 * the process — and hands back the single entry that was asked for.
 *
 * The file is a build artefact that only changes when `npm run build:effects`
 * is re-run, so it caches like the sprites do: for a year, immutably.
 */

type Kind = "move" | "item" | "ability";
const KINDS = { move: "moves", item: "items", ability: "abilities" } as const;

const DB = effects as Record<string, Record<string, unknown>>;

const YEAR = "public, max-age=31536000, immutable";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ kind: string; slug: string }> },
) {
  const { kind, slug } = await params;

  const table = KINDS[kind as Kind];
  if (!table || !/^[a-z0-9-]{1,60}$/.test(slug)) {
    return new Response("bad effect path", { status: 400 });
  }

  const entry = DB[table]?.[slug];
  // A miss is ordinary, not an error: PokéAPI's dataset stops short of the
  // newest items, and pokedata will happily print a move that shipped last
  // month. Cached like a hit so the client doesn't ask again every hover.
  if (!entry) {
    return new Response(null, { status: 404, headers: { "cache-control": YEAR } });
  }

  return Response.json(entry, { headers: { "cache-control": YEAR } });
}
