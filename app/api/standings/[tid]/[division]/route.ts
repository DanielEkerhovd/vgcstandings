import { NextRequest } from "next/server";
import { UA, type RawPlayer } from "@/lib/pokedata";
import sample from "@/data/worlds-2026-masters-sample.json";

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

  const tree =
    req.nextUrl.searchParams.get("game") === "tcg" ? "standings" : "standingsVGC";

  // Note the capitalised division in the filename: 0000191_Masters.json
  const file = `${tid}_${DIVISIONS[division as Division]}.json`;
  const url = `https://www.pokedata.ovh/${tree}/${tid}/${division}/${file}`;

  try {
    const upstream = await fetch(url, {
      headers: { "user-agent": UA },
      // One upstream request per 30s no matter how many browsers are open.
      // Their file only changes about once a minute; polling faster is waste.
      next: { revalidate: 30 },
    });

    if (!upstream.ok) throw new Error(`upstream ${upstream.status}`);

    const meta = await fetchMeta(tree, tid, division);

    return new Response(await upstream.text(), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, s-maxage=30, stale-while-revalidate=120",
        "x-source": "live",
        // Their file mtime IS the "last updated" the site shows.
        "x-upstream-modified": upstream.headers.get("last-modified") ?? "",
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
