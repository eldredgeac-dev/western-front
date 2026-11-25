# Data files

All game content lives in `data/*.json`. The code reads these files and never
hard-codes places or nations, so changing the map or adding a scenario should only
mean editing data. Every file starts with an `"_about"` line saying what it is for.

`tests/run.mjs` checks that every data file is valid JSON. The tests in
`tests/tests.js` check that the map and scenario match `docs/RULES.md`.

All the planned files now exist.
(5), Describe each one here when it is added.

---

## `boxes-west.json`: the Western Front map
Geography only: where the boxes are, what they're called and what the ground is like.
Who owns a box and how deep its trench is belong to the game, so the starting values
are in the scenario file instead.

| Field | Meaning |
|---|---|
| `id`, `name` | The map's id (`"west"`) and display name |
| `lanes` | List of lanes, north to south: `id` (`"l01"`…`"l12"`), `number`, `name` |
| `columns` | List of depth columns, west to east: `id` (`"e3"`…`"g3"`), `label` (`"E1"`), `name` ("Entente front line"), `side` |
| `frontGapAfterColumn` | The column after which the front line runs (`"e1"`: between E1 and G1). Used by the map builder. |
| `mapSvg` | The map picture to show (`"./img/map-west.svg"`, made by `tools/build-map.mjs`) |
| `boxes` | The 72 boxes (see below) |

Each box:

| Field | Meaning |
|---|---|
| `id` | `l<lane>-<column>`, e.g. `l07-e3`. Also the id of the box's `<path>` on the SVG map. |
| `lane`, `column` | Ids from the `lanes` and `columns` lists |
| `name` | The box's name (`"Paris"`), or `null` for unnamed boxes. Unnamed boxes are shown as lane and column, e.g. "Ypres E1". |
| `short` | *(optional)* A shorter label for the map, when `name` is too long to fit |
| `vp` | Victory points (RULES.md §2), `0` if none |
| `terrain` | List of terrain ids from `terrain.json`. Can be empty (plain ground) or have several. |
| `neighbours` | Ids of every box you can move or attack into from here. **It must go both ways**: if A lists B, B must list A. The tests check this. It's an explicit list, so later fronts don't have to be a grid. |
| `draw` | `{ "x": column, "y": row }`: the box's place in the 12 × 6 grid (0-based). Drawing only. The rules use `neighbours`, never these numbers. |
| `anchor` | `{ "town": "Passchendaele", "lat": 50.900, "lon": 3.020 }`: the real town the territory is built around on the map. It's shown in the panel as "Near", and pencil notes use it for unnamed boxes. The map builder checks every town lies inside its own territory. |

## `terrain.json`: terrain types and trench limits
| Field | Meaning |
|---|---|
| `plainGround` | The paper colour of a territory with no special ground |
| `types` | One entry per terrain type in RULES.md §3: `id`, `name`, `effect` (plain English, shown in the box panel) and `draw` |
| `types[].draw` | How the map shows it, in docs/STYLE.md colours only. It can have: `ground` + `groundOpacity` (tints the whole territory; if a box has two, the higher `priority` wins), `texture` (a pattern drawn on top in `color`: `diagonal`, `hachure`, `blotch`, `trees` or `hills`), `season` (`"autumn"` = only shown September–November), `plain` (plain paper) or `badge` (`"star-fort"`). Change these, then re-run `tools/build-map.mjs`. |
| `trenchMax.periods` | RULES.md §9.5. Each period runs from `from` (`"YYYY-MM"`) until the next one. `normal` is the usual limit; `byTerrain` gives a different limit for boxes with that terrain (if a box had two, the lower one wins). |

`types[].combat` is what the terrain does in an attack INTO the box: `shift` (columns),
`months` (only in those months, e.g. mud in 9–11) and `tankShift` (the tank bonus there
instead of +1: open ground 2, forest and mountains 0).

