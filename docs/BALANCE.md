# Balance report — Version 1.2 (with commander cards)

## How this was tested
- `tools/wfsim.py` is a Python simulator of RULES.md: the grid map, terrain, national
  traits, OP, munitions and RP, the 2d6 table, trenches, supply, rail, events,
  reinforcements, Will and victory.
- The computer played both sides at different **skill levels**, and each setup was played
  hundreds of times. In total, **about 9,000 simulated games** went into the tuning, and
  1,900 into the final check.
- With 240 games per setup, each percentage is accurate to about **±6 points** (95%
  confidence). With 80 games, it's about ±11.

**Skill levels used as stand-ins for players:**

| Stand-in | Plays like |
|---|---|
| **Expert** | A careful player who also weighs Will trade-offs and roads to cities |
| **Standard** | A careful player: attacks only at 2:1 or better, uses barrages well, keeps the line manned |
| **Beginner** | Looks at the odds but attacks at 3:2, spends munitions randomly, uses half the rail moves |
| **Reckless** | Attacks almost anything at 1:1 |
| **Turtle** | Never attacks |

## What was wrong with Version 1, and what changed
| Problem found | Evidence | Fix |
|---|---|---|
| The Entente won every game at equal skill | 100% Entente wins. Germany had one Will pool absorbing all its losses, plus a 46-point blockade drain. | GER Will 80 → **105**. Germany loses 1 Will per **3** steps (bigger population). Blockade spread out: −1 every other month in 1916, −1 a month in 1917, −2 a month in 1918. |
| 70% of games were draws | The end-of-war thresholds were rarely reached | The **Armistice Score** (Will gap + city VP) decides every game that reaches Nov 1918 |
| Compared Germany with the *weakest* Entente nation | Penalised the side with two Will pools | Uses the **average** of FRA and GBR |
| Never attacking was the best German strategy | Turtle Germany won 52% | **Kaiserschlacht gamble** (−15 if no German attack in Apr–Oct 1918), and failed-attack Will cost limited to futile attacks only |
| Reckless mass attacks beat careful play | The reckless Entente out-scored the careful one | Harsher 1:2 and 1:1 columns, and **−3 Will per futile attack** (1:1 or worse, failed) |
| The "expert" AI was just more aggressive, and did worse | The aggressive German AI lost more | The AI now scores attacks by the Will trade-off, not just the odds |

## Final results (240 games each)
**Equal skill — is the game fair?**

| Matchup | Germany wins | Entente wins | Stalemate | Avg turns |
|---|---|---|---|---|
| Standard vs Standard | 48% | 35% | 18% | 47 |
| Expert vs Expert | 52% | 35% | 13% | 46 |

The game is close to even, with a slight German edge (about 13 points, or 7–21 within
the uncertainty). Games almost always reach 1918 (only about 5% end early), so the full
arc of the war plays out. The French mutinies trigger in about a third of games.

**Can you win by doing nothing?** No.

| Matchup | Passive side wins |
|---|---|
| Turtle Germany vs Standard Entente | **0%** (49% loss, 51% stalemate) |
| Standard Germany vs Turtle Entente | **0%** (100% loss) |

**Does reckless attacking pay?** No.

| Matchup | Reckless side wins | Careful side's rate in the same seat |
|---|---|---|
| Reckless Germany vs Standard Entente | 0% | 48% |
| Standard Germany vs Reckless Entente | 35% | 35% |

The reckless Entente wins as often as the careful one, but bleeds France to Will 6 and
ends the war early 73% of the time. It's a coin flip, not a strategy. Reckless Germany
always collapses.

**Beginners:**

| Matchup | Beginner wins |
|---|---|
| Beginner Germany vs Standard Entente | 10% |
| Standard Germany vs Beginner Entente | 43% |

Germany is the harder side to learn, so beginners should start as the Entente.

