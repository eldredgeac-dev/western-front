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

## How to re-test after changing a rule
On the Mac, in the repo folder:
```
cd tools
python3 levels.py        # difficulty table (~5–10 minutes)
```
Or ask Claude Code: *"I changed rule X in RULES.md. Update tools/wfsim.py to match, re-run
the balance tests and tell me if anything got lopsided."*

**Healthy ranges to keep:**
- Equal skill: each side wins 35–55% and stalemates stay under 25%.
- Turtle and reckless strategies win under 20%.
- Each difficulty level clearly steps down from the one before.
