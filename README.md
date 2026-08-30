# VGC Standings

Live Pokémon VGC standings, teams and usage — **[vgcstandings.com](https://www.vgcstandings.com)**.

Every event `pokedata.ovh` has results for, with each player's team on the row
instead of behind a click, a top-cut bracket reconstructed from the rounds, and
a usage board for the whole field. This file is how it works and where the data
comes from.

Not affiliated with The Pokémon Company International, Nintendo, Creatures Inc.,
GAME FREAK Inc., RK9.gg, Bulbagarden or pokedata.ovh.

## Run it locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

That's it. No API key, no signup, no `.env` file — the data is public.

Deployed on Vercel. The only environment variable is `NEXT_PUBLIC_SITE_URL`,
and only on preview deploys: it points the canonical URL and the link-preview
images at that deploy instead of production. Production doesn't need it.

## What you'll see

- **Green dot, "live"** — it reached pokedata.ovh. You're looking at real,
  current standings.
- **Amber dot, "bundled sample"** — the fetch didn't get through (firewall,
  offline, or the event doesn't exist). It falls back to a snapshot of Worlds
  2026 Masters that ships in `data/` so the app always renders something.

Sprites load through `/api/sprite/[id]`. If that can't reach pokedata either,
each Pokémon shows a short text token instead of a broken image.

## Things it does that pokedata.ovh doesn't

- Teams visible inline on every row, not hidden behind a click
- **Typing shown on every Pokémon** — colour-coded pills using the official
  type icons, on an otherwise neutral card
- **Mega Evolution is resolved from the held item**: Charizard + Charizardite Y
  becomes Mega Charizard Y, with the right sprite *and* the right typing
- **Favourite players** — star anyone on the standings, then hit **★ Favourites**
  at the right end of the toolbar to narrow the table to just them
- A separate **Usage** page ranking every Pokémon by how many published teams
  carry it, with counts, share of the field and a bar; click any row to jump
  back to the standings filtered to those players
- A **Bracket** page for the top cut — pokedata has no bracket, only rounds, so
  this one is reconstructed (see below). Byes, play-in rounds and matches still
  being played all render; the last one pulses while its table is out
- Instant player search
- Click a row for round-by-round results — opponents are clickable and jump to
  their row
- Works in dark mode

## The look

The page is laid out like a game menu rather than a spreadsheet.

- **The event is the headline.** A tier badge (`Worlds`, `Regional`…), the
  event name, its dates, and the round it's on sit at the top; the tournament
  picker hangs off the title itself. Live state — round, player count, tables
  still playing — reads across the top right.
- **Every player is a pill**, not a table row: a numbered disc, the name, the
  team, the record, then the tiebreakers. The leader's pill is filled yellow
  with fixed dark ink, so it stays legible in both themes.
- **Two dividers** cross the table. A green `Top 8` after rank 8 — it marks the
  rank, not the event's real cut, because that number isn't in the data. And a
  red `Eliminated` wherever the field stops being able to reach it, which is
  worked out two different ways (see below).
- **Row density** is one icon button at the right of the toolbar — two chevrons
  that point apart when rows are roomy and flip to point at each other when
  they're compact, so the icon shows the state rather than the action. It shrinks row
  height and icon size to fit ~5 more players on screen, and remembers your
  choice. The whole animation is CSS driven off the button's own
  `aria-pressed`, so the two pages share one rule.

Type colour is gone from the rows entirely; it survives only on the type pills
inside an expanded team, which is the one place it means something.

## Where the Pokémon data comes from

Pokédata tells you a Pokémon's name, item, ability, nature and moves. It does
not tell you its **typing** — that comes from [PokéAPI](https://pokeapi.co),
which is free, open and needs no key.

```bash
npm run build:dex     # writes data/pokedex.json
```

This runs once and caches the result, because resolving typings live would mean
thousands of requests per page load — a 400-player event is ~2,400 team slots.
The script hits `pokeapi.co` first and falls back to PokéAPI's static GitHub
mirror if that host is unreachable from wherever you run it.

Sprites come from PokéAPI's asset repo through `/api/sprite/*`, cached for a
year — the flat 2D ones, not the 3D "home" renders. PokéAPI *does* ship menu
icons (`versions/generation-viii/icons`), but they stop at generation 8, so a
modern field loses Kingambit, Basculegion, Sneasler, Farigiraf and every new
Mega. That's the gap the Champions icons below fill. PokéAPI doesn't have art for the brand-new 2026 Mega Stones yet
(Floettite, Dragoninite), so those degrade to a small polished-stone dot —
the Mega *forms* themselves are already in there and resolve fine.

### Matching names to PokéAPI

The two name the same Pokémon differently. Pokédata writes forms in brackets —
`Basculegion [Male]`, `Floette [Eternal Flower]` — while PokéAPI uses suffixed
slugs, and they don't always agree (`Eternal Flower` is just `eternal`
upstream). `lib/dex.ts` tries the full form, then progressively shorter
suffixes, then the bare species, then any variety starting with that species
(which is how `Aegislash` finds `aegislash-shield`). Against the bundled
sample that resolves 204 of 204 team slots.

A handful of species have no bare entry upstream at all — PokéAPI knows
`basculegion-male` and `basculegion-female`, never plain `basculegion`. For
those, the dex number used to look up a Champions icon comes from whichever
variety carries the national number (alternate forms are filed above 10000),
so they get art like everything else instead of silently falling back.

Mega detection needs both halves of a test, because *Eviolite* also ends in
"ite": the species must actually have a Mega form, **and** the stone's name
must start with the species' own name. That's what stops a Mega-capable
Pokémon holding an unrelated item from wrongly evolving.

## Type icons

```bash
npm run build:type-icons     # regenerates lib/type-icons.ts
```

The type glyphs come from
[partywhale/pokemon-type-icons](https://github.com/partywhale/pokemon-type-icons)
— vector recreations of the icons in BDSP / Legends: Arceus / Scarlet & Violet,
**MIT licensed**, so unlike the Champions sprites there's no non-commercial
restriction here.

The script inlines them into `lib/type-icons.ts` as raw path data rendered with
`currentColor`, so there are no extra network requests and the icons recolour
with the UI. It also lifts each type's **official colour** from the artwork's
background disc, which is where the palette comes from — no hand-picked hexes.

## Optional: Pokémon Champions menu icons

```bash
npm run fetch:champions
```

**56 icons are already bundled** — every species in the offline sample, so a
fresh clone shows real Champions art before you download anything. Run the
script to get all 359:

Downloads the Champions menu sprites from Bulbagarden Archives into
`public/champions/` and writes a manifest. Once present, they're used in
preference to PokéAPI sprites everywhere — including the `-Mega`, `-Mega X` and
`-Mega Y` variants, which line up with the Mega detection above. **This is the
only complete source of menu-style icons for a current-generation field.**

Filenames are `Menu CP 0006-Mega Y.png` — dex numbers padded to **four**
digits — which becomes the manifest key `0006-mega-y`.

When it finishes it prints how many of the bundled sample's team slots found an
icon. If that percentage is low the filename convention has drifted, and
`championsIconFor()` in `lib/dex.ts` is the one function to adjust.

**Please read before running it.** Bulbagarden Archives publishes under
CC BY-NC-SA 2.5, and the sprites themselves are Nintendo / Creatures /
GAME FREAK assets that Bulbagarden hosts as a fan resource. In practice:
non-commercial use only, credit Bulbagarden Archives visibly, and don't
hotlink their servers — they're donation-funded and ask people not to. The
script downloads once so you self-host, and paces itself deliberately. Leave
it that way.

If you never run it, nothing breaks; the app just uses PokéAPI sprites.

## Optional: held-item bag sprites

```bash
npm run fetch:items
```

Downloads the bag sprites from Bulbagarden Archives into `public/items/` and
writes `data/items.json`. Same terms and the same gentle pace as
`fetch:champions` above — read that section before running this one.

**This one matters more than it looks.** PokéAPI's sprite repo stops before
generation 9, so Fairy Feather, Booster Energy, the Punching Glove and every
Mega Stone past gen 8 have no art there at all — its *API* lists them, the
sprite field is just null. That's most of a modern field's held items. Without
this download those slots fall back to a plain marker.

Two sets are pulled, in preference order:

- **SV** — Scarlet/Violet, the current bag. The default, being the game the
  standings are played in.
- **ZA** — Legends: Z-A, which is where every Mega Stone lives, megas not being
  an SV mechanic.

Filenames are `Bag Fairy Feather SV Sprite.png`, which becomes the manifest key
`fairy-feather` — the same slug `itemSlug()` computes from pokedata's item
string, which is what makes the lookup work. When it finishes it prints how
many of the bundled sample's held items found a sprite; if that's low the title
convention has drifted and `parseTitle()` in the script is the thing to adjust.

Anything in neither set still falls through to PokéAPI, then to the marker.

## Links, titles and previews

Most people meet this site as a link somebody pasted, so a URL has to carry
what it points at.

**Every view is addressable.** The address bar tracks the event, the division
and the open player, written with `replaceState` — this is the same page either
way, and a router hop would refetch and lose your scroll on every click. Arrive
with `?player=` and that row opens and scrolls into view — so the address bar
is already the shareable link at every moment, and copying it is the browser's
own job.

**Titles and descriptions are per event.** `generateMetadata` in each page
calls `eventMetadata()`, which reads the event server-side and writes a real
title — "World Championship — Masters standings", or "YUYA WAKASUGI — 1st at
World Championship" — with the round, the player count and the leader in the
description.

**Link previews are drawn per request** at `/api/og`, 1200x630, which is what
Facebook, X, Discord, Slack and iMessage all want. An event link gets the top
three with the leader in gold; a player link gets their name, placing, record
and team. It comes from the same snapshot as the page, so the card can't drift
from the standings.

When upstream can't be read, the card falls back to a plain branded one rather
than guessing. That's deliberate: the platforms cache a card for days, so a
wrong scoreline outlives the mistake by a long way.

`lib/summary.ts` is the server-side read all of this shares. It exists next to
the proxy rather than inside it because a crawler never runs the client:
whatever Google or Discord should see has to be in the first HTML response.

## How it's put together

```
app/
  page.tsx                              standings; loads the event list
  usage/page.tsx                        usage rankings
  bracket/page.tsx                      the top-cut bracket
  api/standings/[tid]/[division]/route.ts   the proxy — read this one first
  api/sprite/[...path]/route.ts         PokéAPI sprite + item cache
  api/og/route.tsx                      the 1200x630 link-preview card
  robots.ts, sitemap.ts                 crawler rules, one URL per event
  icon.svg, favicon.ico, apple-icon.png the six-square mark
lib/summary.ts                          server-side read of one event
lib/metadata.ts                         titles, descriptions, card URLs
lib/pokedata.ts                         types, normalizer, event-index scraper
lib/bracket.ts                          derives the bracket from the rounds
lib/dex.ts                              PokéAPI name matching + Mega resolution
lib/types.tsx                           type colours, icons, the split wash
lib/type-icons.ts                       GENERATED — do not hand-edit
components/Explorer.tsx                 the standings table
components/UsageBoard.tsx               the usage page
components/BracketBoard.tsx             the bracket page
lib/favorites.ts                        localStorage store for starred players
components/shared.tsx                   masthead, toolbar, density, polling hook
components/EventPicker.tsx              the season timeline
lib/events.ts                           date parsing, tiers, RK9 upcoming
scripts/build-pokedex.mjs               npm run build:dex
scripts/build-type-icons.mjs            npm run build:type-icons
scripts/fetch-champions.mjs             npm run fetch:champions
scripts/fetch-items.mjs                 npm run fetch:items
data/                                   pokedex, offline snapshot, manifests
public/champions/                       Champions icons, once downloaded
public/items/                           held-item bag sprites, once downloaded
```

### The two things that actually matter

**1. The proxy route exists because of CORS.** pokedata.ovh sends no
`Access-Control-Allow-Origin` header, so a browser cannot fetch it directly
from your page. The server fetches it and hands it on. That's the whole job.

**2. The proxy also reads the HTML page.** The JSON has standings but no
tournament metadata, so the route additionally fetches
`pokedata.ovh/<tree>/<tid>/<division>/` and pulls one line out of it — player
count, round *n* of *m*, tables still playing, tie rate — which it passes back
as `x-` headers. That's what fills the masthead. It's a regex over stripped
markup, so it's the first thing that will break if their page changes; when it
returns nothing the app derives the round from the highest round in the JSON
and just shows less.

**3. `next: { revalidate: 30 }` is not optional.** It collapses every visitor
into one upstream request per 30 seconds. Their file only changes about once a
minute, so faster polling gets you identical bytes — and it's one person's
server, not a CDN.

`UA` in `lib/pokedata.ts` is what pokedata's logs see on every request:
`vgcstandings/1.0 (+https://www.vgcstandings.com)`. It carries the URL so the
one person running that server can look up who's polling them and get in touch
rather than just blocking it. Swap in an email if you'd rather be reachable
directly.

### The data, in one paragraph

Each event/division is one JSON file: an array of players, already ranked, each
with their record, both tiebreaker percentages, their six Pokémon (item,
ability, nature, four moves) and who they played every round. Points aren't in
the file — `wins * 3 + ties`. Players are linked to each other by display-name
string; there are no IDs. `lib/pokedata.ts` normalizes away the quirks
(`decklist` is an array *or* the empty string; `id` is a string *or* a number;
`table` is padded like `" 129 "`).

## The bracket is derived

There is no bracket in the feed — no field, no flag, nothing that says "top
cut". What there is: cut matches written into both players' `rounds` maps
exactly like a Swiss round. `lib/bracket.ts` reads them back out.

- **Cut rounds are rounds numbered past the Swiss count.** The count comes from
  the header line the proxy scrapes (`Round 13/11` → Swiss is 11). That scrape
  can fail or lag, so there's a backstop that reads the shape instead: walk back
  from the last round while each is small and roughly half its predecessor. A
  Swiss tail (29 → 28 players) never qualifies, so it can't invent a bracket.
- **Pairing is by opponent name, not table number.** Every bye carries table 0,
  so grouping on the table would fuse a round's byes into one node.
- **Byes are real entries** (`"BYE"` upstream, normalized to `opponent: null`).
  Treating each as its own node is what keeps the tree balanced when the cut
  isn't a power of two — Worlds 2026 cut 13 players: 5 matches + 3 byes = 8 into
  the Top 8.
- **`result` is null while a table is out.** Those render as a live card with a
  pulsing dot rather than a guessed winner.
- Layout is arithmetic, not measurement: leaves take sequential slots, a parent
  takes the mean of its children's, and every card spans two grid rows so the
  parent lands exactly between them.

Two caveats the page states in its own footer. The number on each name is the
player's **current standing**, not a frozen Swiss seed — pokedata re-sorts
`placing` as cut results land. And `record` mixes Swiss and cut wins, so the
Swiss-only figure is in the tooltip.

## Elimination is derived too

Nothing in the feed says a player is out. `drop` is voluntary drops only —
someone who packed up and went home, shown as `dropped R5` on their row — and
there is no cut size, no "made day 2", no elimination flag. `lib/elimination.ts`
works it out, and the red divider is where its answer changes.

Two rules, and a player is out if either fires.

**The arithmetic.** Points only ever go up, so a player's ceiling is what they
hold plus 3 for every round left. If eight others *already* hold more than that
ceiling, all eight finish above them whatever happens. Certain — resistance is
ignored, and so is the fact that the whole field can't win out at once, both of
which would only ever kill more people.

**The projection.** The arithmetic alone is useless in practice. At Worlds 2026
Masters it stayed silent until round 7, by which point 301 of the 395 were
already on three losses and everyone watching had known for four rounds. What
people mean by out is X-3, and the data agrees: of the 173 Masters players who
finished X-3, **none** made cut, and the worst record that did was 9-2.

So the threshold is derived rather than assumed. Swiss halves the undefeated
each round, so the players finishing on *k* losses is about
`N × C(rounds,k) / 2^rounds`; the cut fills from the top, so the last record
that makes it is the smallest *k* whose running total reaches the cut size.

| | projected | actual worst to make cut | |
|---|---|---|---|
| Worlds Masters (395, 11r) | X-3 out | X-2 | match |
| Worlds Juniors (111, 9r) | X-3 out | X-2 | match |
| Worlds Seniors (139, 10r) | X-4 out | X-2 | one too generous |
| a 1200-player regional (9r) | X-2 out | | |

It adapts to the field instead of hardcoding 3, and it errs toward leaving
people alive, which is the failure this should have. It *is* a projection
though: an X-3 making cut is rare, not impossible.

- **The line is the longest run of out players at the bottom**, not the
  highest-placed one anywhere. The rules don't agree with the sort — standings
  order on points, and a 1-1-3 and a 2-3-0 both hold 6, so a dead player can sit
  directly above a live one. Scanning up from the bottom and stopping at the
  first survivor means nobody below the line is ever still alive.
- **Drops are transparent to that scan.** They don't stop it, because they
  really are out, but they can't start the block either — someone who went home
  in round 1 isn't eliminated on record, and letting one anchor the line would
  put a red rule across a table on which nothing has happened yet. Their row
  says `dropped R1` on its own.
- **The cut size is assumed to be 8.** `meta.cutSize` looks like the honest
  replacement and isn't: that's the *bracket* size, the paired count snapped up
  to a power of two, so Worlds 2026's cut of 13 reads 16 there. Right for laying
  out a tree, wrong here.
- **Once the cut starts both rules stop** — the first cut round holds exactly
  the players who made it, so the line moves to that boundary and nothing is
  projected. Bracket players knocked out since sit *above* the line, so they're
  marked `out R13` on the row rather than by the divider.
- The line never rises into the top 8, so it can't contradict the green divider.
- No line at all when the header scrape failed, when the field is smaller than
  the cut, or once the event has ended. Same rule as the crown: never decide on
  a guess, and final standings don't need telling.

Both dividers are placed by index in the *rendered* list, not by a placing.
Keyed to a placing they vanish the moment a search or the favourites filter
drops that one row.

## Favourites

There is one favourites control, at the right end of the standings toolbar; it
filters in place rather than opening a separate view.

Starred players who aren't entered in the selected event are listed under the
ones who are, below a third divider reading `Not in this tournament` — same
gesture as the Top 8 and Eliminated lines, drawn in `--muted` because unlike
those two it reports no result. Their rows are hollow and dashed, and carry
only the name and its star: there's no standing to show and nothing to expand.
The rank disc stays but is left empty — a number would have to be invented and
a dash only announces its own absence, so it's there to hold the name in the
column the rest of the table puts it in.
A banner above the table used to say the same thing as a count; the names are
the part you wanted, and the star beside each is the only thing to do about it.
They obey the search box too, on a plain substring — there's no player record
behind those names to match a team or an IGN against.

Stored in `localStorage` under `pokedata-demo:favorites` (the key predates the
name; renaming it would silently drop everyone's stars) — this browser only,
nothing server-side, no account. They're keyed by the player's full display
name (`"YUYA WAKASUGI [JP]"`) because that's the only identifier pokedata
gives; a useful side effect is that a favourite follows the player from event
to event.

`lib/favorites.ts` is a small external store read through
`useSyncExternalStore`, so the row stars and the toolbar count stay in step, and a change in one browser tab propagates to the others
via the `storage` event. Every read and write is wrapped — private mode or
disabled storage degrades to an empty list rather than throwing.

## Choosing an event

The tournament dropdown is a **season timeline**. Collapsed it's one line —
the event you're looking at. Opened it shows the circuit: what's coming up, a
marker for today, then everything already played, most recent first, grouped by
month.

Two sources feed it, and they don't overlap:

- **Past events** come from pokedata's index (`listEvents()`), which only lists
  events it already has results for. These are selectable.
- **Upcoming events** come from RK9 (`listUpcoming()` in `lib/events.ts`).
  They're shown greyed and unselectable — there are no standings yet.

An event moves from the second list to the first when it finishes, so nothing
ever appears twice and no fuzzy name-matching between the two sites is needed.
`data/upcoming.json` is the offline fallback if RK9 can't be reached.

## Pointing it at other tournaments

The dropdown is built by scraping pokedata's index page (`listEvents()` in
`lib/pokedata.ts`) — there's no JSON catalogue. Tournament IDs are 7-digit
zero-padded and count up: `0000191` is Worlds 2026. TCG events live under a
separate `/standings/` tree with its own numbering.

## Test tournaments

The bracket has to be right at moments you can't schedule: the gap between a
semi-final ending and the final being paired, a Top 8 that's over with nothing
above it yet, a Swiss round with no cut at all. Waiting for a real event to
produce one on demand isn't a plan, so three synthetic tournaments are checked
in:

| tid | State |
| --- | --- |
| `9000001` | Swiss, round 4 of 11. No cut — the bracket page's empty state. |
| `9000002` | Top 8 complete, semis not paired. Two projected rounds, all blank. |
| `9000003` | Top 4 with one match still out. Projected final, one seat filled. |

They're **off by default**, and there's no button for them — a control for
invented data has no business in the toolbar of a page people read for real
standings. They're behind one localStorage flag:

```js
localStorage.toggleTools = true   // then reload
```

That's the developer switch for the whole app, not just these; anything
dev-only hangs off the same key. A browser that has never seen it gets
`toggleTools = "false"` written on first load, so it's sitting there in the
inspector waiting to be flipped rather than being a name you'd have to know.

With it on, the three fixtures appear at the bottom of the event dropdown and
the page says plainly that you're looking at one. The rows themselves always
stay on disk either way, so trying a bracket state never means adding or
removing a file, and flipping the switch needs no restart and no rebuild.

`npm run build:fixtures` regenerates them. The generator simulates the whole
thing — Swiss pairings, drops, tiebreaks, a seeded cut — and writes it in
pokedata's exact shape, quirks included: padded table strings, decklists that
are the empty string when a list isn't public, records that mix Swiss and cut
wins. So the fixtures go through `normalize()` and `buildBracket()` on the same
path as the real feed rather than round-tripping through a private format. The
output is deterministic; regenerating one is never a surprise diff.

Everything in them is invented — the players, the teams, the results. That's
deliberate. The one thing worse than no test data is test data someone mistakes
for a result.

## Fair warning

The standings are recomputed outside the official tournament software and are
not official. None of these endpoints are documented or promised to anyone —
file naming, field types and the index page's markup could all change without
notice, and when they do this site shows stale numbers or nothing at all.

Nothing here is affiliated with The Pokémon Company International, Nintendo,
Creatures Inc., GAME FREAK Inc., RK9.gg, Bulbagarden or pokedata.ovh. Pokémon
typings and sprites courtesy of PokéAPI; Champions menu sprites and held-item
bag sprites courtesy of Bulbagarden Archives under CC BY-NC-SA 2.5.

That licence is non-commercial, which is the reason this site carries no ads,
no subscription and no donate button. Keep it that way or replace the sprites.

Player names, records and team lists are published here because they're already
public results. If a player wants their name off the site, that request gets
honoured — there's a contact address in the footer for it.
