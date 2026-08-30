"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CircuitEvent } from "@/lib/events";

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
 */
export default function EventPicker({
  circuit,
  tid,
  onPick,
}: {
  circuit: CircuitEvent[];
  tid: string;
  onPick: (tid: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  const current = circuit.find((e) => e.tid === tid);

  const { upcoming, done } = useMemo(() => {
    const up = circuit
      .filter((e) => e.status === "upcoming")
      .sort((a, b) => a.start.localeCompare(b.start));
    const dn = circuit
      .filter((e) => e.status === "done")
      .sort((a, b) => b.start.localeCompare(a.start));
    return { upcoming: up, done: dn };
  }, [circuit]);

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
          {e.country && <span className="cc">{e.country}</span>}
          <span className={`tier t-${e.tier.toLowerCase()}`}>{e.tier}</span>
          <span className="when">{dayRange(e.dates)}</span>
        </button>,
      );
    }
    return out;
  };

  return (
    <div className="picker" ref={wrap}>
      <button
        className="picker-trigger"
        aria-expanded={open}
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

      {open && (
        <div className="picker-panel" role="dialog" aria-label="Choose an event">
          <div className="tl">
            {upcoming.length > 0 && (
              <>
                <div className="tlhead">Coming up</div>
                {rows(upcoming)}
              </>
            )}
            <div className="nowline">
              <span>Today</span>
            </div>
            {rows(done)}
          </div>
        </div>
      )}
    </div>
  );
}
