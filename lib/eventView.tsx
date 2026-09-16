import { eventBySlug } from "@/lib/summary";
import { eventMetadata } from "@/lib/metadata";

/**
 * What the three event pages still share, now that they share a layout.
 *
 * The rows themselves are fetched one level up, in
 * `app/event/[slug]/[division]/layout.tsx`, and handed to `EventShell` as a
 * seed. The first HTML still contains the table — the shell is a client
 * component that React server-renders in the same pass, with no Suspense
 * boundary above it, so a crawler sees exactly what it saw before. That is
 * the property this file used to hold and the layout's comment now guards.
 *
 * What's left here is the `<title>`/card, which genuinely is per view.
 */

export type View = "standings" | "usage" | "bracket";
export type Params = Promise<{ slug: string; division: string }>;
export type SP = Promise<Record<string, string | string[] | undefined>>;

export const one = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v[0] : v;

export const DIVISIONS = ["masters", "seniors", "juniors"] as const;
export const suffix = (v: View) => (v === "standings" ? "" : `/${v}`);

export async function eventViewMetadata(params: Params, sp: SP, view: View) {
  const { slug, division } = await params;
  const s = await sp;
  const event = await eventBySlug(slug);
  if (!event?.tid) return {};
  return eventMetadata({
    tid: event.tid,
    division,
    player: one(s.player),
    canonical: `/event/${slug}/${division}${suffix(view)}`,
    view,
  });
}
