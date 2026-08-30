"use client";

import Link from "next/link";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  normalize,
  type Mon,
  type Player,
  type RawPlayer,
} from "@/lib/pokedata";
import { toCircuit, type CircuitEvent } from "@/lib/events";
import { toolsOn } from "@/lib/devtools";
import { FIXTURES, fixtureEvents, isFixtureTid } from "@/lib/fixtures";
import EventPicker from "./EventPicker";
import {
  CHAMPIONS_COUNT,
  ITEMS_COUNT,
  itemIcon,
  itemSlug,
  moveType,
  resolveMon,
  type PokemonType,
} from "@/lib/dex";
import { classShort, isMove, useTermEffect, type EffectKind } from "@/lib/effects";
import { TypeIcon, typeColor, typeTint } from "@/lib/types";

export const DIVISIONS = ["masters", "seniors", "juniors"] as const;
export type Division = (typeof DIVISIONS)[number];

/**
 * Where the rows on screen came from. Only `live` is a real tournament as it
 * stands right now — the other two are, in their different ways, a stand-in,
 * and the page says so rather than letting either pass for the real thing.
 */
export type Source = "live" | "sample" | "fixture" | null;

export const asDivision = (v?: string | null): Division =>
  DIVISIONS.includes(v as Division) ? (v as Division) : "masters";

/* ------------------------------------------------------------------ *
 * Artwork. Tries, in order: a self-hosted Champions menu icon (only
 * present after `npm run fetch:champions`), then PokéAPI's sprites, then
 * a readable text token — so nothing ever renders as a broken image.
 * ------------------------------------------------------------------ */
function useFallbackChain(sources: string[]) {
  const [i, setI] = useState(0);
  const key = sources.join("|");
  const seen = useRef(key);
  if (seen.current !== key) {
    seen.current = key;
    if (i !== 0) setI(0);
  }
  return { src: sources[i] ?? null, next: () => setI((n) => n + 1) };
}

export function MonArt({
  name,
  item,
  variant,
  hit,
}: {
  name: string;
  item?: string;
  variant: "row" | "card";
  /** This slot is what the current search matched — ring it so the row
   *  says why it's in the list. */
  hit?: boolean;
}) {
  const r = resolveMon(name, item);
  const sources: string[] = [];
  // Champions menu icons first when downloaded, then PokéAPI's flat 2D
  // sprites. Deliberately NOT the 3D "home" renders — and not PokéAPI's own
  // menu icons either, which stop at gen 8 and so miss most of a modern field.
  if (r.championsIcon) sources.push(r.championsIcon);
  if (r.dexId !== null) sources.push(`/api/sprite/pokemon/${r.dexId}`);

  const { src, next } = useFallbackChain(sources);
  const short = name.replace(/\s*\[.*\]$/, "").slice(0, 4);
  const label = r.types.length ? `${name} — ${r.types.join(" / ")}` : name;

  if (variant === "card") {
    return (
      <span className="art" title={label}>
        {src ? (
          <img src={src} alt={name} loading="lazy" onError={next} />
        ) : (
          <span className="tag">{short}</span>
        )}
      </span>
    );
  }

  return (
    <span className={`mon${hit ? " hit" : ""}`} title={label}>
      {src ? (
        <img src={src} alt={name} loading="lazy" onError={next} />
      ) : (
        <span className="tag">{short}</span>
      )}
    </span>
  );
}

/**
 * Held-item art, same shape as MonArt above: self-hosted bag sprites first
 * (only present after `npm run fetch:items`), then PokéAPI, then a mark.
 *
 * The local set is the one that matters. PokéAPI's *API* knows Fairy Feather
 * perfectly well — the sprite field is just null — and the same goes for
 * Booster Energy, the Punching Glove and every Mega Stone past gen 8, because
 * its sprite repo stops there. That's most of a modern field's items, so
 * without the download this is mostly marks.
 *
 * A held item is still a held item, so the last resort is a mark and not a
 * gap: a polished dot for something that reads as a Mega Stone, an empty
 * inventory slot for everything else. Only a genuinely empty hand renders
 * nothing. The item's name is already spelled out beside this in both callers,
 * which is what makes the mark safe to leave unlabelled.
 */
export function ItemArt({ item, isStone }: { item: string; isStone: boolean }) {
  const sources: string[] = [];
  if (item) {
    const local = itemIcon(item);
    if (local) sources.push(local);
    sources.push(`/api/sprite/item/${itemSlug(item)}`);
  }
  const { src, next } = useFallbackChain(sources);

  if (!item) return null;
  if (!src) return <span className={isStone ? "stone" : "noart"} aria-hidden="true" />;
  return <img src={src} alt="" loading="lazy" onError={next} />;
}

/* ------------------------------------------------------------------ *
 * Explain: what a move, item or ability actually does.
 *
 * A team list is a wall of proper nouns. Someone who doesn't have the
 * whole format memorised can read a Pokémon's six slots and learn
 * nothing from four of them, and the page can answer that without
 * sending them elsewhere.
 * ------------------------------------------------------------------ */

/** How long the pointer has to rest on a word before it counts as asking. */
const HOVER_MS = 120;

/** Roughly what an open panel needs below the word. Only used to decide
 *  whether to hang it above instead, so it doesn't have to be exact. */
const PANEL_H = 190;

interface Anchor {
  left: number;
  /** Distance from the viewport top, or from its bottom when flipped. */
  y: number;
  flip: boolean;
}

/**
 * Where the panel goes. Fixed to the viewport rather than to the word, which
 * is what lets it escape the several scroll containers and `overflow: hidden`
 * pills these words live inside — the bracket's board, the usage tally rows.
 *
 * When there's no room below, the panel is anchored by its *bottom* edge
 * instead of its top. That way it doesn't need its own height measured, which
 * would mean rendering it once to find out and moving it on the next frame.
 */
function anchorFor(el: HTMLElement): Anchor {
  const r = el.getBoundingClientRect();
  const width = Math.min(300, window.innerWidth - 16);
  const flip = r.bottom + PANEL_H > window.innerHeight && r.top > PANEL_H;
  return {
    left: Math.max(8, Math.min(r.left, window.innerWidth - 8 - width)),
    y: flip ? window.innerHeight - r.top + 8 : r.bottom + 8,
    flip,
  };
}

