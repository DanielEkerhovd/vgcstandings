import { UA } from "./pokedata";

/**
 * The one place that fetches a standings file from pokedata.ovh.
 *
 * This used to be `fetch(url, { next: { revalidate: 30 } })` in both the proxy
 * route and the server snapshot. That stopped working at Baltimore 2026 the
 * moment team lists were published: the file crossed 2 MB, which is the most
 * Next's data cache will store for one fetch, so every revalidation after that
 * was thrown away and the route served a copy from an hour earlier. The header
 * line kept updating because that scrape is tiny, which is what made it look
 * like the teams were the problem rather than the cache.
 *
 * So the 30-second collapse lives here instead, in memory, with no size cap.
 * One request per 30 s per warm server instance, concurrent callers share the
 * in-flight request, and a fetch that fails hands back the last good copy
 * rather than nothing. Vercel's CDN caches the route's response on top of this
 * (`s-maxage=30`), so a cold instance is rarely the one answering a burst.
 */

export interface StandingsFile {
  text: string;
  /** Their `last-modified`, which is the "last updated" the site shows. */
  lastModified: string;
  fetchedAt: number;
}

const TTL_MS = 30_000;

const cache = new Map<string, StandingsFile>();
const inflight = new Map<string, Promise<StandingsFile>>();

export async function fetchStandingsFile(
  url: string,
  timeoutMs?: number,
): Promise<StandingsFile> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.fetchedAt < TTL_MS) return hit;

  const pending = inflight.get(url);
  if (pending) return pending;

  const job = (async () => {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": UA },
        // Deliberately not Next's cache — see the note at the top.
        cache: "no-store",
        signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
      });
      if (!res.ok) throw new Error(`upstream ${res.status}`);
      const fresh: StandingsFile = {
        text: await res.text(),
        lastModified: res.headers.get("last-modified") ?? "",
        fetchedAt: Date.now(),
      };
      cache.set(url, fresh);
      return fresh;
    } catch (err) {
      // Stale beats sample: a copy from a minute ago is still this event.
      if (hit) return hit;
      throw err;
    } finally {
      inflight.delete(url);
    }
  })();

  inflight.set(url, job);
  return job;
}
