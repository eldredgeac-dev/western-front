# Data files

All game content lives in `data/*.json`. The code reads these files and never
hard-codes places or nations, so changing the map or adding a scenario should only
mean editing data. Every file starts with an `"_about"` line saying what it is for.

`tests/run.mjs` checks that every data file is valid JSON. The tests in
`tests/tests.js` check that the map and scenario match `docs/RULES.md`.

Planned files that don't exist yet: `combat-table.json`
(5), `events.json` (9), `commanders.json` (11) and `headlines.json` (12). Describe each one
here when it is added.

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

The column shifts for each terrain will be added here in milestone 5 (combat).

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
