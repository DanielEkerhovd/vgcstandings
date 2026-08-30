"use client";

import {
  useMemo,
  useRef,
  useState,
  useEffect,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { monDetail, usage, type MonDetail, type Tally } from "@/lib/pokedata";
import { natureShift } from "@/lib/natures";
import type { CircuitEvent } from "@/lib/events";
import { resolveMon } from "@/lib/dex";
import { TypeIcon, typeColor } from "@/lib/types";
import type { EffectKind } from "@/lib/effects";
import {
  Collapse,
  Credits,
  DensityToggle,
  EventControls,
  Explain,
  ItemArt,
  Masthead,
  MonArt,
  SourceBanner,
  UsageSkeleton,
  asDivision,
  type Division,
  useAgo,
  useDensity,
  useLingering,
  useStandings,
} from "./shared";

export default function UsageBoard({
  circuit,
  initialTid,
  initialDivision,
  initialMon,
}: {
  circuit: CircuitEvent[];
  initialTid?: string;
  initialDivision?: string;
  /** ?mon= — a team card on another tab linked straight to this species. */
  initialMon?: string;
}) {
  const router = useRouter();

  const [tid, setTid] = useState(
    initialTid && circuit.some((e) => e.tid === initialTid)
      ? initialTid
      : (circuit.find((e) => e.tid)?.tid ?? "0000191"),
  );
  const [division, setDivision] = useState<Division>(asDivision(initialDivision));
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(initialMon ?? null);
  /** Which panel is *mounted* — the open one, plus, for as long as it takes
   *  to shrink, the one that has just been closed. */
  const shown = useLingering(open);

  const { players, meta, source, fetchedAt, error, loading } = useStandings(tid, division);
  const { compact, toggle: toggleDensity } = useDensity();
  const ago = useAgo(fetchedAt);

  // Which row is open rides along in the URL, so the link a team card built
  // is the same link this page hands back — refresh or share it and the same
  // panel is open. Names carry spaces and brackets, hence URLSearchParams.
  useEffect(() => {
    const qs = new URLSearchParams({ tid, division });
    if (open) qs.set("mon", open);
    router.replace(`/usage?${qs}`, { scroll: false });
  }, [tid, division, open, router]);

  // Arriving on ?mon=, the panel is open from the first paint but there is
  // nothing to scroll to until the standings land and the list exists. Once
  // only: after that the list is the reader's to move around.
  const jumped = useRef(!initialMon);
  useEffect(() => {
    if (jumped.current || !players || !open) return;
    jumped.current = true;
    const el = document.getElementById(`usage-${encodeURIComponent(open)}`);
    // Linked to a species nobody in this division brought — a division switch
    // on the way over, usually. Drop it rather than let a `mon=` for a row
    // that isn't here trail the reader around the rest of the page.
    if (!el) {
      setOpen(null);
      return;
    }
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "center" });
  }, [players, open]);

  /** Players whose team list is public — the only ones usage can be read from. */
  const known = useMemo(
    () => (players ?? []).filter((p) => p.hasTeam).length,
    [players],
  );

  const rows = useMemo(() => {
    if (!players) return [];
    const q = query.trim().toLowerCase();
    return usage(players).filter((m) => !q || m.name.toLowerCase().includes(q));
  }, [players, query]);

  /** Folded only for the row that's actually on screen — one pass, not 300.
   *  Off `shown` rather than `open`, or a closing panel would lose its
   *  contents on the first frame of the shrink. */
  const detail = useMemo(
    () =>
      shown && players
        ? // megaUnknown counts as a Mega too: a stone PokéAPI hasn't published
          // a form for was still a Mega on the day. Same test the item sprite
          // uses — it just can't name the ability, so it goes in with null.
          monDetail(players, shown, (mon) => {
            const r = resolveMon(mon.name, mon.item);
            return r.isMega || r.megaUnknown ? { ability: r.megaAbility } : null;
          })
        : null,
    [players, shown],
  );

  const max = rows[0]?.count ?? 1;
  const event = circuit.find((e) => e.tid === tid);

  return (
    <div className="shell">
      <header className="masthead">
        <Masthead
          circuit={circuit}
          tid={tid}
          onPick={(v) => {
            setTid(v);
            setOpen(null);
          }}
          meta={meta}
          source={source}
          ago={ago}
          loading={loading}
          hasData={Boolean(players)}
        />

        <EventControls
          active="usage"
          division={division}
          onDivision={(d) => {
            setDivision(d);
            setOpen(null);
          }}
          right={
            <>
              {players && (
                <span className="meta">
                  <b>{rows.length}</b> Pokémon · <b>{known}</b> teams
                </span>
              )}
              <DensityToggle compact={compact} onToggle={toggleDensity} />
            </>
          }
        >
          <input
            className="search"
            placeholder="Search Pokémon…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search Pokémon"
          />
        </EventControls>
      </header>

      <SourceBanner source={source} />
      {error && !players && (
        <div className="banner">
          <b>Couldn&apos;t load standings.</b> {error}
        </div>
      )}

      {/* Remounted on every event or division change, so the new tally grows
          in as one thing instead of blinking over the old one. The header
          stays outside — the chrome doesn't move, only what it describes. */}
      <div className="viewswap" key={`${tid}-${division}`}>
        {!players && !error && <UsageSkeleton />}

        <ol className="usagelist">
          {rows.map((m, i) => {
            const r = resolveMon(m.name);
            const pct = known ? (m.count / known) * 100 : 0;
            const isOpen = open === m.name;
            return (
              <li key={m.name} id={`usage-${encodeURIComponent(m.name)}`}>
                <button
                  className={`usagerow${isOpen ? " open" : ""}`}
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : m.name)}
                  title={`Items, moves and teammates for ${m.name}`}
                >
                  <span className="pos">{i + 1}</span>
                  <MonArt name={m.name} variant="row" />
                  <span className="nm">
                    <span className="label">{m.name}</span>
                    {r.types.length > 0 && (
                      <span className="typepills">
                        {r.types.map((t) => (
                          <span key={t} className="typepill" style={{ background: typeColor(t) }}>
                            <TypeIcon type={t} size={10} />
                            {t}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                  <span className="bar" aria-hidden="true">
                    <span
                      className="fill"
                      style={{
                        width: `${(m.count / max) * 100}%`,
                        background: typeColor(r.types[0]),
                      }}
                    />
                  </span>
                  <span className="count">{m.count}</span>
                  <span className="pct">{pct.toFixed(1)}%</span>
                </button>

                {shown === m.name && detail && (
                  <Collapse open={isOpen}>
                    <MonDetailPanel name={m.name} detail={detail} />
                  </Collapse>
                )}
              </li>
            );
          })}
        </ol>

        {players && rows.length === 0 && (
          <div className="empty">
            Nothing matches{query && ` “${query}”`}.
          </div>
        )}
      </div>

      <Credits event={event} />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * The expanded panel. Every percentage is a share of that species'
 * own users, so "88%" reads as "88% of the Landorus in this event".
 * ------------------------------------------------------------------ */

/** Long tails — natures especially — would run the panel off the screen. */
const TOP = 8;

/**
 * What the nature does, next to its name. "Adamant" is only meaningful to
 * someone who has the table memorised, and the whole point of the panel is
 * that you don't have to.
 */
function NatureNote({ nature }: { nature: string }) {
  const shift = natureShift(nature);
  if (!shift) return null; // not one of the 25 — say nothing rather than guess
  if (shift === "neutral") return <span className="nat none">neutral</span>;

  return (
    <span className="nat" title={`+${shift.up.long}, −${shift.down.long}`}>
      <b className="up">+{shift.up.short}</b>
      <b className="dn">−{shift.down.short}</b>
    </span>
  );
}

function TallyList({
  rows,
  users,
  icon,
  note,
  explain,
}: {
  rows: Tally[];
  users: number;
  /** Art for the left of the row — an item's sprite, a teammate's icon. */
  icon?: (name: string) => ReactNode;
  /** Anything the bare name doesn't explain on its own — natures, so far. */
  note?: (name: string) => ReactNode;
  /** Set on the three lists whose names are things with rules attached, so
   *  they explain themselves on hover. Natures already carry their own note,
   *  and teammates are Pokémon, which the icon beside them names better. */
  explain?: EffectKind;
}) {
  if (rows.length === 0) return <p className="nodata">Not listed</p>;

  return (
    <div className="tally">
      {rows.slice(0, TOP).map((t) => {
        const pct = users ? (t.count / users) * 100 : 0;
        return (
          <div
            key={t.name}
            className={`tallyrow${icon ? " ico" : ""}`}
            style={{ "--w": `${pct}%` } as CSSProperties}
          >
            {icon?.(t.name)}
            <span className="t">
              {explain ? <Explain kind={explain} term={t.name} /> : t.name}
              {note?.(t.name)}
            </span>
            {/* The count rides on the percentage rather than on the row: a
                `title` up there would be found by the browser walking up from
                a term inside it, and shown instead of the explanation. */}
            <span className="n" title={`${t.count} of ${users}`}>
              {Math.round(pct)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

function MonDetailPanel({ name, detail }: { name: string; detail: MonDetail }) {
  const { users } = detail;
  return (
    <div className="detail usagedetail">
      <section>
        <h3>Items</h3>
        <TallyList
          rows={detail.items}
          users={users}
          explain="item"
          icon={(item) => {
            // The panel is one species, so the Mega Stone test has both halves
            // it needs — the stone only resolves against its own Pokémon.
            const r = resolveMon(name, item);
            return (
              <span className="itemart">
                <ItemArt item={item} isStone={r.isMega || r.megaUnknown} />
              </span>
            );
          }}
        />
      </section>
      <section>
        <h3>Moves</h3>
        <TallyList rows={detail.moves} users={users} explain="move" />
      </section>
      {/* One grid cell, so Mega Abilities always sits directly under Abilities
          instead of wherever auto-fit's row break happens to land it. */}
      <div className="stack">
        <section>
          <h3>Abilities</h3>
          <TallyList rows={detail.abilities} users={users} explain="ability" />
        </section>
        {detail.megaUsers > 0 && (
          <section>
            <h3>Mega Abilities</h3>
            {/* A share of the Mega users, not of every user. Since the ability
                comes off the form, this is really the X-versus-Y split for the
                species that have two stones. */}
            <TallyList
              rows={detail.megaAbilities}
              users={detail.megaUsers}
              explain="ability"
            />
          </section>
        )}
      </div>
      <section>
        <h3>Natures</h3>
        <TallyList
          rows={detail.natures}
          users={users}
          note={(n) => <NatureNote nature={n} />}
        />
      </section>
      <section>
        <h3>Teammates</h3>
        <TallyList
          rows={detail.teammates}
          users={users}
          icon={(mate) => <MonArt name={mate} variant="row" />}
        />
      </section>
    </div>
  );
}
