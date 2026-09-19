"use client";

import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Player } from "@/lib/pokedata";
import type { EventMeta } from "./shared";
import { eliminate } from "@/lib/elimination";
import { splitName } from "@/lib/pokedata";
import { buildSearchIndex, countryName, searchPlayers } from "@/lib/search";
import { useEvent } from "./EventShell";
import {
  Collapse,
  MonArt,
  MonCard,
  RankDisc,
  StandingsHead,
  StandingsSkeleton,
  StarButton,
  eventFinished,
  outStage,
  stageOf,
  useLingering,
  useOpenRow,
} from "./shared";

/* ------------------------------------------------------------------ *
 * The green divider marks rank 8, not the event's real cut — that number
 * isn't in the data while it would still mean something. `meta.cutSize`
 * looks like the honest replacement and isn't: it's the *bracket* size,
 * the paired count snapped up to a power of two, so Worlds 2026's cut of
 * 13 reads 16 there. Following it would have drawn a `Top 16` line below
 * the eliminated one.
 * ------------------------------------------------------------------ */

const CUT = 8;

/**
 * How many rows are in the DOM to begin with, and how many more each time the
 * reader nears the bottom. Baltimore 2026 had 1082 players with 6473 team
 * slots — drawn all at once that's ~25k nodes, and every keystroke, star or
 * expanded row went through all of it. Search and the favourites filter still
 * run over the full list; only the drawing is lazy.
 */
const CHUNK = 80;

/**
 * The standings table. The event, the chrome and the rows themselves belong to
 * `EventShell` one level up, so that switching to Usage or Bracket replaces
 * only what's below the toolbar — see the layout for why.
 */
