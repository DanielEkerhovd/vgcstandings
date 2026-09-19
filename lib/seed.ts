import type { StandingsSeed } from "@/components/shared";
import type { EventSnapshot } from "./summary";

/**
 * Turn a server-side snapshot into the rows the client starts from.
 *
 * `cutSize`, the tie rate and the upstream mtime are all left null: the client
 * derives or fetches them within a second of mounting, and guessing here would
 * put numbers in the HTML that the first refresh contradicts.
 *
 * A light snapshot (no rows — see `eventSnapshot`) seeds only the masthead:
 * `players` is null, so the shell draws the skeleton and fetches at once,
 * while the event name, round and player count are already on screen.
 */
export function toSeed(snap: EventSnapshot | null): StandingsSeed | null {
  if (!snap) return null;
  return {
    key: `${snap.tid}/${snap.division}`,
    players: snap.standings.length ? snap.standings : null,
    meta: {
      players: snap.players,
      round: snap.round,
      rounds: snap.rounds,
      cutSize: null,
      playing: snap.playing,
      tieRate: null,
      ended: snap.finished,
      finishedAt: null,
    },
  };
}