## Difficulty levels (80 games each, player vs computer)
| Level | Careful player as GER | Careful player as Entente | Beginner as GER | Beginner as Entente |
|---|---|---|---|---|
| **Recruit** | 89% | 96% | 94% | 96% |
| **Regular** | 50% | 41% | 12% | 45% |
| **Veteran** | 26% | 32% | 0% | 43% |
| **Field Marshal** | 8% | 18% | 0% | 25% |

- Each level is clearly harder than the one before.
- Regular is a fair fight.
- Field Marshal is a real challenge: a careful player wins about 1 game in 8.
- The Recruit advisor wasn't simulated. It should make Recruit even friendlier for
  beginners.

## What the simulator can't tell us
- **The AI isn't a human.** A real player will find tricks the AI doesn't, like stacking
  attacks in one lane or using the Hindenburg Line cleverly. The true win rates will
  differ. Treat these numbers as a sanity check that nothing is broken or wildly lopsided.
- **Expert play is barely better than Standard.** My expert AI isn't much smarter than
  Standard, so the skill gap is under-measured. Expect a skilled human to beat Regular
  more often than 50%.
- **Simplifications:** the simulator's AI moves are simpler than a human's, coalition
  attacks aren't used, and the optional German choices are always taken the historical
  way.

## Version 1.2: commander cards
Each card was first tested **on its own** (60 games each, equal skill), to find any
that were overpowered.

| Card alone | Effect on win rates | Verdict |
|---|---|---|
| Joffre | Germany +10 points (his "always attack" flaw bleeds France) | Kept: it's historical |
| Nivelle | Neutral. Mutinies go up because his gamble often fails. | Kept |
| Pétain | Entente +13 points | Kept: balances Joffre and Nivelle |
| Falkenhayn | Germany +15 points | Kept: balances Pétain |
| Hindenburg & Ludendorff, **first version** (−1 Will every other month from 1917) | Germany −30 points | **Too harsh.** Changed to "must attack in Mar–Jul 1918" |
| Hindenburg & Ludendorff, final | Neutral | Kept |
| Haig, French, Foch, Pershing | Small (within noise) | Kept |

**All commanders together (200 games each):**

| Matchup | Germany | Entente | Stalemate |
|---|---|---|---|
| Standard vs Standard | 48% | 34% | 17% |
| Expert vs Expert | 34% | 44% | 22% |
| Turtle Germany vs Standard | 0% | 50% | 50% |
| Standard vs Turtle Entente | 100% | 0% | 0% |
| Reckless Germany vs Standard | 0% | 100% | 0% |
| Standard vs Reckless Entente | 66% | 32% | 2% |

The French mutinies now happen in about 2 games out of 3. That's mostly Nivelle's gamble
failing, as it did in 1917. Pétain's card then speeds up the recovery.

**Difficulty with commanders (80 games each):**

| Level | Careful as GER | Careful as Entente | Beginner as GER | Beginner as Entente |
|---|---|---|---|---|
| Recruit | 88% | 94% | 79% | 86% |
| Regular | 48% | 36% | 6% | 45% |
| Veteran | 30% | 29% | 4% | 39% |
| Field Marshal | 6% | 12% | 0% | 24% |

**Butcher's Bill calibration:**
- A standard game loses about 227 steps in total (GER 105, FRA 81, GBR 40).
- Real Western Front casualties were about 19.7 million, which gives **≈85,000 casualties
  per step**.
- The killed share is about 18–21% by nation, so the game uses 1 in 5.

## The war economy (Version 1.3, RULES.md §19)
The economy was designed with a reference simulator (see docs/ECONOMY.md §19.8). Its code is
now part of `tools/wfsim.py`, and the economy is on by default (`economy=True`; set
`economy=False` and German Will 105 to play Version 1.2). Re-run on 25 November 2026:

**Matchups** (200 games each; Germany / Entente / draw):

