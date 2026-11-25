# Rules — Western Front 1914–18 (Version 1.2)

These rules are the source of truth. The code must do what this file says.

Version 1.2 adds commander cards, the Butcher's Bill, the monthly newspaper and Real
Voices (§15–18). It has been **balance-tested**: thousands of simulated computer-vs-computer games
(see `docs/BALANCE.md`). Numbers marked **[balanced]** were tuned by that testing. Change
them only if playtesting shows a problem, and then re-run `tools/wfsim.py`.

## 1. Overview
- **Sides:** Germany (GER) vs. the Entente: France (FRA), Britain (GBR), Belgium (BEL),
  and later the United States (USA).
- **Length:** **December 1914 to November 1918**. That's 48 turns, and **1 turn = 1 month**.
  (A mobile August 1914 opening is a later scenario.)
- **How you win:** break the other side's **National Will**, take Paris, or be ahead when
  the armistice comes (§11).
- **The core idea:** defending is much stronger than attacking. Terrain and each
  nation's strengths matter. Sitting still loses, because the blockade and the arrival of
  the Americans grind Germany down. Reckless attacks lose too.

## 2. The map: lanes and depth
- **12 lanes** run north (top) to south (bottom).
- **6 depth columns** run west to east: `E3 E2 E1 | G1 G2 G3`.
  - E3 is the Entente rear, E2 the Entente support line, E1 the Entente front line.
  - G1 is the German front line, G2 the German support line, G3 the German rear.
- Every grid square is a **box**. Boxes are adjacent if they share a side; there are no
  diagonals.
- At the start, the Entente owns all E boxes and Germany owns all G boxes.

| Lane | Name | Named boxes (VP) |
|---|---|---|
| 1 | Yser / Coast | E3 **Channel Ports** 8 · G3 **Bruges–Ghent** 2 |
| 2 | Ypres | E3 **Hazebrouck** 3 |
| 3 | Armentières / La Bassée | G2 **Lille** 3 |
| 4 | Artois (Loos, Vimy) | — |
| 5 | Arras | G3 **Cambrai** 2 |
| 6 | Somme | E3 **Amiens** 5 · G3 **St-Quentin** 2 |
| 7 | Noyon / Oise | E3 **Paris** 15 |
| 8 | Aisne / Chemin des Dames | G3 **Laon** 2 |
| 9 | Reims / Champagne | E2 **Reims** 2 · E3 **Châlons** 2 |
| 10 | Argonne | G3 **Sedan–Mézières rail** 5 |
| 11 | Verdun / St-Mihiel | E1 **Verdun** 5 · E3 **Bar-le-Duc** 2 · G3 **Metz** 4 |
| 12 | Lorraine / Vosges / Alsace | E3 **Nancy–Belfort** 2 · G3 **Strasbourg** 3 |

## 3. Terrain
Terrain changes how hard a box is to take. Draw each terrain type with its own colour or
pattern on the map, and list it in the box info panel. **Shifts apply to attacks INTO
the box.** See `docs/HISTORY.md` for why each place has the terrain it does.

| Terrain | Where | Effect |
|---|---|---|
| **Flooded** | Lane 1 E1 (the Belgians flooded the Yser plain, Oct 1914) | −2 columns |
| **Ridge / high ground** | G1 in lanes 2 (Passchendaele–Messines), 3 (Aubers), 4 (Vimy), 8 (Chemin des Dames) and 9 (Champagne heights); E1 and G1 in lane 11 (Verdun hills, Les Éparges) | −1 column. The defender sees everything coming. |
| **Flanders mud** | Every box in lanes 1–3 | −1 column in Sep, Oct and Nov (autumn rain). The high water table means trenches can't go deeper than level 2. |
| **Chalk** | Every box in lanes 4, 5, 6, 8 and 9 | Deep dugouts: trenches can reach level 3 from **June 1915**, a year earlier than elsewhere. |
| **Open rolling ground** | Every box in lanes 5, 6 and 9 | Tanks give **+2** columns instead of +1. |
| **Forest** | Every box in lane 10 (Argonne) | −1 column. Tanks give no bonus. |
| **Mountains** | Every box in lane 12 (Vosges) | −1 column. Tanks give no bonus. |
| **Fortress** | Verdun (lane 11 E1) and Metz (lane 11 G3) | −1 column |