export function Explain({
  kind,
  term,
  className,
}: {
  kind: EffectKind;
  term: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<Anchor | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const id = useId();

  const entry = useTermEffect(kind, term, open);

  const show = () => {
    if (btn.current) setAt(anchorFor(btn.current));
    setOpen(true);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setOpen(false);
  };

  // Anything that moves the word out from under the panel closes it. Capture,
  // because the scrolling is usually happening in a container below this —
  // the bracket board, the modal's own body — and not on the window.
  useEffect(() => {
    if (!open) return;
    const away = () => setOpen(false);
    window.addEventListener("scroll", away, true);
    window.addEventListener("resize", away);
    return () => {
      window.removeEventListener("scroll", away, true);
      window.removeEventListener("resize", away);
    };
  }, [open]);

  // Tapping elsewhere dismisses. Only bound while open, and only matters on
  // touch — a pointer leaving the word has already closed it.
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!btn.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  useEffect(() => () => clearTimeout(timer.current), []);

  // A word with nothing to say about it stops offering: no underline, no tab
  // stop, just the text. The first hover is what finds that out, and the answer
  // is cached, so this settles on its own without a round trip per render.
  //
  // Not while it's open, though: a keyboard user reaching a term with no entry
  // would focus a button that then unmounted under them, dropping focus to the
  // body. It degrades on the way out instead.
  if (!term || (entry === null && !open)) {
    return <span className={className}>{term}</span>;
  }

  return (
    // The panel is a sibling of the button, not a child. Inside it, its whole
    // text would be swept into the button's accessible name and a screen
    // reader would announce the explanation as the button's label.
    <span className="termwrap">
      <button
        type="button"
        ref={btn}
        className={`term${open && entry ? " on" : ""}${className ? ` ${className}` : ""}`}
        // Suppresses the ancestor's native tooltip. The usage tally rows carry
        // a `title` on the row itself, and without this the browser would find
        // it by walking up from here and fade a second, worse explanation over
        // the top of this one.
        title=""
        aria-describedby={open && entry ? id : undefined}
        onPointerEnter={(e) => {
          // Touch raises this too, immediately before the click that toggles —
          // which would open and then close again in one tap.
          if (e.pointerType !== "mouse") return;
          clearTimeout(timer.current);
          timer.current = setTimeout(show, HOVER_MS);
        }}
        onPointerLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => {
          // These sit inside rows that expand on click in two of the three
          // places they appear.
          e.stopPropagation();
          if (open) hide();
          else show();
        }}
        onKeyDown={(e) => {
          if (e.key !== "Escape" || !open) return;
          // The bracket's match modal listens for Escape on the document, and
          // under the App Router React's own root is *also* the document — so
          // the two listeners are siblings on one node, and plain
          // stopPropagation doesn't reach the second. Without the immediate
          // form, dismissing a popover tears down the whole match behind it.
          e.nativeEvent.stopImmediatePropagation();
          hide();
        }}
      >
        {term}
      </button>

      {open && entry && at && (
        <span
          id={id}
          role="tooltip"
          className={`xpop${at.flip ? " up" : ""}`}
          style={
            at.flip
              ? { left: at.left, bottom: at.y }
              : { left: at.left, top: at.y }
          }
        >
          <span className="xname">{term}</span>

          {isMove(entry) && (
            <>
              <span className="xchips">
                {entry.type && (
                  <span
                    className="typepill"
                    style={{ background: typeColor(entry.type) }}
                  >
                    <TypeIcon type={entry.type as PokemonType} size={10} />
                    {entry.type}
                  </span>
                )}
                {entry.class && <span className="xclass">{classShort(entry.class)}</span>}
              </span>
              <span className="xstats">
                {/* A status move has no power and Aerial Ace cannot miss.
                    Both print an em dash: the row is always the same four
                    figures in the same places, so they can be read across
                    moves without hunting for which one is missing. */}
                <b>{entry.power ?? "—"}</b> pow
                <i />
                <b>{entry.acc ?? "—"}</b> acc
                <i />
                <b>{entry.pp ?? "—"}</b> pp
                {entry.pri !== 0 && (
                  <>
                    <i />
                    <b className={entry.pri > 0 ? "up" : "dn"}>
                      {entry.pri > 0 ? `+${entry.pri}` : entry.pri}
                    </b>{" "}
                    pri
                  </>
                )}
              </span>
            </>
          )}

          {entry.text && <span className="xtext">{entry.text}</span>}
        </span>
      )}
    </span>
  );
}

/**
 * Where this species' own entry lives on the usage tab, with its panel
 * already open. The event and division are lifted off the current URL the
 * same way `Nav` does it, so the jump keeps your place instead of landing on
 * whatever event the usage page defaults to.
 *
 * Read at render rather than through `useSearchParams`, which on these
 * statically-rendered pages would want a Suspense boundary around every
 * caller. A card only ever exists after a click — an expanded row, an opened
 * match — so there is no server pass for the two to disagree on.
 */
function usageHref(name: string) {
  const here = new URLSearchParams(
    typeof window === "undefined" ? "" : window.location.search,
  );
  const qs = new URLSearchParams();
  for (const key of ["tid", "division"]) {
    const v = here.get(key);
    if (v) qs.set(key, v);
  }
  qs.set("mon", name);
  return `/usage?${qs}`;
}

/**
 * One move, as a pill that says what type it is before it says its name.
 *
 * The typing comes from the build's own table rather than from the effect
 * popover, which only fetches on hover — all four slots need a colour on the
 * first paint, and waiting for four round trips would mean the card changed
 * colour under anyone who moved a pointer across it.
 *
 * A move no dataset knows about still gets the disc, empty and neutral. The
 * alternative is a row that starts its name where the others start their
 * icon, and one misaligned line costs more than an unexplained grey dot.
 */
