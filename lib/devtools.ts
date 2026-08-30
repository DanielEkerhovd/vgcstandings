/* ------------------------------------------------------------------ *
 * The developer switch.
 *
 * One localStorage key decides whether the dev-only surfaces are in play.
 * Today that's the test fixtures; anything else that belongs to whoever is
 * building the page rather than reading it hangs off the same flag, so there
 * is one thing to find and one thing to turn on.
 *
 * Deliberately not a cookie, not an env var and not a button:
 *  - a build-time constant is what made deleting the fixture data the only way
 *    to stop seeing them, which is the whole reason this exists;
 *  - a button would put a control for invented data in the toolbar of a page
 *    people read for real standings.
 * ------------------------------------------------------------------ */

export const TOOLS_KEY = "toggleTools";

/**
 * Off unless this browser says otherwise.
 *
 * A first visit has no key at all, so one is written as `false` rather than
 * left missing — a flag you can see sitting in the inspector is one you can
 * flip, where an absent one has to be known about first. Nothing else writes
 * it: turning the tools on is `toggleTools = true`, by hand, and a reload.
 */
export function toolsOn(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const stored = localStorage.getItem(TOOLS_KEY);
    if (stored === null) {
      localStorage.setItem(TOOLS_KEY, "false");
      return false;
    }
    return stored === "true";
  } catch {
    // Private mode, or storage disabled. Off is the safe answer.
    return false;
  }
}
