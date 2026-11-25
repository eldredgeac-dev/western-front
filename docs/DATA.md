# Data files

All game content lives in `data/*.json`. The code reads these files and never
hard-codes places or nations, so changing the map or adding a scenario should only
mean editing data. Every file starts with an `"_about"` line saying what it is for.

`tests/run.mjs` checks that every data file is valid JSON. The tests in
`tests/tests.js` check that the map and scenario match `docs/RULES.md`.

Planned files that don't exist yet: `unit-types.json` (milestone 3), `combat-table.json`
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
| `frontGapAfterColumn` | The column after which the map draws a "no man's land" gap (`"e1"`). Drawing only. |
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
| `draw` | `{ "x": column, "y": row }`: where to draw the box on the map (0-based). Drawing only. The rules use `neighbours`, never these numbers. |

## `terrain.json`: terrain types and trench limits
| Field | Meaning |
|---|---|
| `plainFill` | Map colour for a box with no "fill" terrain |
| `types` | One entry per terrain type in RULES.md §3: `id`, `name`, `effect` (plain English, shown in the box panel) and `draw` |
| `types[].draw` | How the map shows it. `kind` is one of: `"fill"` (paints the box `color`; if a box has two fills, the higher `priority` wins), `"pattern"` (draws `pattern` `"hatch"` or `"waves"` on top in `color`), or `"badge"` (a `symbol` and a heavy border in `color`). |
| `trenchMax.periods` | RULES.md §9.5. Each period runs from `from` (`"YYYY-MM"`) until the next one. `normal` is the usual limit; `byTerrain` gives a different limit for boxes with that terrain (if a box had two, the lower one wins). |

The column shifts for each terrain will be added here in milestone 5 (combat).

## `nations.json`: sides and nations
| Field | Meaning |
|---|---|
| `sides` | `id` (`"entente"`, `"germany"`), `name`, `color` (used for the owner strip on the map) and the list of its `nations` |
| `nations` | `id` (`"ger"`, `"fra"`…), `name`, `short` (`"GER"`) and `side` |

Resources and traits (RULES.md §4 and §6) will be added in later milestones.

## `scenarios/1914-west.json`: the December 1914 start
| Field | Meaning |
|---|---|
| `id`, `name` | Scenario id and title |
| `map` | Which map file it uses (`"boxes-west"`) |
| `startMonth` | The month of turn 1, `"YYYY-MM"` |
| `turns` | How many turns the scenario lasts (48 = Dec 1914 to Nov 1918) |
| `boxes` | For **every** box id on the map: `owner` (a side id) and `trench` (starting level) |

Starting units are added in milestone 3.

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