function MoveRow({ move }: { move: string }) {
  const type = moveType(move);
  return (
    <span
      className="mvrow"
      style={{
        // A layer, not a fill: .mvrow already owns background-color, and this
        // washes the type over it. Two identical stops is the shortest way to
        // spend a gradient on a flat colour.
        backgroundImage: `linear-gradient(${typeTint(type, 0.16)}, ${typeTint(type, 0.16)})`,
        borderColor: typeTint(type, 0.34),
      }}
    >
      <span className="ty" style={{ background: typeColor(type ?? undefined) }}>
        {type && <TypeIcon type={type as PokemonType} size={10} />}
      </span>
      {/* Named, because a move with nothing to explain drops the button and
          renders as a bare span — and the pill has to squeeze either one. */}
      <Explain kind="move" term={move} className="mvname" />
    </span>
  );
}

/** One team slot: artwork, typing, held item, spread and moves. Shared by
 *  the standings' expanded row and the bracket's match detail. */
export function MonCard({ mon, hit }: { mon: Mon; hit?: boolean }) {
  const r = resolveMon(mon.name, mon.item);
  const types = r.types;
  const megaLabel = r.slug?.match(/-mega(?:-([xy]))?$/);

  return (
    <div className={`moncard${hit ? " hit" : ""}`}>
      {/* Top right, in the gap beside the artwork — the one corner of the
          card no content reaches. "This Pokémon, across the whole event":
          the card says what one player brought, and the usage tab answers
          what everyone else did with the same species. */}
      <Link
        className="tousage"
        href={usageHref(mon.name)}
        title={`${mon.name} across the event — items, moves, teammates`}
        aria-label={`See event-wide usage for ${mon.name}`}
        // The bracket's cards sit inside a modal and the standings' inside a
        // row that expands on click; neither should also fire on the way out.
        onClick={(e) => e.stopPropagation()}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <path
            d="M13.5 4H20v6.5M20 4l-8.4 8.4M17 14v4.5A1.5 1.5 0 0 1 15.5 20h-10A1.5 1.5 0 0 1 4 18.5v-10A1.5 1.5 0 0 1 5.5 7H10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>

      <div className="body">
        <MonArt name={mon.name} item={mon.item} variant="card" />
        <div className="info">
          <span className="n">
            {/* Its own element, not a bare text node: an anonymous flex item
                can't be given text-overflow, and this one has to give way so
                the badge beside it never wraps. */}
            <span className="sp" title={mon.name}>
              {mon.name}
            </span>
            {megaLabel && (
              <span className="mega">
                MEGA{megaLabel[1] ? ` ${megaLabel[1].toUpperCase()}` : ""}
              </span>
            )}
            {r.megaUnknown && <span className="mega">MEGA?</span>}
          </span>

          {types.length > 0 && (
            <span className="typepills">
              {types.map((t) => (
                <span
                  key={t}
                  className="typepill"
                  style={{ background: typeColor(t) }}
                >
                  <TypeIcon type={t} size={11} />
                  {t}
                </span>
              ))}
            </span>
          )}

          <span className="held">
            <ItemArt item={mon.item} isStone={r.isMega || r.megaUnknown} />
            <Explain kind="item" term={mon.item} />
          </span>
          <span className="d">
            <Explain kind="ability" term={mon.ability} /> · {mon.nature}
          </span>
          {/* One pill per move, stacked, each carrying its own typing on the
              left. Four names run together on one line read as a single
              string of jargon; four rows that each start with a colour are a
              movepool you can take in without reading it — the Fire slot, the
              two Ghost slots, the status move. The disc is a solid type fill
              with a white glyph on it, the same treatment as the typing pills
              above, and the row behind it is that colour at a wash so the
              name still sits on --ink. */}
          <span className="mv">
            {mon.moves.map((mv, i) => (
              <MoveRow key={`${mv}-${i}`} move={mv} />
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Polling hook. Reads through our own proxy route, which is what makes
 * this possible at all — pokedata sends no CORS headers, so the browser
 * cannot fetch it directly.
 * ------------------------------------------------------------------ */
export interface EventMeta {
  players: number | null;
  round: number | null;
  rounds: number | null;
  /** Players in the bracket (8, 16, …), derived — see below. null until cut. */
  cutSize: number | null;
  playing: number | null;
  tieRate: string | null;
  /** The bracket has resolved, or upstream stopped touching the file. */
  ended: boolean;
  /** Upstream's last write — the finish time once an event is over. */
  finishedAt: number | null;
}
const NO_META: EventMeta = {
  players: null, round: null, rounds: null, cutSize: null, playing: null,
  tieRate: null, ended: false, finishedAt: null,
};

/** Longer than any real gap inside an event — a Friday night to Saturday
 *  morning break is ~12h — so nothing running trips it. */
const IDLE_MS = 24 * 60 * 60 * 1000;

/**
 * Has the event actually produced a result? This is the gate on the gold —
 * the filled leader card and the crown — so it only ever says yes to
 * something that has happened.
 *
 * The plain reading is the scraped header line: the last round is the one on
 * the board and no table is still out. A missing header means the scrape
 * didn't parse, and an event we know nothing about is still running — never
 * crown on a guess, which is why every null is a no.
 *
 * `ended` carries the case that fraction can't reach. Once the cut starts,
 * upstream keeps counting past the Swiss total ("Round 13/11"), so
 * round === rounds never comes true again for an event with a bracket; the
 * useStandings maths above resolves those, and it's the same flag the
 * masthead already prints "Ended · final standings" from.
 */
export function eventFinished(meta: EventMeta): boolean {
  const lastRoundIn =
    meta.round !== null &&
    meta.rounds !== null &&
    meta.round === meta.rounds &&
    meta.playing === 0;
  return lastRoundIn || meta.ended;
}

export function useStandings(
  tid: string,
  division: Division,
  intervalMs = 30_000,
) {
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [meta, setMeta] = useState<EventMeta>(NO_META);
  const [source, setSource] = useState<Source>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const keyRef = useRef(`${tid}/${division}`);
  keyRef.current = `${tid}/${division}`;
  const endedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    // Drop the previous event's rows: showing them under a new event's
    // header would be a lie, and it's what the skeleton is for. Polling the
    // *same* event doesn't come through here, so refreshes never flash.
    setLoading(true);
    setPlayers(null);
    setMeta(NO_META);
    setSource(null);
    setFetchedAt(null);
    setError(null);
    endedRef.current = false;

    const tick = async () => {
      // A finished event has nothing left to say, so the polling stops for
      // good once one is detected — switching events resets this.
      if (endedRef.current) return;
      // Never poll a tab nobody is looking at.
      if (document.visibilityState === "visible") {
        try {
          // Read per request rather than held in state: the route needs to be
          // told the tools are on to serve a fixture, and threading that
          // through as a dependency would refetch a real event for nothing.
          const res = await fetch(
            `/api/standings/${tid}/${division}${toolsOn() ? "?tools=1" : ""}`,
          );
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const raw: RawPlayer[] = await res.json();
          if (!alive || keyRef.current !== `${tid}/${division}`) return;
          const rows = normalize(raw);
          setPlayers(rows);

          const num = (h: string) => {
            const v = res.headers.get(h);
            return v && /^\d+$/.test(v) ? Number(v) : null;
          };
          // Two sources disagree about the current round, and either can lead.
          // The header line is scraped from a page on its own refresh cycle: at
          // Worlds it read "Round 13/11" while round 14 pairings were already in
          // the file, which put the whole strip a stage behind. The file can
          // also trail, when the round is called before pairings are written.
          // Whichever is further along is the round people are watching.
          const played = rows.reduce(
            (m, p) => Math.max(m, p.matches.at(-1)?.round ?? 0),
            0,
          );
          const round = Math.max(num("x-round") ?? 0, played) || null;
          const rounds = num("x-rounds");

          // Nothing upstream announces the bracket size, but the first
          // post-Swiss round contains exactly the players who made cut — so
          // counting them gives it. A missing row (someone's record not up
          // yet) can only round the count down, so snap to the power of two
          // at or above the count: brackets have no other legal size.
          const counted =
            round && rounds && round > rounds
              ? rows.filter((p) => p.matches.some((m) => m.round === rounds + 1)).length
              : 0;
          const inCut = counted >= 2 ? 2 ** Math.ceil(Math.log2(counted)) : 0;

          // Nothing upstream says "finished" — no field, no flag. But a
          // bracket of `cutSize` takes log2 of it to resolve, so the last
          // round number is knowable, and an event is over when that round
          // is played out: no table still out, and every pairing in it has a
          // result (mid-match, pokedata writes the pairing with result null).
          const playing = num("x-playing");
          const finalRound =
            rounds && inCut >= 2 ? rounds + Math.ceil(Math.log2(inCut)) : null;
          const settled =
            round !== null &&
            !raw.some((p) => p.rounds?.[round] && !p.rounds[round].result);
          const bracketDone =
            finalRound !== null &&
            round !== null &&
            round >= finalRound &&
            (playing ?? 0) === 0 &&
            settled;

          // The backstop: their file mtime is the "last updated" the site
          // shows, and it covers what the round maths can't — events whose
          // header line doesn't parse, brackets that never finished, and
          // anything old enough that the shape has since changed.
          const modified = Date.parse(res.headers.get("x-upstream-modified") ?? "");
          const finishedAt = Number.isNaN(modified) ? null : modified;
          const idle = finishedAt !== null && Date.now() - finishedAt > IDLE_MS;

          const ended = bracketDone || idle;
          endedRef.current = ended;

          setMeta({
            players: num("x-players") ?? rows.length,
            round,
            rounds,
            cutSize: inCut >= 2 ? inCut : null,
            playing,
            tieRate: res.headers.get("x-tierate"),
            ended,
            finishedAt,
          });
          const src = res.headers.get("x-source");
          setSource(src === "live" || src === "fixture" ? src : "sample");
          setFetchedAt(Date.now());
          setError(null);
        } catch (e) {
          if (alive) setError(e instanceof Error ? e.message : "fetch failed");
        } finally {
          if (alive) setLoading(false);
        }
      }
      if (alive && !endedRef.current) timer = setTimeout(tick, intervalMs);
    };

    tick();
    document.addEventListener("visibilitychange", tick);
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [tid, division, intervalMs]);

  return { players, meta, source, fetchedAt, error, loading };
}

/** Row density, remembered per browser. */
export function useDensity() {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    let saved = false;
    try { saved = localStorage.getItem("pokedata-demo:compact") === "1"; } catch {}
    setCompact(saved);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-density", compact ? "compact" : "comfortable");
    try { localStorage.setItem("pokedata-demo:compact", compact ? "1" : "0"); } catch {}
  }, [compact]);

  return { compact, toggle: () => setCompact((v) => !v) };
}

/**
 * The density switch. Two chevrons that point apart when rows are roomy and
 * flip to point at each other when they're compact — so the icon shows the
 * state, not just the action, and needs no label. (The
 * old "Compact"/"Comfortable" text named the *action*, which is why nobody
 * could tell which state they were in.) The tooltip and aria-label still state
 * the current density for anyone who needs the words.
 */
export function DensityToggle({ compact, onToggle }: { compact: boolean; onToggle: () => void }) {
  return (
    <button
      className="pill densbtn"
      onClick={onToggle}
      aria-pressed={compact}
      title={compact ? "Compact rows — click for roomier" : "Roomy rows — click to fit more on screen"}
      aria-label={compact ? "Row height: compact" : "Row height: roomy"}
    >
      <svg className="dens" viewBox="0 0 20 20" width="17" height="17" aria-hidden="true">
        <path className="ch up" d="M6.2 6.8 L10 3 L13.8 6.8" />
        <path className="ch dn" d="M6.2 13.2 L10 17 L13.8 13.2" />
      </svg>
    </button>
  );
}

/** The one key the theme switch owns. Read by the inline script in `layout`. */
const THEME_KEY = "pokedata-demo:theme";

/**
 * Light or dark, and how it was decided.
 *
 * Until someone touches the switch there is no `data-theme` attribute at all,
 * so the palette comes from `prefers-color-scheme` and follows the OS the
 * moment it changes — that path is the default and stays the default. A click
 * writes the attribute and the key, and from then on the choice outranks the
 * OS. `dark` is only what the *label* says; the glyph itself is picked in CSS
 * off the same three cases that pick the palette, which is why it's right in
 * the server's HTML and can't flash the wrong sky before this mounts.
 */
export function useTheme() {
  const [choice, setChoice] = useState<"light" | "dark" | null>(null);
  const [sysDark, setSysDark] = useState(false);

  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch {}
    if (saved === "light" || saved === "dark") setChoice(saved);

    // Tracked even when a choice is stored: clearing the key in devtools should
    // hand the page back to the OS without a reload.
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setSysDark(mq.matches);
    const sync = (e: MediaQueryListEvent) => setSysDark(e.matches);
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const dark = choice ? choice === "dark" : sysDark;

  return {
    dark,
    toggle: () => {
      const next = dark ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem(THEME_KEY, next); } catch {}
      setChoice(next);
    },
  };
}

/**
 * The theme switch: a sun in light, a crescent in dark. Like the density
 * chevrons it shows the state rather than the action, and for the same reason
 * — an icon naming what you'd get instead of what you have leaves you unable
 * to tell which one you're in. The words are in the tooltip and the label.
 */
export function ThemeToggle() {
  const { dark, toggle } = useTheme();
  return (
    <button
      className="pill themebtn"
      onClick={toggle}
      title={dark ? "Dark theme — click for light" : "Light theme — click for dark"}
      aria-label={dark ? "Colour theme: dark" : "Colour theme: light"}
    >
      <span className="th" aria-hidden="true">
        <svg className="sun" viewBox="0 0 20 20" width="17" height="17">
          <circle cx="10" cy="10" r="3.5" />
          <path d="M10 2.5v1.7M10 15.8v1.7M2.5 10h1.7M15.8 10h1.7M4.7 4.7l1.2 1.2M14.1 14.1l1.2 1.2M15.3 4.7l-1.2 1.2M5.9 14.1l-1.2 1.2" />
        </svg>
        <svg className="moon" viewBox="0 0 20 20" width="17" height="17">
          <path d="M17.1 11.2A7.2 7.2 0 1 1 8.8 2.9 5.6 5.6 0 0 0 17.1 11.2z" />
        </svg>
      </span>
    </button>
  );
}

/**
 * Is the developer switch on, in this browser?
 *
 * Read after mount rather than during render: the server has no localStorage
 * and would always say no, so reading it any earlier is a hydration mismatch.
 * The page therefore renders once without the tools and once with, which is
 * why nothing here may affect layout — see `useCircuit`.
 */
export function useTools(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(toolsOn()), []);
  return on;
}

