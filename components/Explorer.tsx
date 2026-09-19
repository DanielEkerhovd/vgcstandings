"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef } from "react";
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

  const rows = useMemo(() => {
    if (!players) return [];
    return searchPlayers(index, query).filter(({ player: p }) => {
      if (favesOnly && !faves.has(p.name)) return false;
      return true;
    });
  }, [players, index, query, favesOnly, faves]);

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
      setOpenRow(hit.key);
      requestAnimationFrame(() => {
        document
          .getElementById(`row-${encodeURIComponent(hit.key)}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    },
    [byName, setQuery, setOpenRow],
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
      {rows.map(({ player: p, slots }, i) => {
        const open = openRow === p.key;
        const top = p.placing <= CUT;
        const lead = p.placing === 1;
        const crowned = lead && finished;
        const outRound = elim.outIn.get(p.name) ?? null;
        const outTag =
          outRound === null ? null : outStage(outRound, meta.rounds, meta.cutSize);
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
            {/* The star can't live inside the row: the row is a button and
                a button can't contain one. It's a sibling laid over the
                column the row leaves empty for it — see .rowbox. */}
            <div className={`rowbox${crowned ? " crowned" : ""}`}>
              <button
                id={`row-${encodeURIComponent(p.key)}`}
                className={`row${lead ? " lead" : ""}${crowned ? " crowned" : ""}${top ? " top" : ""}${open ? " open" : ""}`}
                aria-expanded={open}
                onClick={() => setOpenRow(open ? null : p.key)}
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
              <StarButton name={p.name} on={faves.has(p.name)} onToggle={toggleFave} />
            </div>

            {shownRow === p.key && (
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
                              <button className="o link" onClick={() => jumpTo(m.opponent!)}>
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

          </Fragment>
        );
      })}

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