| Matchup | Germany | Entente | Draw | ECONOMY.md said |
|---|---|---|---|---|
| Standard vs Standard | 40% | 43% | 18% | 49 / 40 / 11 |
| Expert vs Expert | 45% | 42% | 13% | 43 / 44 / 13 |
| Turtle Germany vs Standard | 22% | 46% | 32% | 21 / 49 / 30 |
| Standard vs Turtle Entente | 100% | 0% | 0% | 100 / 0 / 0 |
| Beginner Germany vs Standard | 12% | 70% | 18% | 13 / 70 / 16 |
| Standard vs Beginner Entente | 46% | 48% | 7% | 44 / 52 / 5 |
| Reckless Germany vs Standard | 0% | 100% | 0% | 0 / 100 / 0 |
| Standard vs Reckless Entente | 57% | 42% | 0% | 54 / 45 / 2 |

**Difficulty** (80 games each; player win %):

| Level | Careful as GER | Careful as ENT | Beginner as GER | Beginner as ENT |
|---|---|---|---|---|
| Recruit | 74% | 85% | 70% | 84% |
| Regular | 43% | 43% | 12% | 48% |
| Veteran | 30% | 26% | 2% | 41% |
| Field Marshal | 9% | 15% | 1% | 16% |

**Why Standard vs Standard moved:** the reference computer aimed for 4 munitions in a
stockpile that holds only 3, so whenever its stockpile was full it threw away 1 IP a month.
The merged simulator follows RULES.md §19.7 (top up to 3). With `mun_target=4` it gives
Germany 48%, Entente 39%, draw 14%, matching ECONOMY.md. Everything stays inside the healthy
ranges below; a passive Germany still wins about 22% (ECONOMY.md's "watch in playtesting"
note still applies).

## One move per turn (26 November 2026)
The simulator broke RULES.md §8: it moved units in two passes, so a unit could move two
territories a turn. `tools/wfsim.py` now moves each unit once (`move_passes=1`; the old
behaviour is `move_passes=2`). **No [balanced] number has been changed.** These are the
results under the rules as written, and they lean to Germany:

| Matchup (200 games) | Germany | Entente | Draw | Before (2 moves) |
|---|---|---|---|---|
| Standard vs Standard | 56% | 34% | 10% | 40 / 43 / 18 |
| Expert vs Expert | 50% | 36% | 13% | 45 / 42 / 13 |
| Turtle Germany vs Standard | 34% | 58% | 8% | 22 / 46 / 32 |
| Standard vs Turtle Entente | 100% | 0% | 0% | 100 / 0 / 0 |
| Beginner Germany vs Standard | 11% | 74% | 15% | 12 / 70 / 18 |
| Standard vs Beginner Entente | 75% | 18% | 6% | 46 / 48 / 7 |
| Reckless Germany vs Standard | 0% | 100% | 0% | 0 / 100 / 0 |
| Standard vs Reckless Entente | 68% | 32% | 0% | 57 / 42 / 0 |

| Level (80 games, player win %) | Careful as GER | Careful as ENT | Beginner as GER | Beginner as ENT |
|---|---|---|---|---|
| Recruit | 75% | 80% | 70% | 48% |
| Regular | 57% | 36% | 9% | 20% |
| Veteran | 44% | 29% | 2% | 19% |
| Field Marshal | 15% | 14% | 0% | 8% |

Outside the healthy ranges: a passive Germany wins 34% (target under 20%), and a
beginner Entente wins only 20% on Regular. Choosing a fix is a rules decision, so it's a
question in DECISIONS.md (104).

**The game's engine** (`node tools/js-sim.mjs 50`) still gives Germany 70%, Entente 10%,
draw 20%. The simulator with one move and no commanders gives 59 / 29 / 12. Commanders
are in the simulator but not yet in the game (milestone 12). The rest of the gap: in
1915–16 the game's computer attacks about half as often (DECISIONS.md 100–101).

