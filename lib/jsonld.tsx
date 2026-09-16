import type { EventSnapshot } from "./summary";
import { SITE } from "@/app/layout";

/**
 * Structured data for one event page.
 *
 * Two things Google understands: the event itself, and the standings as a
 * ranked list. It's what can turn a plain blue link into a result with the
 * dates and the top finishers under it. Only the top 10 are listed — the
 * markup is meant to summarise the page, not duplicate all 400 rows.
 */
export function EventJsonLd({
  snap,
  path,
}: {
  snap: EventSnapshot;
  path: string;
}) {
  const url = `${SITE}${path}`;
  const division = snap.division[0].toUpperCase() + snap.division.slice(1);

  const graph: unknown[] = [
    {
      "@type": "SportsEvent",
      name: `${snap.label} — ${division}`,
      url,
      ...(snap.dates ? { description: `${snap.label}, ${snap.dates}.` } : {}),
      sport: "Pokémon Video Game Championships",
      eventStatus: snap.finished
        ? "https://schema.org/EventScheduled"
        : "https://schema.org/EventScheduled",
      organizer: { "@type": "Organization", name: "The Pokémon Company International" },
    },
    {
      "@type": "ItemList",
      name: `${snap.label} ${division} standings`,
      numberOfItems: snap.standings.length,
      itemListOrder: "https://schema.org/ItemListOrderAscending",
      itemListElement: snap.standings.slice(0, 10).map((p) => ({
        "@type": "ListItem",
        position: p.placing,
        name: p.display,
        item: {
          "@type": "Person",
          name: p.display,
          ...(p.country ? { nationality: p.country } : {}),
        },
      })),
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Events", item: `${SITE}/events` },
        { "@type": "ListItem", position: 2, name: snap.label, item: url },
      ],
    },
  ];

  return (
    <script
      type="application/ld+json"
      // Server-rendered from our own data; nothing here is user input.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({ "@context": "https://schema.org", "@graph": graph }),
      }}
    />
  );
}