/**
 * The server's event list, plus the fixtures when the tools are on.
 *
 * They're appended, never prepended: the pages open on the first entry that
 * has a tid, and landing on a synthetic tournament by default would be a trap.
 * The picker sorts by date anyway, so position here costs nothing.
 *
 * Merged in the browser because that's the only place the switch can be read.
 * The server builds the same list either way, so a reader who never sets the
 * flag is served exactly the page they were served before this existed.
 */
export function useCircuit(circuit: CircuitEvent[]): CircuitEvent[] {
  const tools = useTools();
  return useMemo(
    () => (tools ? [...circuit, ...toCircuit(fixtureEvents())] : circuit),
    [circuit, tools],
  );
}

/** The first entry that has a tid, or the URL's when the list contains it. */
const openingTid = (circuit: CircuitEvent[], initial?: string): string =>
  initial && circuit.some((e) => e.tid === initial)
    ? initial
    : (circuit.find((e) => e.tid)?.tid ?? "0000191");

/**
 * Which event is open, and the state that tracks it.
 *
 * The URL can name a fixture: the pages write `?tid=` as you browse, so
 * reloading while reading one is ordinary. Whether that tid means anything,
 * though, is a localStorage answer the server doesn't have — and opening on a
 * fixture whose tools have since been switched off is exactly how the picker
 * ends up reading "Choose an event" above rows from the bundled sample, with
 * no badge and no dates, because nothing in the list matches the tid.
 *
 * So the first render always resolves to a real event, which the server and
 * the client agree on, and a fixture named in the URL is adopted straight
 * after mount — only if the tools turn out to be on. With them off the stale
 * tid is simply dropped, and the effect that keeps the URL in step rewrites it
 * to whatever really opened.
 */
