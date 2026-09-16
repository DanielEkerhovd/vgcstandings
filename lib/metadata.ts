import type { Metadata } from "next";
import { eventSnapshot, findPlayer, ordinal, progressLine, recordOf } from "./summary";

/**
 * One builder for every page. Every share of this site is a link to a
 * *moment* — an event, a round, sometimes one player — so the title and the
 * card describe that moment rather than the app.
 */
export async function eventMetadata(opts: {
  tid?: string;
  division?: string;
  player?: string;
  /** The URL this page should be indexed under. */
  canonical: string;
  view: "standings" | "usage" | "bracket";
}): Promise<Metadata> {
  const { tid, division, player: wanted, canonical, view } = opts;

  const snap = await eventSnapshot(tid, division);
  if (!snap) return { alternates: { canonical } };

  const player = findPlayer(snap, wanted);
  const div = snap.division[0].toUpperCase() + snap.division.slice(1);
  const progress = progressLine(snap);

  const noun =
    view === "usage"
      ? `${div} usage`
      : view === "bracket"
        ? `${div} top cut`
        : `${div} standings`;

  const title = player
    ? `${player.display} — ${player.placing === 1 && snap.finished ? "winner" : ordinal(player.placing)} at ${snap.label}`
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
        view === "usage"
          ? "Every Pokémon ranked by how many published teams carry it."
          : view === "bracket"
            ? "The top cut, round by round."
            : "Full standings with every team list.",
      ]
        .filter(Boolean)
        .join(" ");

  const og = new URLSearchParams({ tid: snap.tid, division: snap.division });
  if (player) og.set("player", player.name);
  const image = `/api/og?${og.toString()}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      siteName: "VGC Standings",
      url: canonical,
      title,
      description,
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}
