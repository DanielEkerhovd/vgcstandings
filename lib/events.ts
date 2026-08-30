import upcomingFallback from "@/data/upcoming.json";
import { UA, type EventSummary } from "./pokedata";

export type Tier = "Worlds" | "Intl" | "Regional" | "Special" | "Cup" | "Event";

export interface CircuitEvent {
  /** pokedata tournament id — present only once results exist. */
  tid: string | null;
  /** ISO date of day one, for sorting and grouping. */
  start: string;
  /** The original human date range, e.g. "August 28-30, 2026". */
  dates: string;
  label: string;
  tier: Tier;
  country: string | null;
  status: "done" | "upcoming";
}

/**
 * "August 28-30, 2026" -> "2026-08-28"
 * "February 27-March 1, 2026" -> "2026-02-27"
 * Returns null rather than guessing when the shape is unfamiliar.
 */
export function parseStart(dates: string): string | null {
  const md = dates.match(/([A-Za-z]+)\s+(\d{1,2})/);
  const yr = dates.match(/(\d{4})\s*$/);
  if (!md || !yr) return null;

  const month = new Date(`${md[1]} 1, 2000`).getMonth();
  if (Number.isNaN(month)) return null;

  const y = yr[1];
  const m = String(month + 1).padStart(2, "0");
  const d = md[2].padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function tierOf(name: string): Tier {
  if (/World Championship/i.test(name)) return "Worlds";
  if (/International/i.test(name)) return "Intl";
  if (/Special/i.test(name)) return "Special";
  if (/Regional/i.test(name)) return "Regional";
  if (/Cup/i.test(name)) return "Cup";
  return "Event";
}

/**
 * Pokédata's names carry a lot of boilerplate:
 *   "2026 Indianapolis Pokémon VGC Regional Championships"
 *     -> "Indianapolis Regional Championships"
 *   "2026 Pokémon VGC World Championship" -> "World Championship"
 */
export function prettyName(name: string): string {
  return name
    .replace(/^\s*\d{4}\s+/, "")
    .replace(/\s*Pokémon\s+(VGC|VG|TCG)?\s*/i, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Events that already have standings, newest first, from pokedata's index. */
export function toCircuit(events: EventSummary[]): CircuitEvent[] {
  return events.map((e) => ({
    tid: e.tid,
    start: parseStart(e.dates) ?? "",
    dates: e.dates,
    label: prettyName(e.name),
    tier: tierOf(e.name),
    country: null,
    status: "done" as const,
  }));
}

/* ------------------------------------------------------------------ *
 * Upcoming events come from RK9, because pokedata only lists events it
 * already has results for. There is no overlap to reconcile: an event
 * appears here until it finishes, then appears in pokedata's index with
 * a tid — so the timeline never shows the same event twice.
 * ------------------------------------------------------------------ */

interface UpcomingRow {
  start: string;
  dates: string;
  label: string;
  city: string;
  country: string;
  tier: string;
  rk9: string;
}

const FALLBACK = upcomingFallback as UpcomingRow[];

const toEvent = (r: UpcomingRow): CircuitEvent => ({
  tid: null,
  start: r.start,
  dates: r.dates,
  label: r.label,
  tier: (r.tier as Tier) ?? "Regional",
  country: r.country,
  status: "upcoming",
});

export async function listUpcoming(): Promise<CircuitEvent[]> {
  try {
    const res = await fetch("https://rk9.gg/events/pokemon", {
      headers: { "user-agent": UA },
      next: { revalidate: 21600 }, // the schedule moves a few times a season
    });
    if (!res.ok) throw new Error(String(res.status));
    const html = await res.text();

    const rows: CircuitEvent[] = [];
    const today = new Date().toISOString().slice(0, 10);

    // Each event is one <tr>: dates, logos, name, location, format links.
    for (const tr of html.split(/<tr[^>]*>/i).slice(1)) {
      const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
        m[1].replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim(),
      );
      if (cells.length < 4) continue;

      const [dates, , rawName, location] = cells;
      const start = parseStart(dates);
      // Skip anything without a VG tournament link — TCG-only and online events.
      if (!start || start < today || !/\/tournament\//.test(tr)) continue;

      const name = rawName.replace(/\s*Registration .*/i, "").trim();
      if (!name) continue;

      rows.push({
        tid: null,
        start,
        dates,
        label: prettyName(name),
        tier: tierOf(name),
        country: location.split(",").pop()?.trim() || null,
        status: "upcoming",
      });
    }

    return rows.length ? rows.sort((a, b) => a.start.localeCompare(b.start)) : FALLBACK.map(toEvent);
  } catch {
    return FALLBACK.map(toEvent);
  }
}