## `combat-table.json`: combat (RULES.md §9)
| Field | Meaning |
|---|---|
| `columns` | The odds columns, weakest first: `label` (`"3:2"`) and `ratio` (1.5) |
| `rows` | The §9.3 table [balanced]: each row is a 2d6 range (`min`–`max`) with one result per column, written like RULES.md: `"A1 D3 R"` |
| `trenchShiftPerLevel` | −1 per defender trench level |
| `winter` | `months` and `shift` (−1 in Dec, Jan, Feb) |
| `barrage` | Most munitions per attack: `[{from, max}]` (2, then 3 from June 1916) |
| `opCost` | `single` (1), `coalition` (2, attackers from more than one nation), `emptyBox` (1) |
| `dugInTrench` | Trench level from which an R becomes "+1 D, no retreat" (2) |
| `advanceMax` | Most attackers that move into a captured box (2) |
| `futile` | `worstColumn` ("1:1") and the `will` it costs (3) |
| `capture` | Will changes for named boxes (RULES.md §11), by the capturing side: who loses the VP (`loserByLane`, `loserDefault`) and who gains a `share` of it; `special` boxes (Paris, the Channel Ports) add more |

**National traits** in `nations.json` use these `kind`s:
- `attack-shift`: that nation's attacks get `shift`.
- `defend-shift`: enemy attacks on a box this nation defends get `shift`, up to `maxTrench`.
- `enemy-attack-shift`: all the other side's attacks get `shift`.
- `defender-extra-attacker-loss`: attacks on this nation at trench `minTrench`+ lose `loss` more steps.
- `cannot-attack`: this nation's units can't attack.
- `note`: shown on the Nations screen only.

`from` and `to` (`"YYYY-MM"`) limit when a trait works.

