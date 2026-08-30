"use client";

import { useEffect, useState } from "react";
import { slugify } from "./dex";

/**
 * The client half of the reference popovers. Nothing here imports
 * data/effects.json — that file is half a megabyte and lives behind
 * /api/effect, or it would be shipped whole to every visitor.
 */

export type EffectKind = "move" | "item" | "ability";

export interface MoveEffect {
  type: string | null;
  /** "physical" | "special" | "status". */
  class: string | null;
  /** null for status moves and for moves whose damage isn't a fixed number. */
  power: number | null;
  /** null means it cannot miss. */
  acc: number | null;
  pp: number | null;
  pri: number;
  text: string | null;
}

export interface TextEffect {
  text: string | null;
}

export type Effect = MoveEffect | TextEffect;

export const isMove = (e: Effect): e is MoveEffect => "class" in e;

/**
 * Resolved entries, and misses, for the life of the page. A miss is worth
 * caching as hard as a hit: pokedata prints plenty of names PokéAPI has never
 * heard of, and re-asking on every hover of the same word would be the one way
 * to make this feel slow.
 */
const cache = new Map<string, Effect | null>();
const inflight = new Map<string, Promise<Effect | null>>();

async function load(key: string): Promise<Effect | null> {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  const already = inflight.get(key);
  if (already) return already;

  const req = (async () => {
    try {
      const res = await fetch(`/api/effect/${key}`);
      const out = res.ok ? ((await res.json()) as Effect) : null;
      cache.set(key, out);
      return out;
    } catch {
      // A dropped request isn't a miss — leave the cache alone so moving the
      // pointer back over the word tries again.
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, req);
  return req;
}

/** What a term resolves to, or undefined while it's still being fetched. */
export function useTermEffect(
  kind: EffectKind,
  term: string,
  enabled: boolean,
): Effect | null | undefined {
  const key = `${kind}/${slugify(term)}`;
  // Synchronous when it's already known, so a second hover doesn't flash a
  // loading state at somebody reading down a movepool.
  const known = cache.get(key);
  const [entry, setEntry] = useState<Effect | null | undefined>(known);

  useEffect(() => {
    if (!enabled) return;
    const seen = cache.get(key);
    if (seen !== undefined) {
      setEntry(seen);
      return;
    }
    let alive = true;
    setEntry(undefined);
    load(key).then((e) => {
      if (alive) setEntry(e);
    });
    return () => {
      alive = false;
    };
  }, [key, enabled]);

  return enabled ? entry : known;
}

/** "physical" -> "PHYS", for the little mono chip on a move. */
export const classShort = (c: string | null) =>
  c === "physical" ? "PHYS" : c === "special" ? "SPEC" : c === "status" ? "STAT" : "";
