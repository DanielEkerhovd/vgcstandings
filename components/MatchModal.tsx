"use client";

import { useEffect, useRef } from "react";
import { sideState, type BracketNode, type BracketSide } from "@/lib/bracket";
import { countryName } from "@/lib/search";
import { MonCard } from "./shared";

/* ------------------------------------------------------------------ *
 * The match, opened.
 *
 * A bracket card is far too small to hold two six-Pokémon teams, and it
 * can't grow: the board's slot arithmetic assumes every card is exactly
 * two grid tracks tall, and `.bwrap` is a scroll container that would clip
 * anything anchored inside it. So the whole match opens over the page
 * instead — the app's first modal.
 * ------------------------------------------------------------------ */

const rec = (r: { wins: number; losses: number; ties: number } | null) =>
  r ? `${r.wins}-${r.losses}-${r.ties}` : "";

function Player({
  side,
  state,
}: {
  side: BracketSide;
  state: "win" | "out" | "live";
}) {
  const p = side.player;
  const swiss = side.swiss ? rec(side.swiss) : null;

  return (
    <div className={`mdp ${state}`}>
      <div className="mdwho">
        <span className="rk">{side.placing ?? "–"}</span>
        <span className="nm">{side.display}</span>
        {side.country && (
          <span className="cc" title={countryName(side.country) ?? undefined}>
            {side.country}
          </span>
        )}
        <span
          className="rec"
          title={swiss ? `${swiss} through Swiss` : undefined}
        >
          {rec(side.record)}
        </span>
        <span className={`v ${state === "live" ? "P" : side.result ?? "P"}`}>
          {state === "live" || !side.result ? (
            <i className="livedot beat" />
          ) : (
            side.result
          )}
        </span>
      </div>

      {p === null ? (
        // Named as an opponent, but pokedata has no row for them. A
        // different thing entirely from a withheld team list — say so.
        <>
          <h3>Not in these standings</h3>
          <p className="empty">
            pokedata names {side.display} as the opponent here but has no row
            for them in this division.
          </p>
        </>
      ) : (
        <>
          <h3>{p.hasTeam ? "Team" : "Team list not public"}</h3>
          {p.hasTeam && (
            <div className="mons">
              {p.team.map((m, k) => (
                <MonCard key={`${m.id}-${k}`} mon={m} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function MatchModal({
  node,
  stage,
  onClose,
}: {
  node: BracketNode;
  stage: string;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const solo = node.sides.length < 2;

  // Escape closes, and Tab can't wander off behind the scrim. The panel
  // holds one focusable control, but without the trap Tab walks silently
  // into the masthead — the worst failure mode of a hand-rolled modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      // Links too, not just buttons: every team card carries one out to the
      // usage tab, and they're the last focusable things in the panel — a
      // trap that only knew about buttons would let Tab walk straight past
      // them into the masthead behind.
      const f = panel.current?.querySelectorAll<HTMLElement>("button, a[href]");
      if (!f?.length) {
        e.preventDefault();
        panel.current?.focus();
        return;
      }
      const first = f[0];
      const last = f[f.length - 1];
      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (
        e.shiftKey &&
        (document.activeElement === first || document.activeElement === panel.current)
      ) {
        e.preventDefault();
        last.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The page behind mustn't scroll under the scrim. `scrollbar-gutter:
  // stable` on html holds the gutter open so nothing shifts sideways.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Focus the panel, not the close button, so a screen reader announces the
  // dialog and its name from the top rather than starting at "Close".
  useEffect(() => {
    panel.current?.focus();
  }, []);

  return (
    // No portal: nothing in the ancestor chain sets transform/filter/contain,
    // so `fixed` resolves against the viewport from here. If .shell ever
    // gains a transform, this needs createPortal — a two-line change.
    <div
      className="modal"
      // mousedown, not click: text dragged out of the panel and released
      // over the scrim must not count as clicking outside.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`mdpanel${solo ? " solo" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mdname"
        tabIndex={-1}
        ref={panel}
      >
        <div className="mdhead">
          <div className="mdid">
            <h2 id="mdname">
              {solo
                ? node.sides[0].display
                : `${node.sides[0].display} vs ${node.sides[1].display}`}
            </h2>
            <span className="meta">
              <b>{stage}</b>
              {node.table > 0 && (
                <>
                  {" · Table "}
                  <b>{node.table}</b>
                </>
              )}
              {` · Round ${node.round}`}
              {solo && " · Bye, advanced without playing"}
              {node.live && (
                <>
                  {" · "}
                  <i className="livedot beat" /> still playing
                </>
              )}
            </span>
          </div>
          <button
            className="mdclose"
            onClick={onClose}
            aria-label="Close match details"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className={`mdplayers${solo ? " one" : ""}`}>
          {node.sides.map((s, i) => (
            <Player key={s.name} side={s} state={sideState(node, i)} />
          ))}
        </div>
      </div>
    </div>
  );
}
