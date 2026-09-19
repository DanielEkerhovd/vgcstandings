# VGC standings

A Next.js app that reads live Pokémon VGC standings from pokedata.ovh and renders
them. Read `README.md` first — it explains the data and the scripts that
generate `data/`. This file is the house rules.

## Commands

```
npm run dev          # localhost:3000
npm run build        # must pass before you call anything done
npm run typecheck
npm run build:dex    # regenerates data/pokedex.json from PokéAPI
npm run build:effects     # regenerates data/effects.json (hover explanations)
npm run fetch:champions   # downloads the Champions menu icons
npm run fetch:items       # downloads the held-item bag sprites
npm run build:fixtures    # regenerates the synthetic test tournaments
```

## Test tournaments

`data/fixtures/*.json` are three synthetic events (tids `9000001`–`9000003`)
holding bracket states the live feed only passes through for a few minutes:
mid-Swiss with no cut, a Top 8 with the semis unpaired, a Top 4 with one match
still out. The page says on its face that they're fake.

**The rows stay on disk. Testing a state is never a reason to add or delete a
file.**

## The developer switch

`lib/devtools.ts` owns one localStorage key, `toggleTools`, and it gates every
dev-only surface — the fixtures today, whatever comes next on the same flag.
It is **off** unless the string is exactly `"true"`, and a browser that has
never seen it gets `"false"` written on first read, so the thing you have to
flip is sitting in the inspector instead of being a name you had to know.

Turn the fixtures on with `toggleTools = true` in devtools and a reload.

There is deliberately **no UI for this** — no button, no toolbar pill, nothing
that shifts the layout. A control for invented data does not belong in the
chrome of a page people read for real standings, and the flag is a developer's
tool, not a feature. Don't add one.

Two consequences worth knowing before you touch it:

- The switch is client-only, so `listEvents()` never merges fixtures. The
  browser does it in `useCircuit()`. Don't move that back to the server: the
  server can't read localStorage and would have to guess.
- `toolsOn()` can only be read *after* mount, or the server (which always says
  no) and the first client render disagree. So nothing gated on it may change
  layout on arrival — appending to the event picker is fine, moving the toolbar
  is not.

The standings route is told by the caller — `?tools=1` on the fetch — because
it can't read localStorage either. `openingTid()` accepts a fixture tid whether
or not the tools are on yet, so a reload while reading one doesn't bounce you
back to a real event.

Don't reintroduce a build-time constant here. That's exactly what made deleting
the data the only way to turn the fixtures off.

They're generated, not hand-written — `scripts/build-fixtures.mjs`,
deterministic, in pokedata's exact shape so they go through `normalize()` and
`buildBracket()` on the same path as the real feed. Change one by changing the
generator and re-running it; don't edit the JSON. The players in them are
invented and must stay that way — test data that could pass for a real result
is worse than none.

## The look

The design language is a game menu, not a spreadsheet. Rows are pills with a
999px radius and a 1.5px hairline border. Keep that. If a change makes the page
look like a data table again, it's wrong.

All colour lives in `app/globals.css` as custom properties. Never write a hex
value anywhere else, and never define a colour only inside a `@media` block —
every token needs a light value on `:root` first, then an override for dark.
Check both themes before finishing.

### Gold means a result

This is the rule that matters most. `--star` (the yellow) is reserved for
something that has actually happened. It is not a highlight colour.

- While an event is still running, rank 1 gets **only a gold hairline border**.
  The card is otherwise identical to ranks 2 and below: same fill, same border
  width, same numeral in the disc.
- When the event is finished, the rank 1 card fills gold and the numeral in the
  disc is replaced by a crown. Ranks 2 and 3 keep plain numerals — no silver or
  bronze.
- Finished means `round === rounds` and no tables still playing. The proxy
  returns both as `x-round` / `x-rounds` / `x-playing` headers. When the meta
  scrape returns nothing, treat the event as still running.

Text on a gold row uses the fixed `--on-lead` ink in **both** themes. It must not
pick up the themed `--ink`, or the leader row ends up white-on-yellow in dark
mode. That bug has been fixed once already.

### Other standing rules

- Type colour stays inside an expanded team — the species' type pills, and the
  four move pills below them. Rows and the team icons stay neutral. That was a
  deliberate call, don't reintroduce it.
- The two carry it differently, on purpose. A species' typing is a badge: solid
  fill, white text. A move is a row of text, so it takes the same colour as a
  16% wash over a `--card-2` well with `--ink` on top, and the type rides in a
  solid disc at the left where a white glyph can sit on it. The well is what
  makes Normal and Dark legible as pills at all — at 16% they're within a shade
  of the dark card. Both washes come from `typeTint()`; don't hand-pick either.