A box can have more than one terrain type, and their shifts add up. For example, lane 2 G1
in October is a ridge with mud: −2.

## 4. National traits
Each army fought differently, and the game reflects that. These traits are shown on a
"Nations" info screen. [balanced]

**Germany**
- **Heavy howitzers (Dec 1914 – Dec 1915):** German attacks get +1 column. In 1914 Germany
  had far more modern heavy field howitzers than France or Britain.
- **Defence in depth (from Jan 1917):** when Entente units attack a German box with trench
  level 2 or more, the attacker loses +1 extra step. This models the outpost zone, the
  battle zone and the counter-attack divisions.
- **Stormtroopers (from Jan 1918):** see §5.
- **Strength in numbers at home:** Germany loses 1 Will per **3** steps lost; France and
  Britain lose 1 per 2. Germany had about 67 million people, France about 40 million.
- **Exhaustion (from Aug 1918):** all Entente attacks get +1 column. Germany faced the
  "Black Day" at Amiens, influenza, collapsing morale and the loss of its best troops.
- **No tanks:** Germany never gets Tank units. It built only about 20.

**France**
- **The 75s (Dec 1914 – Dec 1916):** German attacks on a French-defended box with trench
  level 0–1 get −1 column. France's quick-firing 75 mm field guns shredded attacks in the
  open.
- **Heavy artillery gap, then production surge:** French munitions per turn are 2 (1915),
  3 (1916), 4 (1917) and 5 (1918). France ended the war with about 6,000 heavy guns and
  supplied the US Army's artillery.
- **Renault light tanks:** +1 Tank unit in Apr 1917, Jun 1918 and Aug 1918.
- **Bleeding:** French replacements shrink to 2 per turn in 1916–17 and 1 per turn in 1918.

**Britain**
- **Shell crisis (1915):** only 1 munition per turn in 1915.
- **Kitchener's New Armies:** British infantry arriving Mar 1915 – Mar 1916 are **Green**
  until Jan 1917.
- **Dominion corps (from Apr 1917):** two British units become **Elite** (the Canadian
  Corps after Vimy and the Australian Corps).
- **Tanks first:** Tank units in Sep 1916, Nov 1917 and 2 in Aug 1918.
- **Supply by sea:** British units trace supply only to the Channel Ports or Hazebrouck.

**United States**
- **Big divisions:** US Infantry units have 5 steps.
- **Green on arrival:** each US unit is Green for its first 3 turns in France.
- **Uses French guns:** 1 munition per turn.

**Belgium**
- One unit that holds the flooded Yser. It can't attack.

**Unit quality**

| Quality | Effect when attacking |
|---|---|
| **Green** | If more than half the attacking steps are Green: −1 column |
| **Regular** | none |
| **Elite** (Dominion corps) | If any Elite unit attacks: +1 column |
| **Stormtroopers** (GER, 1918) | If the defender has a trench, cancel one trench shift (+1) |

## 5. Units
- **1 unit ≈ 5 infantry divisions.** Steps are max 4 (US Infantry 5, Tanks 2). Attack and
  defense strength both equal current steps.
- **Stacking:** at most 3 units in a box.

| Type | Max steps | Special |
|---|---|---|
| Infantry | 4 | — |
| US Infantry | 5 | Green for its first 3 turns |
| Tanks | 2 | +1 column when attacking (+2 on open ground, 0 in forest or mountains). Can't defend a box alone. |
| Stormtroopers | 4 | GER may convert up to 4 infantry units in Jan 1918 |

## 6. Resources (per nation, per turn; unused points are lost)
| Nation | Offensive Points (OP) | Munitions | Replacements (RP) |
|---|---|---|---|
| GER | 2 (1918: 4) | 3 | 3 (1917: 2, from Aug 1918: 1) |
| FRA | 2 | 2 / 3 / 4 / 5 (1915 / 16 / 17 / 18) | 3 (1916–17: 2, 1918: 1) |
| GBR | 1 (1916–17: 2, 1918: 3) | 1 (1916: 3, from 1917: 4) | 2 (from 1916: 3) |
| USA | 1 (from Aug 1918: 2) | 1 | 2 |
| BEL | 0 | 0 | 0 |