export function useEventTid(circuit: CircuitEvent[], initial?: string) {
  const [tid, setTid] = useState(() => openingTid(circuit, initial));
  const settled = useRef(false);

  useEffect(() => {
    if (settled.current) return;
    settled.current = true;
    if (initial && isFixtureTid(initial) && toolsOn()) setTid(initial);
  }, [initial]);

  return [tid, setTid] as const;
}

/* ------------------------------------------------------------------ *
 * Grow / shrink
 * ------------------------------------------------------------------ */

/** How long a panel takes to grow or shrink. Shared with `.collapse` in
 *  globals.css — the two have to agree or a closing panel is cut off. */
export const COLLAPSE_MS = 240;

const stillness = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * `value`, but a null lingers for the length of a shrink.
 *
 * Which row is open and which row is *on screen* are two different things the
 * moment there's an exit animation: the second has to outlive the first by
 * however long the panel takes to close. Callers render off this and set off
 * the plain state, so nothing else has to know about the delay.
 */
export function useLingering<T>(value: T | null, ms = COLLAPSE_MS): T | null {
  const [held, setHeld] = useState(value);

  useEffect(() => {
    if (value !== null || stillness()) {
      setHeld(value);
      return;
    }
    const t = setTimeout(() => setHeld(null), ms);
    return () => clearTimeout(t);
  }, [value, ms]);

  return value ?? held;
}

/**
 * Grow / shrink for a panel whose height nobody knows until it has rendered.
 *
 * A one-row grid can transition its track between `0fr` and `1fr`, and the
 * child clipping itself at `min-height: 0` turns that into a height
 * animation — no measuring, and no magic max-height that has to be kept above
 * the tallest team list anyone might ever bring.
 *
 * Nothing in here transforms, deliberately. The explain popovers inside these
 * panels are `position: fixed` precisely so they can escape the clipping, and
 * a transformed ancestor — even one present for a fifth of a second — would
 * make them resolve against this box instead. Opacity is safe: it opens a
 * stacking context, not a containing block.
 *
 * Mount it only for the row being shown (see `useLingering`). A standings page
 * is several hundred rows, and building every team list to have something to
 * shrink would cost far more than the animation is worth.
 */
