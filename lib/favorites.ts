"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * Favourite players, kept in localStorage.
 *
 * Players are keyed by their full display name ("YUYA WAKASUGI [JP]") because
 * that is the only identifier pokedata gives us — there are no player IDs in
 * the JSON. A happy side effect: the same name recurs across events, so a
 * favourite follows the player from regional to regional.
 *
 * A tiny external store rather than context, so every component (rows, header
 * count, the favourites page) sees the same list without prop-drilling, and
 * other tabs stay in sync via the `storage` event.
 */
const KEY = "pokedata-demo:favorites";
const EMPTY: readonly string[] = Object.freeze([]);

let snapshot: readonly string[] = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function read(): readonly string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? Object.freeze(parsed.filter((x): x is string => typeof x === "string"))
      : EMPTY;
  } catch {
    // Private mode, disabled storage, corrupt JSON — favourites are a
    // convenience, never load-bearing.
    return EMPTY;
  }
}

function ensureLoaded() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  snapshot = read();
}

function commit(next: readonly string[]) {
  snapshot = Object.freeze([...next]);
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    /* keep the in-memory list even if it can't be persisted */
  }
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  ensureLoaded();
  listeners.add(listener);

  const onStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== KEY) return;
    snapshot = read();
    for (const l of listeners) l();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): readonly string[] {
  ensureLoaded();
  return snapshot;
}

/** The server has no localStorage, so it renders zero favourites and the
 *  client fills them in — no hydration mismatch. */
const getServerSnapshot = (): readonly string[] => EMPTY;

export function useFavorites() {
  const list = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const set = useMemo(() => new Set(list), [list]);

  const toggle = useCallback((name: string) => {
    const current = getSnapshot();
    commit(
      current.includes(name)
        ? current.filter((n) => n !== name)
        : [...current, name],
    );
  }, []);

  const remove = useCallback((name: string) => {
    commit(getSnapshot().filter((n) => n !== name));
  }, []);

  const clear = useCallback(() => commit(EMPTY), []);

  return { list, set, toggle, remove, clear, count: list.length };
}
