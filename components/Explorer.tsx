"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CircuitEvent } from "@/lib/events";
import { useFavorites } from "@/lib/favorites";
import { buildSearchIndex, countryName, searchPlayers } from "@/lib/search";
import {
  Collapse,
  Credits,
  DensityToggle,
  EventControls,
  Masthead,
  MonArt,
  MonCard,
  Nav,
  RankDisc,
  RoundProgress,
  SourceBanner,
  StandingsSkeleton,
  StarButton,
  StatusChips,
  asDivision,
  type Division,
  eventFinished,
  useAgo,
  useDensity,
  useLingering,
  useStandings,
} from "./shared";

/* ------------------------------------------------------------------ */

const CUT = 8;

export default function Explorer({
  circuit,
  initialTid,
  initialDivision,
}: {
  circuit: CircuitEvent[];
  initialTid?: string;
  initialDivision?: string;
}) {
  const router = useRouter();

  const [tid, setTid] = useState(
    initialTid && circuit.some((e) => e.tid === initialTid)
      ? initialTid
      : (circuit.find((e) => e.tid)?.tid ?? "0000191"),
  );
  const [division, setDivision] = useState<Division>(asDivision(initialDivision));
  const [query, setQuery] = useState("");
  const [openRow, setOpenRow] = useState<string | null>(null);
  /** Which row's panel is *mounted* — the open one, plus, for as long as it
   *  takes to shrink, the one that has just been closed. */
  const shownRow = useLingering(openRow);
  const [favesOnly, setFavesOnly] = useState(false);
  const { set: faves, toggle: toggleFave, count: faveCount } = useFavorites();

  const { players, meta, source, fetchedAt, error, loading } = useStandings(tid, division);
  const { compact, toggle: toggleDensity } = useDensity();

  /** Starred players who aren't in this event — the filter can't show them,
   *  so say so rather than letting the count look wrong. */
  const favesHere = useMemo(
    () => (players ?? []).filter((p) => faves.has(p.name)).length,
    [players, faves],
  );
  const ago = useAgo(fetchedAt);

  // Keep the URL in step so the Usage link carries the same event across.
  useEffect(() => {
    const qs = new URLSearchParams({ tid, division });
    router.replace(`/?${qs}`, { scroll: false });
  }, [tid, division, router]);

  const reset = () => setOpenRow(null);

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

  const jumpTo = useCallback(
    (name: string) => {
      if (!byName.has(name)) return;
      setQuery("");
      setOpenRow(name);
      requestAnimationFrame(() => {
        document
          .getElementById(`row-${encodeURIComponent(name)}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    },
    [byName],
  );

  const event = circuit.find((e) => e.tid === tid);
  // Gold is for results, so the leader's card only fills once there is one.
  const finished = eventFinished(meta);

  return (
    <div className="shell">
      <header className="masthead">
        <Masthead
          circuit={circuit}
          tid={tid}
          onPick={(v) => {
            setTid(v);
            reset();
          }}
          meta={meta}
          source={source}
          ago={ago}
          loading={loading}
          hasData={Boolean(players)}
        />

        <EventControls
          active="standings"
          division={division}
          onDivision={(d) => {
            setDivision(d);
            reset();
          }}
          right={
            <>
              <DensityToggle compact={compact} onToggle={toggleDensity} />
              <button
                className={`pill${favesOnly ? " on" : ""}`}
                aria-pressed={favesOnly}
                onClick={() => setFavesOnly((v) => !v)}
                disabled={faveCount === 0}
                title={faveCount === 0 ? "Star a player first" : "Show only favourited players"}
              >
              {favesOnly ? "Close favorites" : "★ Show favorites"}
              </button>
            </>
          }
        >
          <input
            className="search"
            placeholder="Search name, IGN, country, Pokémon, item…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search by player name, in-game name, country, Pokémon or held item"
          />
        </EventControls>
      </header>

      <SourceBanner source={source} />
      {error && !players && (
        <div className="banner">
          <b>Couldn&apos;t load standings.</b> {error}
        </div>
      )}

      {favesOnly && faveCount > favesHere && (
        <div className="activefilter subtle">
          <span>
            Showing <b>{favesHere}</b> of your <b>{faveCount}</b> favourites —
            the rest aren&apos;t in this event.
          </span>
        </div>
      )}

      {/* Everything under the header is replaced wholesale when the event or
          the division changes, and the key remounts it so the new set grows
          in rather than blinking into place. The header itself is deliberately
          outside: the chrome stays put and only what it describes moves. */}
      <div className="viewswap" key={`${tid}-${division}`}>
        <div className="key">
          <span></span>
          <span><span className="sr">Favourite</span></span>
          <span>Player</span>
          <span className="h-team">Team</span>
          <span className="h-rec">Record</span>
          <span className="r">Pts</span>
          <span className="r h-res1">Opp</span>
          <span className="r h-res2">Opp·opp</span>
        </div>

        <div className="rows">
          {!players && !error && <StandingsSkeleton />}
          {rows.map(({ player: p, slots }, i) => {
            const open = openRow === p.name;
            const top = p.placing <= CUT;
            const lead = p.placing === 1;
            const crowned = lead && finished;
            return (
              <Fragment key={p.name}>
                <button
                  id={`row-${encodeURIComponent(p.name)}`}
                  className={`row${lead ? " lead" : ""}${crowned ? " crowned" : ""}${top ? " top" : ""}${open ? " open" : ""}`}
                  aria-expanded={open}
                  onClick={() => setOpenRow(open ? null : p.name)}
                >
                  <RankDisc placing={p.placing} crowned={crowned} />
                  <StarButton name={p.name} on={faves.has(p.name)} onToggle={toggleFave} />
                  <span className="who">
                    <span className="l1">
                      <span className="nm">{p.display}</span>
                      {p.country && (
                        <span className="cc" title={countryName(p.country) ?? undefined}>
                          {p.country}
                        </span>
                      )}
                    </span>
                    {(p.trainerName || p.droppedAfter !== null) && (
                      <span className="sub">
                        {p.trainerName}
                        {p.droppedAfter !== null && ` · dropped R${p.droppedAfter}`}
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

                {shownRow === p.name && (
                  <Collapse open={open}>
                    <div className="detail">
                      <div>
                        <h3>Rounds</h3>
                        <div className="rounds">
                          {p.matches.map((m) => (
                            <div className="rd" key={m.round}>
                              <span className="r">R{m.round}</span>
                              {/* A cut table can still be out — same dot as the
                                  masthead, so "live" reads the same everywhere. */}
                              <span
                                className={`v ${m.result ?? "P"}`}
                                title={m.result ? undefined : "Still playing"}
                              >
                                {m.result ?? <i className="livedot beat" />}
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

                {p.placing === CUT && i < rows.length - 1 && (
                  <div className="cutline">Top {CUT}</div>
                )}
              </Fragment>
            );
          })}
        </div>

        {players && rows.length === 0 && (
          <div className="empty">
            Nothing matches{query && ` \u201c${query}\u201d`}
            {favesOnly && " among your favourites"}.
          </div>
        )}
      </div>

      <Credits event={event} />
    </div>
  );
}
