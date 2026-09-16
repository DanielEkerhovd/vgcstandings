import type { MetadataRoute } from "next";
import { circuitEvents } from "@/lib/summary";
import { SITE } from "./layout";

/** Re-read the catalogue daily; events appear a few times a month. */
export const revalidate = 86400;

/**
 * One entry per event, division and view — the pages someone searching
 * "worlds 2026 masters standings" actually wants. Newer events get a higher
 * priority because that's where the traffic is during a season.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const events = await circuitEvents();
  const now = new Date();

  const pages: MetadataRoute.Sitemap = [
    { url: SITE, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE}/events`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
  ];

  events.forEach((e, i) => {
    const recent = i < 6;
    for (const division of ["masters", "seniors", "juniors"]) {
      for (const view of ["", "/usage", "/bracket"]) {
        pages.push({
          url: `${SITE}/event/${e.slug}/${division}${view}`,
          lastModified: e.start ? new Date(e.start) : now,
          changeFrequency: recent ? "hourly" : "monthly",
          priority: division === "masters" ? (recent ? 0.9 : 0.6) : 0.3,
        });
      }
    }
  });

  return pages;
}
