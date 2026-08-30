import type { MetadataRoute } from "next";
import { listEvents } from "@/lib/pokedata";
import { SITE } from "./layout";

/** Re-read the catalogue daily; events appear a few times a month. */
export const revalidate = 86400;

/**
 * One entry per event and division, because that's the page someone searching
 * "worlds 2026 masters standings" actually wants. Query strings index fine —
 * they just have to be listed, since nothing on the site links to all of them.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const events = await listEvents();
  const now = new Date();

  const pages: MetadataRoute.Sitemap = [
    { url: SITE, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE}/usage`, lastModified: now, changeFrequency: "hourly", priority: 0.8 },
    { url: `${SITE}/bracket`, lastModified: now, changeFrequency: "hourly", priority: 0.7 },
  ];

  for (const e of events.slice(0, 60)) {
    for (const view of ["", "/usage", "/bracket"]) {
      for (const division of ["masters", "seniors", "juniors"]) {
        pages.push({
          url: `${SITE}${view}?tid=${e.tid}&division=${division}`,
          lastModified: now,
          changeFrequency: "weekly",
          priority: division === "masters" ? 0.6 : 0.3,
        });
      }
    }
  }
  return pages;
}
