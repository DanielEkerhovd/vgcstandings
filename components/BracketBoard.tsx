"use client";

import { useCallback, useMemo } from "react";
import {
  buildBracket,
  roundSizes,
  sideState,
  type BracketNode,
  type BracketSide,
} from "@/lib/bracket";
import { countryName } from "@/lib/search";
import MatchModal from "./MatchModal";
import { useEvent } from "./EventShell";
import { BracketSkeleton, RoundProgress, stageOf, useOpenRow } from "./shared";

const rec = (r: { wins: number; losses: number; ties: number } | null) =>
  r ? `${r.wins}-${r.losses}-${r.ties}` : null;

/**
 * One player's line inside a card. A <span>, not a <div>: the card is a
 * button, and a div isn't valid phrasing content inside one. `.side` already
 * declares `display: grid`, so this costs nothing visually.
 *
 * Nothing in here may ever become interactive — nested buttons are invalid.
 */
function Side({ side, state }: { side: BracketSide; state: "win" | "out" | "live" }) {
  const swiss = rec(side.swiss);
  const playing = state === "live" || !side.result;
  return (
    <span className={`side ${state}`}>
      <span
        className="seed"
        title="Current standing — pokedata re-ranks as cut results land, so this is not the Swiss seed"
      >
        {side.placing ?? "–"}
      </span>
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
        {rec(side.record) ?? ""}
      </span>
      {/* Empty on purpose while the match is out: the chip is the mark, and
          it breathes. The card already carries "still playing" for a reader
          that isn't looking at it. */}
      <span className={`v ${playing ? "live" : side.result}`}>
        {playing ? null : side.result}
      </span>
    </span>
  );
}

function Node({
  node,
  onOpen,
}: {
  node: BracketNode;
  onOpen: (id: string) => void;
}) {
  const joined = node.from.some(Boolean);
  return (
    // No aria-label: it would replace the card's whole accessible name and
    // silence the ranks and records. Name-from-content is what's wanted, and
    // the .sr span below folds live state into it.
    <button
      className={`bnode${node.live ? " live" : ""}${joined ? " joined" : ""}`}
      style={{
        gridColumn: node.depth + 1,
        gridRow: `${node.slot * 2 + 1} / span 2`,
      }}
      id={`bn-${encodeURIComponent(node.id)}`}
      onClick={() => onOpen(node.id)}
      aria-haspopup="dialog"
      title={
        node.kind === "bye"
          ? "Bye — open for the team"
          : node.table
            ? `Open match details · table ${node.table}`
            : "Open match details"
      }
    >
      {node.sides.map((s, i) => (
        <Side key={s.name} side={s} state={sideState(node, i)} />
      ))}

      {/* A bye still occupies a full card, so every slot is the same height
          and the wires stay on a regular grid. */}
      {node.kind === "bye" && (
        <span className="side bye">
          {/* Empty seed cell so "Bye" sits in the name column, lined up with
              the real player above it rather than squeezed into the disc. */}
          <span className="seed" />
          <span className="nm">Bye</span>
        </span>
      )}

      {node.live && <span className="sr">still playing</span>}

      <Wire node={node} />
    </button>
  );
}

/** One elbow per card, drawn from the child up or down to its parent. */
function Wire({ node }: { node: BracketNode }) {
  if (node.dy === null) return null;
  return (
    <i
      className={`wire ${node.dy >= 0 ? "dn" : "up"}${node.parentProjected ? " pend" : ""}`}
      style={{ "--dy": Math.abs(node.dy) } as React.CSSProperties}
      aria-hidden="true"
    />
  );
}

/**
 * A round the bracket says must happen and pokedata hasn't paired yet.
 *
 * A div, not a button: there is no match behind it to open, and a card that
 * invites a click it can't answer is worse than one that plainly doesn't.
 * Nothing here is filled or solid — on this page that's reserved for things
 * that have actually happened.
 */
function Ghost({ node }: { node: BracketNode }) {
  return (
    <div
      className="bnode ghost joined"
      style={{
        gridColumn: node.depth + 1,
        gridRow: `${node.slot * 2 + 1} / span 2`,
      }}
    >
      {node.sides.map((s) => (
        <span key={s.name} className={`side pend${s.tbd ? " tbd" : ""}`}>
          {/* Every cell is rendered even when empty: .side is a five-column
              grid, and a missing child would slide the rest left out of
              alignment with the real cards above. */}
          <span className="seed">{s.tbd ? "" : (s.placing ?? "–")}</span>
          <span className="nm">{s.tbd ? "TBD" : s.display}</span>
          <span className="cc" title={countryName(s.country) ?? undefined}>
            {s.country ?? ""}
          </span>
          <span className="rec">{rec(s.record) ?? ""}</span>
          <span className="v P">
            <i className="livedot pend" />
          </span>
        </span>
      ))}

      <span className="sr">not paired yet</span>

      <Wire node={node} />
    </div>
  );
}

/**
 * The reconstructed top cut. The event, the chrome and the rows themselves
 * belong to `EventShell` one level up — see the layout for why.
 */