## `nations.json`: sides and nations
| Field | Meaning |
|---|---|
| `sides` | `id` (`"entente"`, `"germany"`), `name`, `color` (the 30% tint on territories the side owns; a docs/STYLE.md colour) and the list of its `nations` |
| `nations` | `id` (`"ger"`, `"fra"`…), `adjective` (`"German"`), `name`, `short` (`"GER"`), `side` and `color` (the nation's STYLE.md colour, for its counters) |
| `nations[].startWill` | Starting National Will (RULES.md §11). `null` for Belgium (its losses count against `willCountsAgainst`). `entersLater: true` for the USA. |
| `nations[].stepsPerWill` | 1 Will lost per this many steps lost (RULES.md §4, §11) |
| `nations[].railMoves` | Rail moves per turn (RULES.md §8) |
| `nations[].supplySources` | *(optional)* Boxes this nation must trace supply to instead of its side's rear column (GBR: Channel Ports, Hazebrouck) |
| `nations[].resources` | `op`, `munitions`, `rp`: each a list of `{ "from": "YYYY-MM", "value" }`; the latest entry that has started applies (RULES.md §6) |
| `nations[].traits` | National traits (RULES.md §4): `id`, `name`, `text` (for the Nations screen) and `kind`, which says what the engine does with it (see combat below) |

Copy numbers tagged [balanced] in RULES.md exactly; change them in RULES.md first.

## `scenarios/1914-west.json`: the December 1914 start
| Field | Meaning |
|---|---|
| `id`, `name` | Scenario id and title |
| `map` | Which map file it uses (`"boxes-west"`) |
| `startMonth` | The month of turn 1, `"YYYY-MM"` |
| `turns` | How many turns the scenario lasts (48 = Dec 1914 to Nov 1918) |
| `boxes` | For **every** box id on the map: `owner` (a side id) and `trench` (starting level) |

| `units` | The starting units (RULES.md §12): `id` (`"fra-03"`), `nation`, `type` (from `unit-types.json`), `box` and `quality` (`green`, `regular` or `elite`). They start at full strength unless a `steps` is given. |

## `unit-types.json`: units and qualities (RULES.md §4–§5)
| Field | Meaning |
|---|---|
| `stackLimit` | Most units in one box (3) |
| `types` | `id`, `name`, `maxSteps`, `symbol` (how the counter is drawn), `rebuild` (false for tanks). Optional: `attackShift` (tanks +1), `cannotHoldAlone` (tanks), `greenTurns` (US infantry), `cancelsTrenchShift` (stormtroopers). |
| `qualities` | `green` (`attackShiftIfMajority` −1), `regular`, `elite` (`attackShiftIfAny` +1), each with an `effect` text for the panel |

## `phases.json`: the turn (RULES.md §7)
`phases` lists each phase in order: `id`, `name`, and either `side` + `kind` (`move` or
`attack`: the phase waits for that side's orders) or `auto: true` (it runs by itself
when End Phase reaches it). `until` notes the milestone where an automatic phase starts
doing something.

## `victory.json`: how the war is won (RULES.md §11) [balanced]
| Field | Meaning |
|---|---|
| `sudden` | Checked at the end of every turn, in order: `will-zero` (that `nation`'s Will is 0 or less) or `owns` (that `side` owns that `box`), with the `winner` and a `reason` for the log |
| `armistice` | After the last turn: score = Will of `plus` − the average Will of `minusAverage` + captured VP. Above `margin`: `aboveMargin` wins; below −`margin`: `belowMargin` wins; otherwise a stalemate peace |

`nations.json` also has `mutiny` for France: `name`, `belowWill` (35), `turns` (3) and
`willAfter` (10), and `rebuildType` for nations that don't rebuild as plain infantry (the
USA).

## `events.json`: events and reinforcements (RULES.md §4, §10) [balanced]
**`events`**: each has an `id`, `name`, `text` (for the log) and either `month` or
`from`/`to` (with optional `months` of the year: the blockade is `[2, 4, …, 12]`).
`quiet: true` events don't write to the log every month. `effects` is a list of:

| `kind` | What it does |
|---|---|
| `will` | `nation`'s Will changes by `value` |
| `attack-shift` | `side`'s next `uses` attacks into `lanes` this month get `shift`, shown as `label` (gas) |
| `will-for-turns` | `nation`'s Will changes by `value` for `turns` turns (U-boats) |
| `usa-entry` | The USA declares war in `month` (its Will starts, and its reinforcements count from then) |
| `withdraw` | The Hindenburg Line: units in `from` of `lanes` fall back to `to` (or `fallback`); those boxes go to the enemy at trench 0; `to` becomes `trench`; extra `rail` moves this turn |
| `make-elite` | `count` of `nation`'s strongest `type` units become Elite |
| `convert` | `count` of `nation`'s strongest `from` units become `to` (stormtroopers) |
| `will-if-no-attack` | If `side` made no attack between `from` and `to`, `nation`'s Will changes by `value` |

A **`choice`** event asks `side` a `question` with `options` (each with `label`, `text`
and `effects`). The computer picks `aiChoice`; a human player is asked, and the turn waits.

**`reinforcements`**: `dated` lists `{month, nation, type, count}` (optional `quality`,
`greenUntil`). `afterEntry` lists US arrivals `after` months from the declaration.
`placeLanes` limits where a nation's units arrive (GBR lanes 1–6, USA 9–12). Units with
`greenTurns` in `unit-types.json` arrive Green for that many months.

## `commanders.json`: commander cards (RULES.md §15) [balanced]
| Field | Meaning |
|---|---|
| `rules` | The cost of keeping the old commander (−3 Will, asked again every 3 turns), sacking (−5 Will, not in the first 3 turns) |
| `succession` | Each nation's cards in order |
| `cards[]` | `id`, `name`, `nickname` (a real historical nickname, like "Papa Joffre", or `null`), `title` *(optional, a real title such as "Allied Generalissimo")*, `nation` (or `"entente"` for Foch), `from`/`to` (historical dates; Pershing's `from` is `"usa-entry"`), `next` (who can follow) |
| `cards[].strength`, `cards[].flaw` | `name`, `text` (for the card) and `effects`: a list of `{kind, nation, value, …}` that the Milestone 11 code will read (`op`, `munitions`, `rp`, `rail`, `rail-max`, `op-max`, `will-if-no-attack`, `steps-per-will`, …) |
| `cards[].history` | A short note from docs/HISTORY.md for the full-screen card |

## `headlines.json`: newspaper headlines (RULES.md §17)
`types` lists the headline types by `priority` (1 = game over … 6 = quiet). Each has
`variants`: lists of 2–3 `{head, deck}` templates. `ours` is good news for the reader's
side, `theirs` is bad news, spun by the censor. `placeholders` lists the `{words}` the
game fills in.

## `news.json`: real world news (RULES.md §17)
An object keyed by month (`"1914-12"` … `"1918-11"`). Each month is a list of
`{ "date": "Dec 8", "headline": "..." }`, shown in the newspaper's "Elsewhere in the
World" column. These are real history: don't change facts without a source in HISTORY.md.

## `quotes.json`: Real Voices (RULES.md §18)
`{ "quotes": [ ... ] }`. Each quote has:

| Field | Meaning |
|---|---|
| `id` | Unique id, e.g. `"grey-lamps"` |
| `trigger` | When it appears, e.g. `"game_start"`, `"month:1915-04"`, `"first_attack_in_lanes:1-3_from:1915-05"` |
| `text`, `who`, `when` | The quote, who said or wrote it, and when |
| `note` | *(optional)* A short line shown in smaller text under the quote |

Each quote shows once per game. All the texts are public domain; don't change them
without a source.

---

## The map picture: `img/map-west.svg` and `tools/map-extra.json`
The campaign map is a picture made by `tools/build-map.mjs` (run it with
`cd tools && npm install && node build-map.mjs`). The game never runs the builder: it
just loads the finished SVG. Re-run it after changing anchors, terrain `draw`, or
`tools/map-extra.json`.

**What the builder checks before it writes anything:** every territory contains its
own anchor town, and shares a border with exactly the boxes in its `neighbours` list
(no more, no fewer). Diagonal boxes may meet at a single point.

**What's in the SVG** that the game uses:

| Element | Meaning |
|---|---|
| `<use class="territory" id="l07-e3" data-box data-x data-y>` | A territory (the tap target). `data-x`/`data-y` is its anchor town in map units. |
| `<path class="edge" data-a data-b data-left>` | The border between two neighbours. `data-left` says which box is on the left of the line as drawn (for trench drawing). |
| `#shape-<id>`, `#clip-<id>` | Each territory's outline, stored once |
| `lod-mid`, `lod-near`, `lod-far` classes | Which zoom level a detail appears at (docs/STYLE.md §13) |
| empty layers `#scars`, `#region-edges`, `#trenches`, `#front`, `#plans`, `#selection`, `#notes`, `#map-date` | Filled in by `js/ui/map.js` from the game state |

**`tools/map-extra.json`** holds hand-traced lines and places, as `[lat, lon]`. Sources
are in docs/HISTORY.md ("Drawing the map").

| Key | Meaning |
|---|---|
| `frame` | The area the map shows: `[south, west, north, east]` |
| `front` | The front line, north to south. Every E1/G1 border follows it. |
| `laneBreaks` | Where each lane boundary meets the front, `[lat, lon]` or `[lat, lon, tiltEntente, tiltGerman]`. A tilt leans that boundary so a town stays in its own lane. |
| `border1871` | The Franco-German border of 1871–1918 |
| `rivers` | Rivers missing from Natural Earth (Yser, Oise, Aisne). `riverNames` lists the Natural Earth rivers to draw. |
| `ridges` | Crests drawn with hillshade and hachures (`width` = how wide the shading is) |
| `railways` | 1914 main lines (`id`, `name`, `points`), mid zoom |
| `roads` | Main roads (`name`, `points`), mid zoom |
| `villages` | Villages along the front (`name`, `at`), full zoom |
| `landmarks` | Famous places (`name`, `kind`: `fort`, `hill` with `height`, `wood` or `ridge`), full zoom |
| `otherTowns` | Towns shown only to help you find your way (not in the game) |
| `placeNames` | Sea and country names |

**The battle record** (from milestone 5): the state will hold `battles`, a list of
`{ "box", "month", "stepsLost" }`. `js/engine/battles.js` turns it into battle scars
(more crater stipple the more a territory is fought over) and pencil notes (a battle with
6 or more steps lost). Open the game with `?demo` at the end of the address to see a
sample war (`js/ui/demo.js`).