export default function Explorer({ initialPlayer }: { initialPlayer?: string }) {
  const {
    tid,
    division,
    players,
    meta,
    error,
    query,
    setQuery,
    favesOnly,
    faves,
    faveList,
    toggleFave,
  } = useEvent();

  const [openRow, setOpenRow] = useOpenRow(`${tid}-${division}`);
  /** Which row's panel is *mounted* — the open one, plus, for as long as it
   *  takes to shrink, the one that has just been closed. */
  const shownRow = useLingering(openRow);

  // Folded once per fetch, not once per keystroke.
  const index = useMemo(() => buildSearchIndex(players ?? []), [players]);

  // Two steps on purpose: the searched list is the expensive one, and it must
  // not be rebuilt when a star is toggled — each rebuild hands every row a new
  // `slots` set, which is exactly what defeats the row memo below.
  const searched = useMemo(
    () => (players ? searchPlayers(index, query) : []),
    [players, index, query],
  );
  const rows = useMemo(
    () => (favesOnly ? searched.filter(({ player: p }) => faves.has(p.name)) : searched),
    [searched, favesOnly, faves],
  );

  // Windowing. Reset whenever the list changes shape; the sentinel below
  // grows it again as the reader scrolls.
  const [limit, setLimit] = useState(CHUNK);
  useEffect(() => setLimit(CHUNK), [query, favesOnly]);
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || rows.length <= limit) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setLimit((n) => n + CHUNK);
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rows.length, limit]);

  /** Make sure a row is drawn before scrolling to it. */
  const reveal = useCallback(
    (key: string) => {
      const i = rows.findIndex(({ player }) => player.key === key);
      if (i >= limit) setLimit(i + CHUNK);
    },
    [rows, limit],
  );

  const byName = useMemo(
    () => new Map((players ?? []).map((p) => [p.name, p])),
    [players],
  );

  /* Starred players with no row in this event. They're listed under the table,
     below their own divider, rather than counted in a line above it: the names
     are what you starred, and the star beside each one is the only thing there
     is to do about it. Insertion order — there is no placing to sort them by,
     and the store's order is at least the order you added them in. */
  const away = useMemo(() => {
    if (!players || !favesOnly) return [];
    const here = new Set(players.map((p) => p.name));
    const q = query.trim().toLowerCase();
    return faveList
      .filter((n) => !here.has(n))
      // A plain substring rather than searchPlayers(): there is no player
      // behind these names to search — no team, no IGN, no country lookup.
      .filter((n) => !q || n.toLowerCase().includes(q))
      .map((n) => ({ name: n, ...splitName(n) }));
  }, [players, favesOnly, faveList, query]);

  const elim = useMemo(() => eliminate(players ?? [], meta, CUT), [players, meta]);

  // Both dividers are placed by their index in the *rendered* list, not by a
  // placing. Keyed to a placing they vanish the moment a search or the
  // favourites filter drops that one row, and reappear wherever that rank
  // happens to land — which is how the Top N line used to behave.
  const cutAt = useMemo(
    () => rows.findIndex(({ player }) => player.placing > CUT),
    [rows],
  );
  const outAt = useMemo(
    () =>
      elim.line === null
        ? -1
        : rows.findIndex(({ player }) => player.placing >= elim.line!),
    [rows, elim.line],
  );


  /** Open the player a shared link named, once, after the rows land. */
  const landed = useRef(false);
  useEffect(() => {
    if (landed.current || !initialPlayer || !players) return;
    landed.current = true;
    const want = initialPlayer.trim().toLowerCase();
    const hit =
      players.find((p) => p.name.toLowerCase() === want) ??
      players.find((p) => p.display.toLowerCase() === want);
    if (!hit) return;
    reveal(hit.key);
    setOpenRow(hit.key);
    // One frame for the row to exist, another for the panel to start opening.
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        document
          .getElementById(`row-${encodeURIComponent(hit.key)}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
      ),
    );
  }, [initialPlayer, players]);

  const jumpTo = useCallback(
    (name: string) => {
      // Two players can share a name (see Player.key); the link lands on
      // the first, which is all the opponent string can say.
      const hit = byName.get(name);
      if (!hit) return;
      setQuery("");
      reveal(hit.key);
      setOpenRow(hit.key);
      requestAnimationFrame(() => {
        document
          .getElementById(`row-${encodeURIComponent(hit.key)}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    },
    [byName, setQuery, setOpenRow, reveal],
  );

  // Gold is for results, so the leader's card only fills once there is one.
  const finished = eventFinished(meta);

  return (
    /* Replaced wholesale when the event or the division changes, and the key
       remounts it so the new set grows in rather than blinking into place. The
       header is deliberately outside — it's the shell's, and on a switch
       between the three views it isn't re-rendered at all: the chrome stays
       put and only what it describes moves. */
    <div className="viewswap" key={`${tid}-${division}`}>
      <StandingsHead />

      <div className="rows">
      {!players && !error && <StandingsSkeleton />}
      {rows.slice(0, limit).map(({ player: p, slots }, i) => {
        const outRound = elim.outIn.get(p.name) ?? null;
        return (
          <Fragment key={p.key}>
            {/* Nothing to divide from when there's no row above. If both
                land on the same row the red one wins — it's the stronger
                statement, and two rules stacked read as neither. */}
            {i === outAt && i > 0 && (
              <div className="cutline out">Eliminated Swiss</div>
            )}
            {i === cutAt && i > 0 && i !== outAt && (
              <div className="cutline">Top {CUT}</div>
            )}
            <StandingsRow
              p={p}
              slots={slots}
              open={openRow === p.key}
              shown={shownRow === p.key}
              faved={faves.has(p.name)}
              finished={finished}
              outTag={outRound === null ? null : outStage(outRound, meta.rounds, meta.cutSize)}
              meta={meta}
              byName={byName}
              onOpen={setOpenRow}
              onToggleFave={toggleFave}
              onJump={jumpTo}
            />
          </Fragment>
        );
      })}
      {/* Off-screen by a good margin, so the next chunk is usually in the
          DOM before the reader reaches the end of this one. */}
      {rows.length > limit && <div ref={sentinel} className="more" aria-hidden="true" />}

      {/* The third divider, and the only one not drawn from the standings:
          under it are the favourites this event doesn't have a row for.
          It stands even with nothing above it \u2014 with no rows to explain,
          the line is what says why the table looks short. */}
      {away.length > 0 && (
        <>
          <div className="cutline away">Not in this tournament</div>
          {away.map((p) => (
            <div className="rowbox" key={p.name}>
              {/* Not a button: there is no standing here to expand. */}
              <div className="row away">
                {/* Empty on purpose. A number would have to be invented
                    and a dash announces its own absence; the disc is here
                    to hold the name in the column the rest of the table
                    puts it in. */}
                <span className="rk" aria-hidden="true" />
                <span className="starslot" aria-hidden="true" />
                <span className="who">
                  <span className="l1">
                    <span className="nm">{p.display}</span>
                    {p.country && (
                      <span className="cc" title={countryName(p.country) ?? undefined}>
                        {p.country}
                      </span>
                    )}
                  </span>
                </span>
              </div>
              <StarButton name={p.name} on onToggle={toggleFave} />
            </div>
          ))}
        </>
      )}
    </div>

      {players && rows.length === 0 && away.length === 0 && (
        <div className="empty">
          Nothing matches{query && ` \u201c${query}\u201d`}
          {favesOnly && " among your favourites"}.
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * One row. Memoised so that opening, starring or searching re-renders the
 * rows that changed and not the other thousand. Everything that varies per
 * row comes in as a prop; the handlers are stable, and `slots` is the same
 * Set for as long as the search result is.
 * ------------------------------------------------------------------ */
const StandingsRow = memo(function StandingsRow({
  p,
  slots,
  open,
  shown,
  faved,
  finished,
  outTag,
  meta,
  byName,
  onOpen,
  onToggleFave,
  onJump,
}: {
  p: Player;
  slots: Set<number>;
  open: boolean;
  /** Mounted — open, or still shrinking after a close. */
  shown: boolean;
  faved: boolean;
  finished: boolean;
  outTag: string | null;
  meta: EventMeta;
  byName: Map<string, Player>;
  onOpen: (key: string | null) => void;
  onToggleFave: (name: string) => void;
  onJump: (name: string) => void;
}) {
  const top = p.placing <= CUT;
  const lead = p.placing === 1;
  const crowned = lead && finished;

  return (
    <>
      {/* The star can't live inside the row: the row is a button and
          a button can't contain one. It's a sibling laid over the
          column the row leaves empty for it — see .rowbox. */}
      <div className={`rowbox${crowned ? " crowned" : ""}`}>
        <button
          id={`row-${encodeURIComponent(p.key)}`}
          className={`row${lead ? " lead" : ""}${crowned ? " crowned" : ""}${top ? " top" : ""}${open ? " open" : ""}`}
          aria-expanded={open}
          onClick={() => onOpen(open ? null : p.key)}
        >
          <RankDisc placing={p.placing} crowned={crowned} />
          <span className="starslot" aria-hidden="true" />
          <span className="who">
            <span className="l1">
              <span className="nm">{p.display}</span>
              {p.country && (
                <span className="cc" title={countryName(p.country) ?? undefined}>
                  {p.country}
                </span>
              )}
            </span>
            {(p.trainerName || p.droppedAfter !== null || outTag) && (
              <span className="sub">
                {p.trainerName}
                {p.droppedAfter !== null && ` · dropped R${p.droppedAfter}`}
                {/* Knocked out of the bracket, which happens above the
                    line — the divider can't speak for these. Named by
                    its stage, not its round: R12 is the number the
                    feed counts in, "Top 16" is what the rest of the
                    page — and everyone watching — calls it. */}
                {outTag && ` · ${outTag}`}
              </span>
            )}
          </span>
          <span className="team">
            {p.hasTeam ? (
              p.team.map((m, k) => (
                <MonArt
                  key={`${m.id}-${k}`}
                  name={m.name}
                  item={m.item}
                  variant="row"
                  hit={slots.has(k)}
                />
              ))
            ) : (
              <span className="noteam">no team list</span>
            )}
          </span>
          <span className="rec">
            <span className="w">{p.wins}</span>-<span className="l">{p.losses}</span>-{p.ties}
          </span>
          <span className="pts">{p.points}</span>
          <span className="res">{p.oppWinPct.toFixed(2)}</span>
          <span className="res">{p.oppOppWinPct.toFixed(2)}</span>
        </button>
        <StarButton name={p.name} on={faved} onToggle={onToggleFave} />
      </div>

      {shown && (
        <Collapse open={open}>
          <div className="detail">
            <div>
              <h3>Rounds</h3>
              <div className="rounds">
                {p.matches.map((m) => (
                  <div className="rd" key={m.round}>
                    {/* Swiss counts in rounds and people say "R5"; the
                        bracket doesn't. Past the cut this is the same
                        name the columns, the modal and the row's own
                        "out in Top 8" already use — and it falls back
                        to the number for the round where `cutSize`
                        hasn't resolved yet. */}
                    <span className="r" title={`Round ${m.round}`}>
                      {(meta.rounds !== null
                        ? stageOf(m.round, meta.rounds, meta.cutSize)?.name
                        : null) ?? `R${m.round}`}
                    </span>
                    {/* A cut table can still be out — the same
                        breathing chip the bracket draws, so "live"
                        reads the same in both places. */}
                    <span
                      className={`v ${m.result ?? "live"}`}
                      title={m.result ? undefined : "Still playing"}
                    >
                      {m.result}
                    </span>
                    {m.opponent ? (
                      byName.has(m.opponent) ? (
                        <button className="o link" onClick={() => onJump(m.opponent!)}>
                          {m.opponent}
                        </button>
                      ) : (
                        <span className="o">{m.opponent}</span>
                      )
                    ) : (
                      <span className="o">bye</span>
                    )}
                    <span className="tbl">{m.table ? `table ${m.table}` : ""}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3>{p.hasTeam ? "Team" : "Team list not public"}</h3>
              {p.hasTeam && (
                <div className="mons">
                  {p.team.map((m, k) => (
                    <MonCard key={`${m.id}-${k}`} mon={m} hit={slots.has(k)} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </Collapse>
      )}
    </>
  );
});
