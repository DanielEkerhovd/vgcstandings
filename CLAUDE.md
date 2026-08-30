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
```

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

- Type colour appears only on the type pills inside an expanded team. Rows and
  the team icons stay neutral. This was a deliberate call, don't reintroduce it.
- Row density is one icon button in the toolbar. The chevrons animate purely in
  CSS off the button's own `aria-pressed`, and the state lives as
  `data-density` on `documentElement`. Don't move that into React state.
- Respect `prefers-reduced-motion` for anything that animates.

## The data

- pokedata.ovh sends no CORS header, so **every** request to it goes through
  `app/api/standings/[tid]/[division]/route.ts`. Never fetch it from a client
  component.
- `next: { revalidate: 30 }` on the standings fetch is deliberate. It collapses
  all visitors into one upstream request per 30 seconds. Their file changes about
  once a minute and it's one person's server, not a CDN. Don't lower it.
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