## Road moves of 2 territories (RULES.md Version 1.4, 26 November 2026)
You chose option (a) of DECISIONS 104: a road move goes up to 2 territories through your
own lines. The simulator now moves units in 2 one-step passes. A unit that went by rail
doesn't move again, and a unit that moved by road can't also go by rail. The old
simulator allowed road-then-rail, and that small difference is why the numbers aren't
quite back to 40 / 43 / 18. **No [balanced] number was changed.**

| Matchup (200 games) | Germany | Entente | Draw |
|---|---|---|---|
| Standard vs Standard | 50% | 34% | 15% |
| Expert vs Expert | 46% | 38% | 16% |
| Turtle Germany vs Standard | 24% | 45% | 31% |
| Standard vs Turtle Entente | 100% | 0% | 0% |
| Beginner Germany vs Standard | 10% | 76% | 14% |
| Standard vs Beginner Entente | 56% | 40% | 4% |
| Reckless Germany vs Standard | 0% | 100% | 0% |
| Standard vs Reckless Entente | 60% | 40% | 0% |

| Level (80 games, player win %) | Careful as GER | Careful as ENT | Beginner as GER | Beginner as ENT |
|---|---|---|---|---|
| Recruit | 74% | 81% | 71% | 75% |
| Regular | 52% | 32% | 6% | 38% |
| Veteran | 35% | 28% | 1% | 38% |
| Field Marshal | 9% | 18% | 0% | 16% |

**The game's own engine** (`node tools/js-sim.mjs 50`) went from Germany 70% / Entente 10%
/ draw 20% to **46% / 22% / 32%**, much closer to the simulator.

Still a little outside the healthy ranges: the Entente wins 34% of even games (target
35–55%), and a passive Germany wins 24% (target under 20%). The commander cards (milestone
12) give the Entente extra attacks in the simulator but aren't in the game yet. ECONOMY.md's
suggestion for a passive Germany (Kaiserschlacht −15 → −20) is still open; see
DECISIONS.md 105.

Splitting and merging (§8.1) aren't in the simulator. The computer only merges, and the
engine numbers above include that; splitting is a player tool.

## How to re-test after changing a rule
On the Mac, in the repo folder:
```
cd tools
python3 levels.py        # difficulty table (~5–10 minutes)
```
The simulator's defaults (`DEFAULT` and `TABLE0` in `tools/wfsim.py`) are the tuned values
above, matching RULES.md directly. Earlier, `tools/t2.py` patched in the harsher 1:2 and
1:1 columns and `levels.py` passed in the rest; both were folded into `wfsim.py`, and a
fixed-seed check gave identical results before and after.

Or ask Claude Code: *"I changed rule X in RULES.md. Update tools/wfsim.py to match, re-run
the balance tests and tell me if anything got lopsided."*

**Healthy ranges to keep:**
- Equal skill: each side wins 35–55% and stalemates stay under 25%.
- Turtle and reckless strategies win under 20%.
- Each difficulty level clearly steps down from the one before.

## Check with the game's own engine (JavaScript)
`node tools/js-sim.mjs 50` plays 50 complete computer-vs-computer wars with the real game
engine (fixed seeds). The first run (no commanders yet) gave Germany 52%, Entente 12%,
draw 36%, against the simulator's 48 / 35 / 18. The difference is being looked into; see
docs/DECISIONS.md, decisions 58–60. None of the numbers above were changed.

## One orders phase (RULES.md Version 1.6, milestone 10f, 26 November 2026)
A player now orders moves and attacks together and commits once; the moves are still
carried out before the attacks, exactly as the simulator and the computer play. Re-run to
confirm: `python3 tools/levels.py` gave the **same table as above to the percent**
(Recruit 74 / 81 / 71 / 75, Regular 52 / 32 / 6 / 38, Veteran 35 / 28 / 1 / 38, Field
Marshal 9 / 18 / 0 / 16), and `node tools/js-sim.mjs 50` gave the same **46% / 22% / 32%**.
**No [balanced] number was changed.** (The "move in to attack" helper only queues a road
move the player could already have ordered.)
