import type { MetadataRoute } from "next";
import { SITE } from "./layout";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // The proxy and the sprite cache are plumbing; crawling them wastes
      // pokedata's bandwidth, not ours.
      disallow: ["/api/standings/", "/api/sprite/", "/api/effect/"],
    },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