export default function BracketBoard() {
  const { tid, division, players, meta, source, error } = useEvent();

  const [openId, setOpenId] = useOpenRow(`${tid}-${division}`);

  const bracket = useMemo(
    () => buildBracket(players, meta.rounds, meta.ended),
    [players, meta.rounds, meta.ended],
  );

  /**
   * Keyed by id, never by the node object: `id` is round + both names, so it
   * survives a poll rebuilding the tree while `placing` churns underneath.
   * That's what lets a live match resolve *inside* an open panel — the memo
   * re-finds the same match and the new result flows straight through.
   */
  const openNode = useMemo(
    () =>
      openId && bracket
        ? (bracket.rounds.flatMap((r) => r.nodes).find((n) => n.id === openId) ??
          null)
        : null,
    [bracket, openId],
  );

  const closeMatch = useCallback(() => {
    const id = openId;
    setOpenId(null);
    // Put focus back on the card that opened this. By id rather than a
    // stashed element, so a remount mid-poll can't strand it.
    if (id) {
      requestAnimationFrame(() =>
        document.getElementById(`bn-${encodeURIComponent(id)}`)?.focus(),
      );
    }
  }, [openId, setOpenId]);

  /** One source for a round's name, so the column heading and the match
   *  detail's title can't drift apart. */
  const stageName = useCallback(
    (round: number) => {
      const named =
        meta.rounds !== null ? stageOf(round, meta.rounds, meta.cutSize)?.name : null;
      return (
        named ??
        bracket?.rounds.find((r) => r.round === round)?.label ??
        `Round ${round}`
      );
    },
    [meta.rounds, meta.cutSize, bracket],
  );

  const lastRound = useMemo(() => {
    if (!players) return null;
    const sizes = roundSizes(players);
    const last = Math.max(...sizes.keys(), 0);
    return last ? { round: last, size: sizes.get(last) ?? 0, count: sizes.size } : null;
  }, [players]);

  return (
    /* The board is remounted on every event or division change so the new tree
       grows in as one thing. The match detail sits outside `.viewswap` — a
       modal isn't part of the board, it has its own way in, and `.viewswap`
       scales as it arrives, which would leave a `position: fixed` panel
       resolving against this box instead of the window. */
    <>
      <div className="viewswap" key={`${tid}-${division}`}>
        {!players && !error && <BracketSkeleton />}

        {bracket && (
          <>
            <div className="bwrap">
              <div
                className="bhead"
                style={{ "--bcols": bracket.rounds.length } as React.CSSProperties}
              >
                {bracket.rounds.map((r) => (
                  <span key={r.round} className={`bstage${r.projected ? " pend" : ""}`}>
                    <b>{stageName(r.round)}</b>
                    <span className="sub">
                      {r.projected ? "not paired yet" : `${r.size} players`}
                    </span>
                  </span>
                ))}
              </div>

              <div
                className={`bracket${bracket.linked ? "" : " unlinked"}`}
                style={{ "--bcols": bracket.rounds.length } as React.CSSProperties}
              >
                {bracket.rounds.flatMap((r) =>
                  r.nodes.map((n) =>
                    n.projected ? (
                      <Ghost key={n.id} node={n} />
                    ) : (
                      <Node key={n.id} node={n} onOpen={setOpenId} />
                    ),
                  ),
                )}
              </div>
            </div>

            <p className="bkey">
              Reconstructed from the round-by-round results — pokedata publishes no
              bracket. <b>Open any card</b> for both teams in full. The number on
              each name is that player&apos;s <b>current standing</b>, which is
              re-sorted as cut results land, not a frozen Swiss seed; records mix
              Swiss and cut wins, so hover one for the Swiss-only figure.
              {bracket.projectedRounds > 0 && (
                <>
                  {" "}
                  The <b>dashed cards</b> are rounds pokedata hasn&apos;t paired
                  yet — the bracket fixes that they happen, so they&apos;re drawn
                  empty and fill in as each match below them finishes.
                </>
              )}
              {!bracket.linked && " Rounds couldn't be linked, so these are plain columns rather than a tree."}
            </p>
          </>
        )}

        {players && !bracket && (
          <div className="empty">
            {meta.rounds !== null && meta.round !== null && meta.round <= meta.rounds ? (
              <>
                <b>No top cut yet.</b> This event is on round {meta.round} of{" "}
                {meta.rounds}. The bracket appears here as soon as the first cut
                round is paired.
                <RoundProgress
                  round={meta.round}
                  rounds={meta.rounds}
                  cutSize={meta.cutSize}
                  ended={meta.ended}
                />
              </>
            ) : source === "sample" ? (
              <>
                <b>The snapshot has no top cut.</b> It stops at the end of Swiss —{" "}
                {players.length} players, {lastRound?.count ?? 0} rounds — and
                offline there&apos;s no round header to derive a cut from either.
                Point this at a finished event on an unrestricted connection and
                the bracket fills in.
              </>
            ) : (
              <>
                <b>No top cut found.</b> pokedata&apos;s round header wasn&apos;t
                readable for this event, so the cut has to be inferred from the
                rounds themselves — and nothing here looks like one. The last round
                played had {lastRound?.size ?? 0} players.
              </>
            )}
          </div>
        )}
      </div>

      {openNode && (
        <MatchModal
          node={openNode}
          stage={stageName(openNode.round)}
          onClose={closeMatch}
        />
      )}
    </>
  );
}
