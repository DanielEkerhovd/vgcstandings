import { NextRequest } from "next/server";
import { UA, type RawPlayer } from "@/lib/pokedata";
import { fetchStandingsFile } from "@/lib/upstream";
import { fixtureFor } from "@/lib/fixtures";
import sample from "@/data/worlds-2026-masters-sample.json";

/**
 * Test tournaments, loaded only if one is actually asked for.
 *
 * Dynamic rather than top-level imports: together the rows are half a
 * megabyte, and a production build with fixtures off should not be carrying
 * them around in the route bundle at all.
 */
const FIXTURE_ROWS: Record<string, () => Promise<{ default: unknown }>> = {
  "9000001": () => import("@/data/fixtures/9000001.json"),
  "9000002": () => import("@/data/fixtures/9000002.json"),
  "9000003": () => import("@/data/fixtures/9000003.json"),
};

const DIVISIONS = {
  juniors: "Juniors",
  seniors: "Seniors",
  masters: "Masters",
} as const;
type Division = keyof typeof DIVISIONS;

/**
 * The JSON has no tournament-level context — no round number, no player count.
 * That lives as a line of text on the standings page:
 *
 *   "395 players - Round 8/11 - Tables Still Playing : 0 - Tie Rate : 0.00"
 *
 * One extra cached request per 30s buys the whole header. Failures are silent:
 * the header just shows less.
 */
async function fetchMeta(
  tree: string,
  tid: string,
  division: string,
): Promise<Record<string, string>> {
  try {
    const res = await fetch(
      `https://www.pokedata.ovh/${tree}/${tid}/${division}/`,
      { headers: { "user-agent": UA }, next: { revalidate: 30 } },
    );
    if (!res.ok) return {};
    const text = (await res.text()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

    const m = text.match(
      /(\d+)\s*players\s*-\s*Round\s*(\d+)\s*\/\s*(\d+)\s*-\s*Tables Still Playing\s*:\s*(\d+)\s*-\s*Tie Rate\s*:\s*([\d.]+)/i,
    );
    if (!m) return {};

    return {
      "x-players": m[1],
      "x-round": m[2],
      "x-rounds": m[3],
      "x-playing": m[4],
      "x-tierate": m[5],
    };
  } catch {
    return {};
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tid: string; division: string }> },
) {
  const { tid, division } = await params;

  if (!/^\d{7}$/.test(tid) || !(division in DIVISIONS)) {
    return Response.json({ error: "bad tid or division" }, { status: 400 });
  }

  // A fixture never touches the network. One set of rows serves all three
  // divisions — the generator builds a Masters-sized field and the division
  // toggle isn't what these are testing.
  //
  // The switch itself is localStorage, which only the browser can read, so the
  // caller says whether the tools are on and this trusts it. Nothing is
  // exposed by trusting it: a fixture is only reachable by naming one of three
  // reserved tids, and the page says on its face that it's invented.
  const fixture = fixtureFor(tid, req.nextUrl.searchParams.get("tools") === "1");
  if (fixture) {
    const rows = (await FIXTURE_ROWS[tid]()).default;
    return Response.json(rows, {
      headers: {
        // No caching: a fixture is for staring at while you edit the code
        // that renders it, and a stale one would waste an afternoon.
        "cache-control": "no-store",
        "x-source": "fixture",
        // The header line the scraper would have read off the standings page.
        "x-players": String(fixture.players),
        "x-round": String(fixture.round),
        "x-rounds": String(fixture.rounds),
        "x-playing": String(fixture.playing),
        "x-tierate": fixture.tieRate,
        // Written now, so the 24-hour idle backstop never reads a fixture as
        // an event that finished and went quiet.
        "x-upstream-modified": new Date().toUTCString(),
      },
    });
  }

  const tree =
    req.nextUrl.searchParams.get("game") === "tcg" ? "standings" : "standingsVGC";

  // Note the capitalised division in the filename: 0000191_Masters.json
  const file = `${tid}_${DIVISIONS[division as Division]}.json`;
  const url = `https://www.pokedata.ovh/${tree}/${tid}/${division}/${file}`;

  try {
    // One upstream request per 30s no matter how many browsers are open.
    // Their file only changes about once a minute; polling faster is waste.
    // Not `next: { revalidate }` — lib/upstream.ts says why.
    const upstream = await fetchStandingsFile(url);

    const meta = await fetchMeta(tree, tid, division);

    return new Response(upstream.text, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, s-maxage=30, stale-while-revalidate=120",
        "x-source": "live",
        // Their file mtime IS the "last updated" the site shows.
        "x-upstream-modified": upstream.lastModified,
        ...meta,
      },
    });
  } catch {
    // Offline, blocked, or the event doesn't exist: fall back to the bundled
    // snapshot so the demo always renders something real.
    return Response.json(sample as unknown as RawPlayer[], {
      headers: {
        "cache-control": "no-store",
        "x-source": "sample",
        "x-upstream-modified": "",
      },
    });
  }
}
