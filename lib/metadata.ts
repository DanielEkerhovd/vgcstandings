import type { Metadata } from "next";
import { eventSnapshot, findPlayer, ordinal, progressLine, recordOf } from "./summary";

/**
 * One builder for all three pages. Every share of this site is a link to a
 * *moment* — an event, a round, sometimes one player — so the title and the
 * card have to describe that moment, not the app.
 */
export async function eventMetadata(
  sp: Record<string, string | string[] | undefined>,
  view: "standings" | "usage" | "bracket",
): Promise<Metadata> {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const tid = one(sp.tid);
  const division = one(sp.division);
  const wanted = one(sp.player);

  const path = view === "standings" ? "/" : `/${view}`;
  const q = new URLSearchParams();
  if (tid) q.set("tid", tid);
  if (division) q.set("division", division);

  const snap = await eventSnapshot(tid, division);
  if (!snap) return { alternates: { canonical: path } };

  const player = findPlayer(snap, wanted);
  const div = snap.division[0].toUpperCase() + snap.division.slice(1);
  const progress = progressLine(snap);

  const noun =
    view === "usage" ? "usage" : view === "bracket" ? "top cut" : `${div} standings`;

  const title = player
    ? `${player.display} — ${player.placing === 1 && snap.finished ? "winner" : `${ordinal(player.placing)}`} at ${snap.label}`
    : `${snap.label} — ${noun}`;

  const leader = snap.standings[0];
  const description = player
    ? [
        `${player.display} is ${ordinal(player.placing)} at ${snap.label} on ${recordOf(player)}`,
        player.hasTeam ? `with ${player.team.map((m) => m.name).join(", ")}.` : ".",
        progress && `${progress}.`,
      ]
        .filter(Boolean)
        .join(" ")
    : [
        `${snap.label}${snap.dates ? `, ${snap.dates}` : ""}.`,
        progress && `${progress}.`,
        leader &&
          `${snap.finished ? "Won by" : "Led by"} ${leader.display} on ${recordOf(leader)}.`,
        "Full standings with every team list.",
      ]
        .filter(Boolean)
        .join(" ");

  const og = new URLSearchParams(q);
  if (player) og.set("player", player.name);
  const image = `/api/og?${og.toString()}`;
  const url = `${path}${q.toString() ? `?${q}` : ""}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      siteName: "VGC Standings",
      url,
      title,
      description,
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}
