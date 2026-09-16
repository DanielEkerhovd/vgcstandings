"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CircuitEvent, Tier } from "@/lib/events";
import { fold } from "@/lib/search";

/** Fixed order for the tier chips, so the bar doesn't reshuffle when the
 *  catalogue gains a tier it hadn't run yet. */
const TIERS: Tier[] = ["Worlds", "Intl", "Regional", "Special", "Cup", "Event"];

/** The month header already says the month and year, so a row only needs the
 *  days: "September 18-20, 2026" -> "18-20". */
const dayRange = (dates: string) =>
  dates
    .replace(/^\s*[A-Za-z]+\s+/, "")
    .replace(/,\s*\d{4}\s*$/, "")
    .trim() || dates;

const MONTH = (iso: string) =>
  iso
    ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric",
      })
    : "Undated";

/**
 * Replaces the tournament dropdown. Collapsed it's a single line — the event
 * you're looking at. Opened it's the season as a timeline: what's coming next,
 * a marker for today, then everything already played, most recent first.
 *
 * Upcoming events are shown but not selectable: they have no standings yet,
 * and hiding them would lose the thing a timeline is for.
 *
 * The filter bar narrows the list; it never reorders it. A name or tier sort
 * would leave the month headers and the Today line marking nothing. Its state
 * is deliberately not persisted — a tier switched off last week must not still
 * be hiding events on arrival.
 */
export default function EventPicker({
  circuit,
  tid,
  onPick,
  pending = false,
}: {
  circuit: CircuitEvent[];
  tid: string;
  onPick: (tid: string) => void;
  /** The picked event is being fetched. The name dims where you clicked it,
   *  rather than the page freezing on rows that are about to be replaced. */
  pending?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  /** Empty means everything. So "no filter" and "every tier ticked" are the
   *  same state, and there's no all-lit default to explain. */
  const [tiers, setTiers] = useState<ReadonlySet<Tier>>(() => new Set());
  const wrap = useRef<HTMLDivElement>(null);

  const current = circuit.find((e) => e.tid === tid);
  const filtering = q.trim() !== "" || tiers.size > 0;

  /** Only the tiers this catalogue actually contains — a chip for a tier
   *  nobody ran is a control that can only empty the list. */
  const present = useMemo(() => {
    const have = new Set(circuit.map((e) => e.tier));
    return TIERS.filter((t) => have.has(t));
  }, [circuit]);

  const { upcoming, done } = useMemo(() => {
    const needle = fold(q);
    const keep = (e: CircuitEvent) =>
      (tiers.size === 0 || tiers.has(e.tier)) &&
      (needle === "" || fold(e.label).includes(needle));
    const hits = circuit.filter(keep);
    const up = hits
      .filter((e) => e.status === "upcoming")
      .sort((a, b) => a.start.localeCompare(b.start));
    const dn = hits
      .filter((e) => e.status === "done")
      .sort((a, b) => b.start.localeCompare(a.start));
    return { upcoming: up, done: dn };
  }, [circuit, q, tiers]);

  const toggleTier = (t: Tier) =>
    setTiers((prev) => {
      const next = new Set(prev);
      if (!next.delete(t)) next.add(t);
      return next;
    });

  // Closing clears the filter, which is also what makes Escape do the right
  // thing: it closes the panel, and the query goes with it.
  useEffect(() => {
    if (open) return;
    setQ("");
    setTiers((prev) => (prev.size ? new Set() : prev));
  }, [open]);

  // Close on outside click or Escape, like any other menu.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const rows = (list: CircuitEvent[]) => {
    const out: React.ReactNode[] = [];
    let month = "";
    for (const e of list) {
      const m = MONTH(e.start);
      if (m !== month) {
        month = m;
        out.push(
          <div className="tlmonth" key={`m-${e.status}-${m}`}>
            {m}
          </div>,
        );
      }
      const selected = Boolean(e.tid) && e.tid === tid;
      out.push(
        <button
          key={`${e.status}-${e.tid ?? e.label}-${e.start}`}
          className={`tlrow${e.status === "upcoming" ? " future" : ""}${selected ? " on" : ""}`}
          disabled={!e.tid}
          aria-current={selected ? "true" : undefined}
          onClick={() => {
            if (!e.tid) return;
            onPick(e.tid);
            setOpen(false);
          }}
          title={e.tid ? `Show standings for ${e.label}` : "No standings yet"}
        >
          <span className="node" />
          <span className="label">{e.label}</span>
          {e.country && <span className="cc-chip">{e.country}</span>}
          <span className={`tier t-${e.tier.toLowerCase()}`}>{e.tier}</span>
          <span className="when">{dayRange(e.dates)}</span>
        </button>,
      );
    }
    return out;
  };

  return (
    <div className="picker" ref={wrap}>
      {/* The event name is the page's heading, so it has to be an <h1> and not
          just big text — it's the line search engines quote. A button is
          phrasing content, so it's allowed to sit inside one. */}
      <h1 className="picker-h1">
      <button
        className="picker-trigger"
        aria-expanded={open}
        data-pending={pending || undefined}
        onClick={() => setOpen((v) => !v)}
        title="Choose an event"
      >
        <span className="nm">{current?.label ?? "Choose an event"}</span>
        <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
          <path
            d="M6 9l6 6 6-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      </h1>

      {open && (
        <div className="picker-panel" role="dialog" aria-label="Choose an event">
          <div className="pkfilter">
            <input
              type="search"
              className="search"
              placeholder="Filter events…"
              aria-label="Filter events by name"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {present.length > 1 && (
              <div className="pktiers">
                {present.map((t) => (
                  <button
                    key={t}
                    className={`tier chip t-${t.toLowerCase()}${tiers.has(t) ? " on" : ""}`}
                    aria-pressed={tiers.has(t)}
                    onClick={() => toggleTier(t)}
                    title={`Show only ${t} events`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
            {filtering && (
              <div className="pkcount" aria-live="polite">
                {upcoming.length + done.length} of {circuit.length}
              </div>
            )}
          </div>

          {upcoming.length + done.length === 0 ? (
            <div className="pkempty">No events match.</div>
          ) : (
            <div className="tlscroll">
              <div className="tl">
                {upcoming.length > 0 && (
                  <>
                    <div className="tlhead">Coming up</div>
                    {rows(upcoming)}
                  </>
                )}
                {/* A Today rule with nothing under it reads as a fault, and a
                    filter matching only upcoming events can produce exactly
                    that. Unfiltered, `done` is never empty. */}
                {done.length > 0 && (
                  <div className="nowline">
                    <span>Today</span>
                  </div>
                )}
                {rows(done)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