export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  // Always starts closed, including on first mount, so a panel that is open
  // from the first paint — /usage?mon=… — grows in like any other.
  const [grown, setGrown] = useState(false);

  useEffect(() => {
    if (!open) {
      setGrown(false);
      return;
    }
    // Two frames: one for the child to mount at 0fr, one for the browser to
    // take that in. Without the second there is no start value to move from
    // and the panel simply appears.
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setGrown(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [open]);

  return (
    <div className={`collapse${grown ? " open" : ""}`}>
      <div className="clip">{children}</div>
    </div>
  );
}

/**
 * The bracket as its rounds are actually named: a top 8 is "Top 8", "Top 4",
 * "Finals" — three rounds, each halving the field. The last one is never
 * called "Top 2", which is the only special case here.
 */
export function cutStages(size: number): string[] {
  const stages: string[] = [];
  for (let left = size; left >= 2 && stages.length < 6; left /= 2) {
    stages.push(left === 2 ? "Finals" : `Top ${left}`);
  }
  return stages;
}

/** Which stage a given absolute round number is, or null while still in Swiss. */
export function stageOf(round: number, rounds: number, cutSize: number | null) {
  const nth = round - rounds; // 1 = first bracket round
  if (nth < 1) return null;
  return { nth, name: cutSize ? (cutStages(cutSize)[nth - 1] ?? null) : null };
}

/**
 * How a bracket exit reads on a standings row.
 *
 * The round number is right for Swiss — "dropped R5" is how people talk — and
 * wrong here: R12 means nothing unless you already know Swiss ran 11 rounds.
 * The bracket columns and the match modal name this round through `stageOf`,
 * so the row says the same word they do.
 */
export function outStage(
  round: number,
  rounds: number | null,
  cutSize: number | null,
): string | null {
  const at = rounds === null ? null : stageOf(round, rounds, cutSize);
  const stages = cutSize ? cutStages(cutSize) : [];
  // `cutSize` resolves a round late, so there is a window where the stage has
  // no name yet. A number we can explain beats a stage we would be guessing —
  // the same fallback ladder BracketBoard walks.
  if (!at?.name) return `out R${round}`;
  // Nothing for a finals loss: the rank disc beside it already reads 2, and
  // "out in Finals" is that same fact said twice.
  return at.nth === stages.length ? null : `out in ${at.name}`;
}

/**
 * The event's shape in one strip: rounds played, the one running, the rest.
 *
 * Swiss and the bracket are two different things counted in one sequence
 * upstream, so they get two groups of dots with a divider between. The bracket
 * group is one dot per stage, each named on hover. If the cut is under way but
 * its size hasn't resolved yet, the group grows a dot per round rather than
 * guess a length it doesn't know.
 */
export function RoundProgress({
  round,
  rounds,
  cutSize,
  ended,
}: {
  round: number | null;
  rounds: number | null;
  cutSize?: number | null;
  ended?: boolean;
}) {
  if (!round || !rounds || rounds > 24) return null;

  const stages = cutSize && cutSize >= 2 ? cutStages(cutSize) : [];
  const cutPlayed = Math.max(0, round - rounds); // bracket rounds reached
  const cutTotal = Math.min(6, Math.max(cutPlayed, stages.length));

  // Once the event is over there is no round in progress — the last one is
  // finished like the rest, and a dot left pulsing would claim otherwise.
  const dot = (n: number, extra = "") =>
    `${extra}${n < round || (ended && n === round) ? " done" : n === round ? " now" : ""}`.trim();

  const here = stageOf(round, rounds, cutSize ?? null);

  return (
    <span
      className="prog"
      title={
        here
          ? `${here.name ?? `Bracket round ${here.nth}`} · Swiss ${rounds} rounds complete`
          : `Round ${round} of ${rounds}`
      }
      aria-hidden="true"
    >
      {Array.from({ length: rounds }, (_, i) => (
        <i key={i} className={dot(i + 1)} title={`Round ${i + 1}`} />
      ))}
      {cutTotal > 0 && (
        <>
          <i className="gap" />
          {Array.from({ length: cutTotal }, (_, i) => (
            <i
              key={`c${i}`}
              className={dot(rounds + i + 1, "cut")}
              title={stages[i] ?? `Bracket round ${i + 1}`}
            />
          ))}
        </>
      )}
    </span>
  );
}

export function useAgo(since: number | null) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  if (!since) return "";
  const s = Math.max(0, Math.round((Date.now() - since) / 1000));
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ${s % 60}s ago`;
}

/**
 * The rank disc. Ranks 2 and below are a numeral and nothing else.
 *
 * Rank 1 carries both the numeral and the crown, stacked in the same grid
 * cell, so the moment an event finishes is a cross-fade rather than a pop —
 * the "1" shrinks away as the crown scales up in its place. Both stay in the
 * DOM the whole time: the numeral is only ever transparent, so the rank is
 * still there to be read out, and the crown is decoration the row's own
 * ordering already states.
 */
export function RankDisc({
  placing,
  crowned = false,
}: {
  placing: number;
  crowned?: boolean;
}) {
  if (placing !== 1) return <span className="rk">{placing}</span>;

  return (
    <span
      className={`rk swap${crowned ? " crowned" : ""}`}
      title={crowned ? "Winner" : undefined}
    >
      <span className="num">1</span>
      <svg className="crown" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M3 7.9 L7.6 11 L12 4.6 L16.4 11 L21 7.9 L19.2 17.3 L4.8 17.3 Z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M5.4 19.6 H18.6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

/** Star toggle. It's laid *over* a clickable row rather than inside one — a
 *  button can't legally contain another — but it still stops propagation, so
 *  it stays safe to drop into any container that carries its own click. */
export function StarButton({
  name,
  on,
  onToggle,
  size = 16,
}: {
  name: string;
  on: boolean;
  onToggle: (name: string) => void;
  size?: number;
}) {
  return (
    <button
      className={`star${on ? " on" : ""}`}
      aria-pressed={on}
      aria-label={on ? `Remove ${name} from favourites` : `Add ${name} to favourites`}
      title={on ? "Remove from favourites" : "Add to favourites"}
      onClick={(e) => {
        e.stopPropagation();
        onToggle(name);
      }}
    >
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
        <path
          d="M12 3.2l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.2 6.6 20.1l1-6.1L3.2 9.7l6.1-.9L12 3.2z"
          fill={on ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Loading skeletons. Same grid, same row height, same circles as the
 * real thing — so when the data lands nothing jumps. Widths are derived
 * from the index rather than randomised, otherwise server and client
 * would disagree on the markup.
 * ------------------------------------------------------------------ */

/** Deterministic pseudo-variation so the placeholder names aren't a
 *  suspiciously even comb. */
const jitter = (i: number, lo: number, hi: number) =>
  lo + ((i * 37) % 100) / 100 * (hi - lo);

export function StandingsSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div className="skwrap" role="status" aria-live="polite">
      <span className="sr">Loading standings…</span>
      {Array.from({ length: rows }, (_, i) => (
        <div className="row skrow" key={i} aria-hidden="true">
          <span className="rk sk" />
          <span className="sk skstar" />
          <span className="who">
            <span className="sk skline" style={{ width: `${jitter(i, 44, 82)}%` }} />
            <span className="sk skline sm" style={{ width: `${jitter(i, 22, 40)}%` }} />
          </span>
          <span className="team">
            {Array.from({ length: 6 }, (_, k) => (
              <span className="mon sk" key={k} />
            ))}
          </span>
          <span className="sk skline c" style={{ width: "2.6rem" }} />
          <span className="sk skline c" style={{ width: "1.4rem" }} />
          <span className="sk skline c" style={{ width: "2.2rem" }} />
          <span className="sk skline c" style={{ width: "2.4rem" }} />
        </div>
      ))}
    </div>
  );
}

export function UsageSkeleton({ rows = 12 }: { rows?: number }) {
  return (
    <div className="skwrap" role="status" aria-live="polite">
      <span className="sr">Loading usage…</span>
      {Array.from({ length: rows }, (_, i) => (
        <div className="usagerow skrow" key={i} aria-hidden="true">
          <span className="pos sk" />
          <span className="mon sk" />
          <span className="sk skline" style={{ width: `${jitter(i, 40, 78)}%` }} />
          {/* The bar shrinks down the list, the way real usage does. */}
          <span className="bar sk" style={{ width: `${92 - i * 6}%` }} />
          <span className="sk skline c" style={{ width: "1.8rem" }} />
          <span className="sk skline c" style={{ width: "2.4rem" }} />
        </div>
      ))}
    </div>
  );
}

/**
 * The bracket's own skeleton. Slots are the real thing's geometry — a Top 8
 * hanging off eight play-in cards — so the wires and columns don't jump when
 * the data lands. Fixed, not randomised, so server and client agree.
 */
export function BracketSkeleton() {
  const cols: number[][] = [[0, 1, 2, 3, 4, 5, 6, 7], [0.5, 2.5, 4.5, 6.5], [1.5, 5.5]];
  return (
    <div className="bwrap" role="status" aria-live="polite">
      <span className="sr">Loading bracket…</span>
      <div
        className="bracket"
        aria-hidden="true"
        style={{ "--bcols": cols.length } as React.CSSProperties}
      >
        {cols.map((slots, depth) =>
          slots.map((slot) => (
            <div
              className="bnode sk"
              key={`${depth}-${slot}`}
              style={{ gridColumn: depth + 1, gridRow: `${slot * 2 + 1} / span 2` }}
            />
          )),
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Shared chrome
 * ------------------------------------------------------------------ */

export type Section = "standings" | "usage" | "bracket";

export function Nav({ active }: { active: Section }) {
  // The event and division live in the URL already; Link picks them up from
  // window.location so the section switch never loses your place.
  const qs = typeof window === "undefined" ? "" : window.location.search;
  return (
    <nav className="nav" aria-label="Sections">
      <Link href={`/${qs}`} aria-current={active === "standings" ? "page" : undefined}>
        Standings
      </Link>
      <Link href={`/usage${qs}`} aria-current={active === "usage" ? "page" : undefined}>
        Usage
      </Link>
      <Link href={`/bracket${qs}`} aria-current={active === "bracket" ? "page" : undefined}>
        Bracket stage
      </Link>
    </nav>
  );
}

/** Header A: the event is the headline, with round progress and live state. */
export function Masthead({
  circuit,
  tid,
  onPick,
  meta,
  source,
  ago,
  loading,
  hasData,
}: {
  circuit: CircuitEvent[];
  tid: string;
  onPick: (tid: string) => void;
  meta: EventMeta;
  source: Source;
  ago: string;
  loading: boolean;
  hasData: boolean;
}) {
  const event = circuit.find((e) => e.tid === tid);
  const live = source === "live" && !meta.ended;
  const stage =
    meta.round && meta.rounds ? stageOf(meta.round, meta.rounds, meta.cutSize) : null;

  return (
    <div className="mast-top">
      <div className="mast-id">
        <span className="l1">
          {event && <span className="badge">{event.tier}</span>}
          <EventPicker circuit={circuit} tid={tid} onPick={onPick} />
        </span>
        <span className="l2">
          {event?.dates && <span className="meta">{event.dates}</span>}
          <RoundProgress
            round={meta.round}
            rounds={meta.rounds}
            cutSize={meta.cutSize}
            ended={meta.ended}
          />
          {(meta.ended || meta.round) && (
            // Three things this one chip can be saying, in order of what the
            // reader needs: an event that's over is over — no round number or
            // stage name outlives that. Otherwise, pokedata's header keeps
            // counting into the bracket while the denominator stays at the
            // Swiss total ("Round 13/11"), and a fraction over 100% is
            // nonsense to show — past Swiss nobody thinks in round numbers
            // anyway, so the stage name is what replaces the fraction.
            <span className="meta">
              {meta.ended ? (
                <b>Ended</b>
              ) : stage ? (
                <b>{stage.name ?? `Top cut · R${meta.round}`}</b>
              ) : (
                <>
                  Round <b>{meta.round}</b>
                  {meta.rounds ? `/${meta.rounds}` : ""}
                </>
              )}
            </span>
          )}
        </span>
      </div>

      <span className="mast-live">
        <span className="live-row">
          <span
            className="meta"
            title={
              meta.ended && meta.finishedAt
                ? `Last updated upstream ${new Date(meta.finishedAt).toLocaleString()}`
                : undefined
            }
          >
            <span
              className={`livedot${live ? " beat" : meta.ended ? " done" : " stale"}`}
            />
            {loading && !hasData
              ? "loading…"
              : source !== "live"
                ? "bundled sample"
                : meta.ended
                  ? "Ended · final standings"
                  : `Live · checked ${ago}`}
          </span>
          {meta.players !== null && (
            <span className="meta">
              <b>{meta.players}</b> players
            </span>
          )}
        </span>
        {/* The second line of this column. The tables pill sits under the live
            state rather than beside the round, because it says the same kind of
            thing those two do — how settled what you're reading is — and not
            what stage the event is at.

            Swiss only. The count comes off the same scraped header line that
            keeps saying "Round 13/11" into the bracket, so past the cut it's a
            number about a round nobody is looking at any more — and "3 tables
            left" next to a Top 8 that has two matches in it reads as wrong.

            The theme switch rides at the end of the row: it's the one control
            in this corner that has nothing to do with the event, so it goes
            last, and it's the only thing here that's always present — the row
            holds the right edge whether or not there are tables out. */}
        <span className="live-row">
          {!stage && meta.playing !== null && meta.playing > 0 && !meta.ended && (
            <span className="pill tables" title="Results still to come in this round">
              <i className="livedot stale beat" />
              {meta.playing} table{meta.playing === 1 ? "" : "s"} left
            </span>
          )}
          <ThemeToggle />
        </span>
      </span>
    </div>
  );
}

export function StatusChips({
  source,
  loading,
  hasData,
  ago,
  ended = false,
}: {
  source: Source;
  loading: boolean;
  hasData: boolean;
  ago: string;
  ended?: boolean;
}) {
  return (
    <>
      <span
        className={`iconsrc${CHAMPIONS_COUNT ? " on" : ""}`}
        title={
          CHAMPIONS_COUNT
            ? `${CHAMPIONS_COUNT} Pokémon Champions menu icons installed`
            : "No Champions icons found — run: npm run fetch:champions"
        }
      >
        {CHAMPIONS_COUNT
          ? `Champions icons · ${CHAMPIONS_COUNT}`
          : "PokéAPI fallback icons"}
      </span>
      <span className="status">
        <span
          className={`dot ${source !== "live" ? "sample" : ended ? "done" : "live"}`}
        />
        {loading && !hasData
          ? "loading…"
          : source !== "live"
            ? "bundled sample"
            : ended
              ? "ended"
              : `live · checked ${ago}`}
      </span>
    </>
  );
}

export function EventControls({
  active,
  division,
  onDivision,
  children,
  right,
}: {
  active: Section;
  division: Division;
  onDivision: (v: Division) => void;
  children?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="mast-ctl">
      <Nav active={active} />

      {/* The gold behind the chosen division is one element that slides,
          rather than a fill appearing on one button and leaving another —
          the switch then reads as the same thing moving. Purely positional:
          the thumb sits where --i says whether or not it animated getting
          there, so the blanket reduced-motion rule leaves it correct. */}
      <div
        className="segs"
        role="group"
        aria-label="Division"
        style={{ "--n": DIVISIONS.length } as CSSProperties}
      >
        <span
          className="thumb"
          aria-hidden="true"
          style={{ "--i": DIVISIONS.indexOf(division) } as CSSProperties}
        />
        {DIVISIONS.map((d) => (
          <button key={d} aria-pressed={division === d} onClick={() => onDivision(d)}>
            {d[0].toUpperCase() + d.slice(1)}
          </button>
        ))}
      </div>

      {children}
      {right && <div className="right">{right}</div>}
    </div>
  );
}

/**
 * What you're looking at, whenever it isn't the live feed. One component
 * rather than a check per page: three pages showed the same banner off the
 * same condition, and a fourth state to distinguish would have meant editing
 * all of them again.
 */
export function SourceBanner({ source, tid }: { source: Source; tid?: string }) {
  if (source === "sample") {
    return (
      <div className="banner">
        <b>Showing the bundled snapshot.</b> The live fetch to pokedata.ovh
        didn&apos;t get through — usually a firewall or the event not existing
        yet. Run this on an unrestricted connection and the same code pulls the
        real thing; the dot above turns green.
      </div>
    );
  }
  if (source !== "fixture") return null;

  const note = FIXTURES.find((f) => f.tid === tid)?.note;
  return (
    <div className="banner">
      <b>This is a test fixture, not a tournament.</b> Invented players,
      generated results — it exists so a state the real feed only passes
      through for a few minutes can be looked at whenever.
      {note && ` ${note}`}
    </div>
  );
}

export function Credits({ event }: { event?: CircuitEvent }) {
  return (
    <footer className="foot">
      {event?.label}
      {event?.dates && ` · ${event.dates}`}. Standings are computed by{" "}
      <a href="https://www.pokedata.ovh" target="_blank" rel="noreferrer">
        pokedata.ovh
      </a>{" "}
      outside the tournament software and are <b>not official</b>. Not
      affiliated with The Pokémon Company International, Nintendo, Creatures
      Inc., GAME FREAK Inc., RK9.gg or pokedata.ovh. Typings{" "}
      {ITEMS_COUNT > 0 ? "" : "and item icons "}from{" "}
      <a href="https://pokeapi.co" target="_blank" rel="noreferrer">
        PokéAPI
      </a>
      ; type icons by{" "}
      <a
        href="https://github.com/partywhale/pokemon-type-icons"
        target="_blank"
        rel="noreferrer"
      >
        partywhale
      </a>{" "}
      (MIT).
      {/* The licence requires this to be visible, so it names whichever sets
          are actually installed rather than claiming both unconditionally. */}
      {(CHAMPIONS_COUNT > 0 || ITEMS_COUNT > 0) && (
        <>
          {" "}
          {[
            CHAMPIONS_COUNT > 0 && "Pokémon Champions menu sprites",
            ITEMS_COUNT > 0 && "held-item bag sprites",
          ]
            .filter(Boolean)
            .join(" and ")
            .replace(/^h/, "H")}{" "}
          courtesy of{" "}
          <a
            href="https://archives.bulbagarden.net"
            target="_blank"
            rel="noreferrer"
          >
            Bulbagarden Archives
          </a>
          , used under CC BY-NC-SA 2.5.
        </>
      )}
    </footer>
  );
}