## 7. Turn sequence (each month)
1. **Events and reinforcements** (§10).
2. **German turn:** move (§8), then attack (§9).
3. **Entente turn:** move, then attack.
4. **Supply:** out-of-supply units lose 1 step.
5. **Dig in:** every box with units that was **not attacked** gains +1 trench, up to its
   maximum (§9.5).
6. **Replacements** (§9.6).
7. **National Will** update (§11), then the victory check.
8. **Newspaper** (§17), with the Butcher's Bill (§16) and any Real Voices quote (§18).
9. **Auto-save.**

## 8. Movement
- **Normal move:** 1 box into an adjacent friendly box, within stacking.
- **Rail move:** each turn, GER may rail-move **3** units, FRA **2** and GBR **1**. A rail
  move goes any distance through connected friendly boxes. A unit that rail-moves can't
  attack this turn.
- Enemy boxes are captured only by attacking (§9). An empty enemy box is attacked at 4:1.
- Units that attacked can't move afterwards.

## 9. Combat
### 9.1 Declaring an attack
1. Choose an enemy **target box**.
2. Choose attacking units in friendly boxes **adjacent** to it. Each unit attacks at most
   once per turn, and must be in supply.
3. Pay **1 OP**, or **2 OP** if the attackers come from more than one nation.
4. Optionally spend munitions on a barrage, +1 column each: up to **2**, or up to **3** from
   June 1916 (creeping barrage).
5. **Before the player confirms, show them** the final column, the chance of taking the
   box, the expected losses on each side, and a list of every shift that applied (terrain,
   traits, trench and so on).

### 9.2 Finding the column
1. **Ratio** = attacking steps ÷ defending steps.
2. Pick the highest column it reaches: **1:2, 1:1, 3:2, 2:1, 3:1, 4:1**
   (0.5, 1, 1.5, 2, 3, 4). Below 1:2 you can't attack.
3. Add up all the shifts:
   - −1 per defender trench level
   - terrain (§3)
   - national traits and unit quality (§4)
   - −1 in winter (Dec, Jan, Feb)
   - +1 per munition spent
   - tanks (§5)
   - events (§10)
4. After shifts, clamp the result to 1:2 at the bottom and 4:1 at the top.

### 9.3 Combat table (roll 2d6) [balanced]
**A** = steps the attacker loses, **D** = steps the defender loses, **R** = the defender
retreats and the attacker may advance.

| Roll | 1:2 | 1:1 | 3:2 | 2:1 | 3:1 | 4:1 |
|---|---|---|---|---|---|---|
| 2–4 | A4 D0 | A3 D1 | A3 D1 | A2 D1 | A2 D2 | A1 D2 |
| 5–6 | A3 D1 | A3 D1 | A2 D2 | A2 D2 | A1 D2 | A1 D3 R |
| 7 | A3 D1 | A2 D1 | A2 D2 | A1 D2 | A1 D3 R | A1 D3 R |
| 8–9 | A2 D1 | A2 D2 | A1 D2 | A1 D3 R | A1 D3 R | A0 D4 R |
| 10–11 | A2 D1 | A2 D2 | A1 D3 R | A1 D3 R | A0 D4 R | A0 D4 R |
| 12 | A2 D2 | A1 D3 R | A1 D3 R | A0 D4 R | A0 D4 R | A0 D5 R |

**Averages** (use these as a unit test of the table code):

| Column | Avg attacker loss | Avg defender loss | Chance of R |
|---|---|---|---|
| 1:2 | 2.75 | 0.86 | 0% |
| 1:1 | 2.39 | 1.44 | 3% |
| 3:2 | 1.75 | 2.00 | 17% |
| 2:1 | 1.39 | 2.28 | 42% |
| 3:1 | 1.00 | 2.75 | 58% |
| 4:1 | 0.58 | 3.28 | 83% |

