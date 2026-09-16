import type { Metadata } from "next";
import Link from "next/link";
import { listUpcoming } from "@/lib/events";
import { circuitEvents } from "@/lib/summary";
import { Nav } from "@/components/shared";

/**
 * Every event, as plain links.
 *
 * The season picker in the app is a dropdown, which means a crawler following
 * links from the front page can reach exactly one event and no others. This
 * page is the thing that makes the rest of the site discoverable at all —
 * unglamorous, and the reason anything past the newest event can be indexed.
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Every VGC event",
  description:
    "Standings, teams and usage for every Pokémon VGC regional, international " +
    "and World Championship pokedata has results for, plus what's coming next.",
  alternates: { canonical: "/events" },
};

export default async function EventsPage() {
  const [done, upcoming] = await Promise.all([circuitEvents(), listUpcoming()]);

  const seasons = new Map<string, typeof done>();
  for (const e of done) {
    const year = e.start.slice(0, 4) || "Undated";
    if (!seasons.has(year)) seasons.set(year, []);
    seasons.get(year)!.push(e);
  }

  return (
    <div className="shell">
      <header className="masthead">
        <div className="mast-top">
          <div className="mast-id">
            <div className="l1">
              <span className="badge">Events</span>
              <h1 className="title">Every VGC event</h1>
            </div>
            <div className="l2">
              {done.length} with results{upcoming.length ? ` · ${upcoming.length} upcoming` : ""}
            </div>
          </div>
        </div>
        <div className="ctl">
          <Nav active="standings" />
        </div>
      </header>

      <div className="board">
        {[...seasons.entries()].map(([year, list]) => (
          <section key={year}>
            <h2 className="cutline">{year}</h2>
            <ul className="evlist">
              {list.map((e) => (
                <li key={e.tid}>
                  <Link href={`/event/${e.slug}/masters`}>
                    <span className="badge">{e.tier}</span>
                    <span className="evname">{e.label}</span>
                    <span className="evdate">{e.dates}</span>
                  </Link>
                  <span className="evdivs">
                    <Link href={`/event/${e.slug}/masters`}>Masters</Link>
                    <Link href={`/event/${e.slug}/seniors`}>Seniors</Link>
                    <Link href={`/event/${e.slug}/juniors`}>Juniors</Link>
                    <Link href={`/event/${e.slug}/masters/usage`}>Usage</Link>
                    <Link href={`/event/${e.slug}/masters/bracket`}>Bracket</Link>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {upcoming.length > 0 && (
          <section>
            <h2 className="cutline">Coming up</h2>
            <ul className="evlist">
              {upcoming.map((e) => (
                <li key={`${e.slug}-${e.start}`} className="soon">
                  <span>
                    <span className="badge">{e.tier}</span>
                    <span className="evname">{e.label}</span>
                    <span className="evdate">{e.dates}</span>
                  </span>
                  <span className="evdivs">no standings yet</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