- Move typings come from `data/move-types.json`, not from the effect popovers.
  Those fetch one word on hover, and a card needs four colours before anyone
  points at anything. `scripts/build-effects.mjs` writes both files.
- Row density is one icon button in the toolbar. The chevrons animate purely in
  CSS off the button's own `aria-pressed`, and the state lives as
  `data-density` on `documentElement`. Don't move that into React state.
- The theme switch is the sun/moon button under the player count, at the end of
  the masthead's live column. No stored choice means **no `data-theme`
  attribute at all** and the palette follows `prefers-color-scheme` — that's
  the default and it stays the default; a click writes the attribute and
  `pokedata-demo:theme`, which then outranks the OS. Which glyph shows is CSS,
  off the same three selectors that pick the palette, because a glyph chosen by
  a mounted effect shows a sun for one frame to every dark-mode reader. The
  inline script in `layout.tsx` exists only to land a stored choice before the
  first paint; nothing else belongs in it.
- Respect `prefers-reduced-motion` for anything that animates.

## The data

- pokedata.ovh sends no CORS header, so **every** request to it goes through
  `app/api/standings/[tid]/[division]/route.ts`. Never fetch it from a client
  component.
- The standings file is fetched only through `lib/upstream.ts`, which holds
  one copy in memory for 30 seconds and shares an in-flight request. That
  collapses all visitors into one upstream request per 30 seconds; their file
  changes about once a minute and it's one person's server, not a CDN. Don't
  lower it, and don't go back to `next: { revalidate: 30 }`: Next's data cache
  refuses entries over 2 MB, and a regional with team lists is bigger than
  that. Baltimore 2026 served an hour-old file for exactly that reason.
- The upstream JSON filename capitalises the division: `${tid}_${Division}.json`.
- The JSON is inconsistent by design: `decklist` is an array *or* an empty
  string, `id` is a string *or* a number, `table` is padded like `" 129 "`.
  `lib/pokedata.ts` normalises all of it. Add new quirks there, not in
  components.
- Points aren't in the file. `wins * 3 + ties`.
- Players reference each other by display-name string. There are no IDs.

## Hover explanations

Moves, items and abilities explain themselves on hover, focus or tap, in all
three places they appear — the standings' expanded team, the usage panel's
tally rows, and the bracket's match modal. One `<Explain>` in `shared.tsx`,
two call sites, because `MonCard` is already shared by two of the three.

- The text lives in `data/effects.json`, ~390KB, imported **only** by
  `app/api/effect/[kind]/[slug]/route.ts`. Never import it from a component:
  it would ship whole to every visitor so that someone could hover one word.
- A term with no entry degrades to plain text — no underline, no tab stop —
  after the first hover establishes that. Misses are cached as hard as hits.
- PokéAPI has no `effect_entries` for **any** gen-9 move, so moves take the
  in-game flavour line instead. It's complete, and one voice throughout beats
  half the movepool reading as a rules citation.
- Gen-9 *items* have no text of either kind. `data/effects-extra.json` fills
  the battle-relevant ones by hand and the build merges it over the top;
  `npm run build:effects` prints what's still uncovered. The 2026 Mega Stones
  are deliberately not in it — the MEGA badge on the card already says it.
- Nothing says "Held:". The build strips that prefix off the 279 upstream
  entries that carry it, because the only place this text appears is under an
  item already in a Pokémon's hand.
- Escape inside the bracket modal needs `stopImmediatePropagation`, not
  `stopPropagation`. Under the App Router React's root *is* the document, so
  its listener and the modal's are siblings on one node, and the plain form
  doesn't reach the second — a dismissed popover took the match down with it.

## PokéAPI matching

`lib/dex.ts` matches pokedata's names to PokéAPI slugs. Two traps:

- Some species have no bare entry upstream. There is no `basculegion`, only
  `basculegion-male` and `basculegion-female`. `speciesIdFor()` handles this by
  taking the dex number from whichever variety is below 10000. Alternate forms
  are all filed above 10000.
- Mega detection needs both halves of its test, because *Eviolite* also ends in
  "ite": the species must have a Mega form **and** the stone's name must start
  with the species' own name.

## Before you finish

Run `npm run build`. Then look at the page in both light and dark, and in both
densities. Most bugs in this project have been contrast bugs that a passing
build said nothing about.

## Licence

The Champions sprites and the held-item bag sprites both come from Bulbagarden
Archives under CC BY-NC-SA 2.5. Non-commercial only, credit them visibly, and
don't hotlink their servers — both fetch scripts download once so the app
self-hosts, which is the whole reason they exist. `Credits` names whichever
sets are actually installed, so don't make that text unconditional. The type
icons are MIT and have no such restriction.