### 9.4 Results
- **Taking losses:** step losses come off the strongest unit first, one at a time (the
  player may choose). A unit at 0 steps is destroyed and goes to the rebuild pool (Tanks
  aren't rebuilt). Losses beyond the defenders' steps are ignored.
- **Retreat (R):**
  - Defenders move 1 box away into a friendly box, preferring deeper boxes. Units that
    can't retreat are destroyed.
  - The attacker may advance up to 2 units, and the box changes owner.
- **Dug in:** if the trench level is 2 or more, an R becomes **"+1 D loss, no retreat"**.
  If the defenders are wiped out, the attacker may advance anyway.
- **Captured boxes** drop to trench 0.
- **Futile attack:** an attack at a **final column of 1:1 or worse** that doesn't take the
  box costs the attacking nation **3 Will** [balanced]. Careful attacks at 3:2 or better
  cost no Will beyond the losses themselves.

### 9.5 Trench maximum
| Period | Normal | Chalk | Flanders mud |
|---|---|---|---|
| Dec 1914 – May 1915 | 1 | 1 | 1 |
| Jun 1915 – May 1916 | 2 | **3** | 2 |
| From Jun 1916 | 3 | 3 | **2** |

E1 and G1 boxes start at trench 1; all other boxes start at 0.

### 9.6 Supply and replacements
- **Supply:** a unit is in supply if it can trace friendly boxes to its side's rear
  column (E3 or G3). GBR units must trace to the Channel Ports or Hazebrouck instead.
  - Out-of-supply units can't attack, and lose 1 step in the supply phase.
- **Replacements:**
  - 1 RP adds +1 step to an in-supply unit.
  - 2 RP rebuild a destroyed unit at 1 step in a rear box.

## 10. Events and reinforcements
| Month | Event | Effect |
|---|---|---|
| Apr 1915 | **First gas attack** | Germany's first attack this turn in lane 2 gets +2 columns. |
| 1916 | **Blockade** | GER −1 Will every other month. |
| 1917 | **Turnip Winter** | GER −1 Will every month. |
| 1918 | **Hunger** | GER −2 Will every month. [balanced] |
| Jun 1916 | **Creeping barrage** | Max barrage becomes 3. |
| Feb 1917 | **U-boat decision** (GER choice) | **Unrestricted:** GBR −2 Will per turn for 6 turns, and the USA declares war in Apr 1917. **Restricted:** the USA declares war in Jan 1918. |
| Mar 1917 | **Hindenburg Line** (GER choice) | Give up the G1 boxes in lanes 5–8. G2 in those lanes becomes trench 3, and GER gets +2 rail moves this turn. |
| Apr 1917 | **Vimy / Dominion corps** | 2 GBR units become Elite. |
| first time FRA Will < 35 | **French mutinies** | French units can't attack for 3 turns, then FRA +10 Will. Happens once. |
| Dec 1917 | **Russia leaves the war** | GER +10 Will. Eastern transfers begin. |
| Jan 1918 | **Stormtroopers** | GER converts up to 4 infantry units. |
| Apr–Oct 1918 | **Kaiserschlacht gamble** | If Germany makes **no attack** between Apr and Oct 1918, GER −15 Will at the end of Oct. [balanced] Germany must strike before the Americans arrive in force. |
| Aug 1918 | **German exhaustion** | See §4. |
| Nov 1918 | **Armistice** | The game ends after this turn (§11). |

**Reinforcements** (placed in the nation's rear boxes):
- **GER:**
  - +1 in each of Mar 1915, Jun 1915, Sep 1915, Jan 1916, Apr 1916, Jul 1916 and Oct 1916
  - +2 in Mar 1917 and +2 in Jun 1917
  - Eastern transfers: +3 in Jan 1918, +3 in Feb 1918, +2 in Mar 1918
- **FRA:** +1 in each of Feb 1915, Apr 1915, Jun 1915 and Sep 1915.
- **GBR:**
  - Infantry, Green: +2 Mar 1915, +2 May 1915, +2 Jul 1915, +1 Sep 1915, +2 Jan 1916,
    +1 Mar 1916
  - Tanks: see §4
- **USA** (US Infantry), starting 7 months after the declaration. With an Apr 1917
  declaration:
  - +1 in each of Nov 1917, Mar 1918 and Apr 1918
  - +2 in each of May and Jun 1918
  - +3 in each of Jul and Aug 1918
  - +2 in Sep 1918, +1 in Oct 1918
  - With a later declaration, shift the whole schedule later by the same number of months.
  US units arrive in the southern lanes (9–12) when there's room.

## 11. National Will and victory [balanced]
**Starting Will** (before any difficulty bonus, §13):
- GER **105**, FRA **75**, GBR **85**
- USA **90**, from the turn it enters the war
- BEL has none; Belgian losses count against FRA

**Each turn:**
- −1 Will per **3** steps lost for GER and USA, and per **2** steps lost for FRA and GBR
  (rounded down)
- **Losing a named box:** the owner loses its VP in Will. A box in lanes 1–3 counts
  against GBR; the rest count against FRA.
- **Taking a named box:**
  - Germany gains ½ its VP (rounded down).
  - The Entente gains ¼ of its VP for both FRA and GBR.
- **Paris taken:** FRA −25, GER +10. **Channel Ports taken:** GBR −15.
- Events (§10) and futile attacks (§9.4).

**Sudden victory** (end of any turn):
- **Germany wins** if FRA or GBR Will reaches 0, or Germany owns Paris.
- **The Entente wins** if GER Will reaches 0.

**Armistice (end of Nov 1918).** Work out the **Armistice Score**:
1. Start with GER Will − the average of FRA and GBR Will.
2. Add the VP of the Entente named boxes Germany owns.
3. Subtract the VP of the German named boxes the Entente owns.

| Score | Result |
|---|---|
| more than +2 | **German victory** (a negotiated peace on German terms) |
| less than −2 | **Entente victory** (the historical result) |
| −2 to +2 | **Stalemate peace** (a draw) |

Show the running Armistice Score on the main screen, so the player always knows who's
ahead.

## 12. Starting setup (December 1914)
- **GER (17 units):** one infantry unit in every G1 box, plus one each in G2 of lanes 2,
  6, 7, 8 and 11.
- **BEL (1):** E1 lane 1.
- **GBR (2):** E1 lanes 2 and 3.
- **FRA (18):** one in E1 of lanes 4–12, plus one each in E2 of lanes 1, 2, 4, 6, 7, 8, 9,
  11 and 12.
- Everything starts at full strength.

## 13. Difficulty levels [balanced]
Choose a difficulty and a side on the New Game screen. The computer opponent always
follows the same rules, so the levels only change the starting conditions shown here.

| Level | Your Will | Computer's Will | Computer's munitions and RP | Computer plays like | Advisor |
|---|---|---|---|---|---|
| **Recruit** | +15 | — | ×0.8 | Standard | On: warns before futile attacks and points out weak boxes |
| **Regular** | — | — | ×1.0 | Standard | Odds preview only |
| **Veteran** | — | +5 | ×1.15 | Standard | Odds preview only |
| **Field Marshal** | — | +10 | ×1.3 | Expert | Odds preview only |

- As the Entente, the Will bonus goes to each of your nations (FRA, GBR and later USA).
- Multiplied resources are rounded to the nearest whole number.
- **Advisor (Recruit):** before confirming an attack at 1:1 or worse, show "This attack
  will probably fail and cost 3 Will. Attack anyway?" Highlight any friendly front box
  that's empty or has fewer than 3 steps.

**Which side to start with:**
- **The Entente is more forgiving.** A beginner as the Entente wins about as often as a
  careful player.
- **Germany punishes mistakes.** It has fewer men and a clock running against it.
- New players should start as the Entente on Regular, or as Germany on Recruit.

## 14. Computer opponent
The AI uses the same rules and the same order format as the player.
1. **Repair:** RP go to the weakest units in the most threatened boxes.
2. **Defend:** threat of a box = adjacent enemy steps − own steps − 2 × trench
   + 0.3 × VP (+6 if empty). Fill the highest-threat front boxes first, using normal
   moves, then rail.
3. **Attack:** for each possible attack and munitions spend, work out:

   `score = P(take) × (box value + depth bonus) + W × (enemy Will lost − own Will lost) × 3
            − 0.5 × expected own step losses − 0.15 × munitions`

   - box value = VP, or 1 if the box has none
   - depth bonus = 0.5 per column past the start line
   - Will lost is worked out from expected step losses and each nation's loss rate
   - W = 0.5 (Standard) or 1.0 (Expert)
   - Expert also adds a quarter of the VP of any named box next to the target.
   - Make the best attacks while their score is above 0, picking randomly among scores
     within 10% of the best.
   - Only attack at **2:1 or better** after shifts. Stop once expected losses this turn
     exceed next turn's RP + 2.
4. **Historical urges:** +2 to the score of these attacks:
   - Germany on Verdun, Feb–Jun 1916
   - Germany in lanes 1–6, Mar–Jun 1918
   - Britain in lane 6, Jul–Sep 1916
5. As Germany, the AI chooses Unrestricted U-boats and takes the Hindenburg Line.

## 15. Commander cards [balanced]
Each nation has one commander at a time, shown as a card with a portrait area, their
name (and a nickname only if they really had one, like "Papa Joffre" or "Black Jack"),
dates, a **Strength** and a **Flaw**. Draw the portrait as a simple silhouette or
monogram, not a photograph. Commanders change on historical dates, but the player gets
a say (§15.2). The computer always follows history.

### 15.1 The cards
| Card | Nation | Historical dates | Strength | Flaw |
|---|---|---|---|---|
| **Joffre** "Papa Joffre" | FRA | Dec 1914 – Nov 1916 | **Offensive drive:** FRA +1 OP every Mar–Oct | **Attaque à outrance:** in any Mar–Oct month with no French attack, FRA −2 Will |
| **Nivelle** | FRA | Dec 1916 – Apr 1917 | **The Nivelle Method:** FRA +1 munition per turn. Once, one French attack gets +2 columns (player chooses which). | **Broken promise:** if that +2 attack fails to take its box, the **French mutinies start immediately** |
| **Pétain** | FRA | from May 1917 | **Care for the men:** FRA loses 1 Will per **3** steps instead of 2. Mutinies last 2 turns instead of 3, then FRA +15 Will. | **"Wait for the tanks and the Americans":** FRA OP max 1 per turn |
| **Foch** | All Entente (Allied Generalissimo) | from Apr 1918 (added alongside the national cards) | **Unified command:** coalition attacks cost no extra OP. FRA and GBR +1 rail move each. | — |
| **Sir John French** | GBR | Dec 1914 – Nov 1915 | **Old Contemptibles:** the 2 starting British units are Elite | **Prickly ally:** GBR units can't join coalition attacks with France |
| **Haig** | GBR | from Dec 1915 | **The Big Push:** GBR +1 OP from 1916 | **Lloyd George's distrust:** GBR RP −1 in Jan–Apr 1918 (reserves held back in Britain) |
| **Falkenhayn** | GER | Dec 1914 – Aug 1916 | **"Bleed France white":** French steps lost defending Verdun cost FRA an extra 1 Will per 4 steps | **Penny-packets:** GER max 2 rail moves per turn |
| **Hindenburg & Ludendorff** | GER | from Sep 1916 | **Hindenburg Programme:** GER +1 RP per turn | **The last gamble:** in Mar–Jul 1918, any month with no German attack costs GER −3 Will |
| **Pershing** "Black Jack" | USA | when the USA enters | **Hard training:** US units are Green for 2 turns instead of 3 | **No amalgamation:** US units can't join coalition attacks until Sep 1918 |

### 15.2 Choices about commanders
- **Historical change:** when a commander's historical end date arrives, show the
  next card and ask **"Replace [old] with [new]?"**
  - **Accept:** the new card takes over.
  - **Keep the old commander:** costs −3 Will now, and the question comes back every 3
    turns.
  - Nivelle can only be appointed while his window is open (Dec 1916 – Apr 1917). If you
    skip him, Pétain is offered in May 1917.
- **Sacking:** you may sack your commander early and bring in the next card on the list
  if it's available. That costs −5 Will. You can't sack a commander in their first 3
  turns.
- **Order of succession:** FRA Joffre → Nivelle → Pétain (Pétain is also available instead
  of Nivelle from Dec 1916). GBR French → Haig. GER Falkenhayn → Hindenburg & Ludendorff.
- **Foch** and **Pershing** arrive on their dates and can't be sacked.

### 15.3 Where to show it
- Show the current commander card for each nation on the Nations screen.
- When a new card arrives, show it full screen with its Strength and Flaw, and a
  one-paragraph history note from `docs/HISTORY.md`.

## 16. The Butcher's Bill [balanced]
**Every step lost ≈ 85,000 casualties** (killed, wounded and missing). About **1 in 5**
casualties is killed. This scale was calibrated so that a typical full game totals about
19–20 million Western Front casualties, close to the real figure.

- **End of every turn:** a short "Butcher's Bill" line under the newspaper, e.g.
  *"This month: 340,000 casualties (France 170,000 · Germany 127,000 · Britain 43,000)."*
- **Running total** on the Nations screen, by nation, with a "killed" estimate (×0.2).
  Round to the nearest 1,000.
- **Milestones** (shown once each in the newspaper):
  - 1 million casualties
  - 5 million (triggers the Owen quote)
  - 10 million
  - 15 million
- **End of game report card:** your totals next to the real ones. Real Western Front
  casualties were about Germany 7.5M, France 7.9M, Britain and Empire 3.9M, USA 0.45M.
  The report card also shows your Will and cities against 11 November 1918.
  Example: *"Your war cost 16.2 million casualties, 3.5 million fewer than history."*

## 17. The monthly newspaper
At the end of every turn, a newspaper front page appears before the next month starts.
It has four parts.

1. **Masthead:** the paper of the side you play.
   - As the Entente: **THE DAILY DISPATCH** — London & Paris.
   - As Germany: **DIE KRIEGSZEITUNG** — Berlin.
   - Dated the last day of the month (e.g. "Thursday, 30 September 1915").
2. **Main headline:** generated from what happened in your game this month. Pick the
   highest-priority item:

   | Priority | What happened | Example headline |
   |---|---|---|
   | 1 | Game over | "ARMISTICE!" / "PARIS FALLS!" / "GERMANY SUES FOR PEACE" |
   | 2 | A named box captured | "AMIENS TAKEN! [Side] Drive Toward the Sea" |
   | 3 | Mutinies, US entry, Russia leaving the war, or a new commander | "NIVELLE OUT — PÉTAIN TAKES COMMAND" |
   | 4 | A box captured | "GAINS AT [lane name] — Enemy Line Broken" |
   | 5 | The biggest battle: the most steps lost in one attack | "BLOODY REPULSE AT [lane name]" or "[lane name] HOLDS" |
   | 6 | Nothing above | "QUIET ON THE FRONT — Nothing to Report" |

   Write the headline templates in `data/headlines.json`, with 2–3 versions of each so
   they don't repeat.
3. **Censorship (it's propaganda):** your own paper spins the news.
   - Your victories are "GLORIOUS". Your defeats become "STRATEGIC READJUSTMENTS".
   - Your losses are reported as "light". The **Butcher's Bill** line underneath gives
     the true numbers, in small print: *"Figures withheld by the censor: 340,000."*
4. **"Elsewhere in the World":** 2–3 real headlines for that month from `data/news.json`.
   These cover sports, politics, other fronts and disasters, Dec 1914 – Nov 1918.

Tap anywhere to dismiss it. Keep the last 12 papers in a **Newspaper Archive** reachable
from the menu, so the player can scroll back through their war.

## 18. Real Voices
Short real quotes from soldiers, poets and leaders appear at key moments. The full list
and their triggers are in `data/quotes.json`.

- Each quote appears **once per game**, in italics, under the newspaper headline or on the
  relevant event pop-up, with who said it and when.
- All quotes were published before 1929, so they're public domain. When adding more,
  keep to that rule.
- Triggers include:
  - game start (Grey's "The lamps are going out…")
  - the first attack in Flanders (McCrae)
  - Verdun attacked in 1916 (Pétain)
  - the US entering the war (Wilson, Stanton)
  - a failed big attack (Sassoon)
  - the Butcher's Bill passing 5 million (Owen)
  - the German drive of 1918 (Haig)
  - August 1918 (Ludendorff)
