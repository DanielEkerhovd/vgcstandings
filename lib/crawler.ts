import { headers } from "next/headers";

/**
 * Whether this request comes from something that reads the HTML once and
 * leaves — a search engine, or the unfurler behind a Discord, Slack, X or
 * Facebook link preview.
 *
 * The difference matters because the full server snapshot is expensive in
 * two ways: the render waits on a multi-megabyte file from pokedata, and
 * every one of those rows is then serialised into the HTML as the seed. A
 * crawler needs that — it never runs the client, so the first response is
 * all it will ever see. A person doesn't: the browser fetches the same rows
 * from `/api/standings` the moment the shell mounts, and a skeleton that
 * appears at once beats a full table that appears late.
 *
 * Unknown means human. Missing this for a bot costs one crawl; missing it
 * for a person costs every page view.
 */
const CRAWLER =
  /bot|crawl|spider|slurp|facebookexternalhit|facebot|twitterbot|discordbot|slackbot|telegrambot|whatsapp|linkedinbot|embedly|pinterest|vkshare|skypeuripreview|applebot|bingpreview|redditbot|mastodon|bluesky/i;

export async function isCrawler(): Promise<boolean> {
  try {
    const ua = (await headers()).get("user-agent") ?? "";
    return CRAWLER.test(ua);
  } catch {
    // No request context (a build-time render, say): treat as a crawler so
    // anything static still comes out with the rows in it.
    return true;
  }
}
