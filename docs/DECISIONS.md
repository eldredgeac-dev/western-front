# Decisions and questions (overnight work)

**Summary:**
- Milestones 3 (units and selection) and 4 (turn loop, movement, rail) are built,
  with their screens.
- The combat engine of Milestone 5 is built, with no screens yet.
- So are `data/commanders.json` and `data/headlines.json`.
- 82 tests pass. The combat table test reproduces the RULES.md §9.3 averages exactly.
- The three questions are answered (see **Questions for you (answered)**). The things to try on the
  phone are in **Check on my phone** at the end.

While you were away I worked through Milestones 3 and 4 and the combat engine of
Milestone 5 on the branch `claude/laughing-faraday-6gey0m`. Wherever the rules or your
instructions left something open, I made the most reasonable choice and wrote it down
here. Nothing tagged [balanced] in RULES.md was changed.

Each entry says **what** I chose and **why**. If you disagree, tell me the number and
I'll change it.

## Decisions

### Process
1. **One pull request.** This branch already had pull request #4 (the map). GitHub only
   allows one open pull request per branch, so I updated #4 to cover all of tonight's work
   instead of opening a second one.
2. **Milestone 2 isn't ticked** in MILESTONES.md, because you haven't checked it on the
   phone yet. Milestones 3–5 are built but also not ticked, for the same reason.

### Milestone 3: units and selection
3. **Starting quality.** All starting units are Regular. Sir John French's "Old
   Contemptibles" make the 2 British units Elite, but that's a commander card (Milestone
   11). It will switch on then.
4. **Rail moves for the USA and Belgium are 0.** RULES.md §8 only lists GER 3, FRA 2 and
   GBR 1.
5. **France's munitions in December 1914 are 2.** RULES.md §6 lists 2 / 3 / 4 / 5 for
   1915–18 but nothing for the single 1914 turn, so I used the 1915 value.
6. **Counters scale with zoom.** Zoomed out, each territory shows one small marker in the
   colour of its top unit, with the number of units. From mid zoom you see the real
   counters (STYLE.md §5), which stay about 30px on screen when fully zoomed in. Taps go
   through counters to the territory underneath, so a tap always selects a territory.
   Its units are then listed in the panel.
7. **Unit names** use an adjective ("French infantry"), so `nations.json` gained an
   `adjective` field.

### Milestone 4: turn loop, movement and rail
8. **You give orders for both sides for now.** Until the computer opponent arrives
   (Milestone 9), End Phase steps through German move → German attack → Entente move →
   Entente attack. In each phase you can move that side's units: hot-seat, so you can test
   both.
9. **Phases that belong to later milestones are already in the list** (`data/phases.json`)
   but do nothing yet: events and reinforcements (9), supply losses, replacements and Will
   (7), newspaper (12). Reinforcements are in RULES.md §10 with the events, so they come
   with Milestone 9.
10. **One move per unit per turn:** either a normal move or a rail move, not both.
    RULES.md doesn't say whether a unit can do both; one move is simpler and matches
    `tools/wfsim.py`.
11. **A rail move can end anywhere joined by friendly boxes**, including next door (it
    just uses a rail move). Rail doesn't check supply.
12. **How to move:** select a unit in the panel, then tap a brass-outlined territory. If
    the territory is next door, it's a normal move; otherwise a rail move, which uses one
    of the nation's rail moves.
13. **Turn 48 (November 1918):** after its last phase the game shows "The war is over",
    and End Phase is greyed out. The Armistice Score and victory check come with
    Milestone 7.
14. **Dispatches:** the log shows the last 8 lines in the panel, newest first, in the
    typewriter font.

### Milestone 5: the combat engine (no screens yet)
15. **Built to RULES.md.** The combat table is copied from RULES.md §9.3, and a test checks
    it reproduces the §9.3 averages exactly (1:2 → 2.75 / 0.86 / 0% … 4:1 → 0.58 / 3.28 /
    83%). See question 1 about the simulator.
16. **The pending rule fixes in MILESTONES.md** that combat needs are built as suggested
    there:
    - French 75s count if any French unit defends (fix 5).
    - An empty box is taken with no roll for 1 OP (fix 7).
    - Tanks alone count as empty and fall back (fix 8).
    - Retreats go to the deepest friendly box with room, first in the list if equal
      (fix 9).
    - Losses come off the strongest unit first, automatically (fix 10).
17. **Who pays.** The nation with the most attacking steps pays the OP (1, or 2 for a
    coalition) and the munitions, and takes the 3 Will if the attack is futile. This
    matches pending fix 6. RULES.md doesn't say whose OP a coalition spends.
18. **The attacker advances automatically** with its 2 strongest surviving units. RULES.md
    says "may advance up to 2". Choosing which units (or not advancing) can come with the
    attack screen.
19. **Paris and the Channel Ports.** Their extra Will (FRA −25 and GER +10; GBR −15) is
    added on top of the normal VP change, as `tools/wfsim.py` does.
20. **Tanks on two terrains.** If a box had two terrains that change the tank bonus, the
    smaller bonus counts. No box has that today.
21. **Supply in combat.** Attackers must be in supply (`supply.js`). Losing steps for
    being out of supply comes with Milestone 7.
22. **Not yet built (later milestones):**
    - Will from step losses each month, Will on capture of unnamed boxes (none in the
      rules), and the victory check (Milestone 7).
    - Event shifts like the April 1915 gas attack (Milestone 9). The engine already
      accepts them as `extraShifts`.
    - Commander effects (Milestone 12).
    - The attack screen and its animations (Milestones 5–6).

### Side jobs: commanders and headlines (data only, no code yet)
23. **`data/commanders.json`** holds all nine §15 cards.
    - Each Strength and Flaw has machine-readable `effects` for Milestone 12, and each card
      has a short history note taken from HISTORY.md.
    - Foch's card is marked as "added alongside" the national cards, and Pershing's start
      date is "when the USA enters".
24. **`data/headlines.json`** has 2–3 versions of every §17 headline type, each with a
    headline and a line under it.
    - Where it matters, there are "ours" and "theirs" versions, so your own paper can spin
      bad news ("LINE ADJUSTED AT the Somme").
    - All the wording is in English, including for the German paper (DIE KRIEGSZEITUNG),
      because the game is in English.

### Second night: the order slip (Milestone 5 screen)
25. **Milestone numbers.** Your list called supply "Milestone 6", saves "7" and events "8".
    In MILESTONES.md they're 7, 8 and 9, because "Feel and sound" became 6. I built them
    in your order and use the MILESTONES.md numbers in commits and docs.
26. **Item 1 (simulator and nicknames) was already done** from your previous message
    (commits `4e0c3cf` and `37b61e2`), so there was nothing more to do there.
27. **How an attack starts.** In an attack phase, tap any enemy territory. The order slip
    opens with every unit that may attack it already chosen. Tap units to leave them out,
    and use − / + to add munitions. The slip updates the odds as you go, and the
    grease-pencil arrow shows the plan on the map. CONFIRM ORDER rolls the dice and the
    slip shows the result; Close puts it away.
28. **The slip lists only units that may attack** (next to the target, in supply, not yet
    attacked or railed, able to attack). It doesn't show the ones that can't, with
    reasons. That could be added later.
29. **No animation yet.** The dice result appears at once, typed on the slip. Dice
    tumbling and the stamp animation are Milestone 6 (Feel and sound).

### Milestone 7: supply, replacements, National Will, mutinies, victory
30. **Replacements are spent automatically for both sides for now**, the way RULES.md
    §14 says the computer does it.
    - Repairs go first: the weakest unit in the most threatened box.
    - Then 2-RP rebuilds: basic infantry at 1 step in the most threatened rear box with
      room (pending fix 11).
    - Letting you choose where your own RP go can come with the Nations ledger screen.
      It's in Later ideas.
31. **Rebuilt British units** appear at the Channel Ports or Hazebrouck (their supply
    sources). Other nations' appear in their rear column (E3 or G3).
32. **Will from losses** is worked out per turn and rounded down, and Belgian losses are
    counted separately against France (pending fix 15). Losses from being out of supply
    count too.
33. **Mutiny timing.** The first time French Will is below 35 at the Will phase, French
    units can't attack for the next 3 turns. France then gets +10 Will. It never happens
    again. Nivelle's and Pétain's changes come with the commander cards (Milestone 12).
34. **The war ends** as soon as a sudden-victory condition is met at the end of a turn
    (FRA or GBR Will 0, Germany owns Paris, GER Will 0). Otherwise it ends after
    November 1918 with the Armistice Score. The result appears in the panel.
35. **"Entente named boxes Germany owns"** for the Armistice Score means named boxes in E
    columns (they start Entente) now owned by Germany, and the same the other way round.
36. **The running Armistice Score** is in a new "The war" section of the panel, with each
    nation's Will and any mutiny. Positive means Germany is ahead.
37. **Supply losses happen in the supply phase**, before dig-in. A unit cut off for
    several turns dies after as many turns as it has steps.

### Milestone 8: save, export, import
38. **Auto-save after every change** (each move, attack and End Phase), not only at the
    end of each turn. Closing the app never loses a move, and it costs nothing
    noticeable.
39. **One save slot.** New Campaign replaces it, and Continue loads it. Export a file
    first if you want to keep an old war.
40. **Export:** on the iPhone, Export opens the share sheet (Save to Files, AirDrop,
    Mail); on a computer it downloads `western-front-1915-01.json`, named after the
    month. **Import** reads such a file back and starts playing it at once.
41. **Every save is checked before it's played:** right app, a version it understands,
    every box and unit valid. A bad file gives a plain message ("That file isn't a Western
    Front save") instead of breaking the game.
42. **Old saves are upgraded.** A version 1 save (owners and trenches only) keeps its
    month, owners and trenches, and gets the starting units back, minus any that would
    stand in territory their side no longer owns. A save from a *newer* version is
    refused, with a message to reload the page.
43. **The `?demo` sample war is never saved**, so it can't overwrite your real campaign.

### Milestone 9 (first half): events and reinforcements
44. **Events happen at the start of the month**, in the "Events and reinforcements"
    phase, before the German move.
    - The blockade (−1 in Feb, Apr, Jun, Aug, Oct and Dec 1916), the Turnip Winter (−1
      every month of 1917) and Hunger (−2 every month of 1918) total the same as
      `tools/wfsim.py`, which applies them at the end of the month.
    - These monthly drains don't write a log line every month, to keep Dispatches
      readable.
45. **Questions (U-boats, the Hindenburg Line)** appear at the top of the panel as
    "DECISION REQUIRED". End Phase is greyed out until you answer. The computer side (once
    the AI is on) answers the way RULES.md §14 says: Unrestricted, and fall back.
46. **U-boat pressure:** Unrestricted costs Britain 2 Will in February 1917 and in each of
    the next 5 months (6 turns).
47. **Reinforcements** arrive in a random rear box (E3/G3) with room, picked through the
    seeded dice (pending fix 14). British units arrive in lanes 1–6 and US units in
    lanes 9–12. With no room, a unit waits for next month.
    - Choosing the box yourself can come later; it's in Later ideas.
48. **Green units.** Kitchener's men (1915–16) are Green until January 1917. US units are
    Green for their first 3 months (a unit arriving in November 1917 becomes Regular in
    February 1918).
49. **Tanks.** British tanks arrive September 1916, November 1917 and 2 in August 1918.
    French Renault tanks arrive April 1917, June 1918 and August 1918 (RULES.md §4). They
    can't be rebuilt.
50. **Who gets the upgrades.** Vimy makes the two strongest British infantry units Elite,
    for good (pending fix 12). In January 1918 Germany's four strongest infantry units
    become stormtroopers automatically ("up to 4"; choosing which can come later).
51. **The Kaiserschlacht gamble** is checked at the start of November 1918: if Germany
    made no attack in April–October 1918, it loses 15 Will.
52. **Not done yet:** event pop-ups as telegrams (Milestone 6 polish) and Real Voices
    quotes (Milestone 13). The French mutinies are handled with Will (Milestone 7); the
    armistice ends the game after November 1918.

### Milestone 9 (second half): the computer opponent
53. **The AI mirrors `tools/wfsim.py`**, the AI the game was balance-tested with, wherever
    RULES.md §14 leaves room:
    - It attacks with one nation at a time, using every eligible unit of that nation next
      to the target.
    - It tries every munitions spend and picks the best score.
    - It adds the simulator's small random "noise" to scores (±10% standard, ±5%
      expert). RULES.md's "pick randomly among scores within 10%" does the same job.
    - Expert weighs its own losses at 0.6 instead of 0.5, as in the simulator.
54. **One difference from the simulator: AI units move once per turn**, like the
    player's. In `wfsim.py` a computer unit could move twice in one move phase (two
    passes). Keeping the game's own rule seemed right; item 7 shows whether it matters.
55. **New Campaign** now asks for your side (Entente, Germany, or "Two players": you give
    orders for both, which is handy for testing) and a difficulty. The Will bonus also
    goes to the USA when it enters, if you play the Entente.
56. **The Recruit advisor** warns on the order slip before an attack at 1:1 or worse.
    Highlighting weak front boxes isn't built yet; it's in Later ideas.
57. **The computer's turn happens at once** when you tap END PHASE after your last phase.
    Its moves and attacks appear in Dispatches. Animating them is Milestone 6 (Feel and
    sound).

### Item 7: 50 computer-vs-computer wars with the game's own engine
58. **The JS engine's results are far from docs/BALANCE.md.** I ran 50 complete wars
    with `node tools/js-sim.mjs 50` (seeds 1–50, Standard vs Standard, ~2.5 seconds per
    war). I also ran the Python simulator without commanders, because commanders aren't in
    the JS game yet (Milestone 12).

    | | Germany wins | Entente wins | Draw | Avg turns | Early end | French mutinies |
    |---|---|---|---|---|---|---|
    | **JS engine** (no commanders) | 52% | 12% | 36% | 48.0 | 0% | 6% |
    | wfsim.py, no commanders, 50 games | 34% | 46% | 20% | 47 | 0% | 40% |
    | BALANCE.md, Standard vs Standard | 48% | 35% | 18% | 47 | ~5% | ~1 in 3 |

    - **Game length is right**: wars run to November 1918, as in BALANCE.md.
    - **The Entente wins far less often, and France rarely mutinies.** The main
      difference is that **the Entente attacks about half as often** in the JS game: about
      17 attacks per war against 33 in the simulator. Germany makes about 28 against 39.
      Fewer attacks mean fewer losses, so French Will stays high (50 at the end against
      40), mutinies are rare, and more games end in a draw.
      Captures fall too: 28 per war against 51.
    - **I did not change any balance numbers or the AI to close the gap**, as you said.
59. **What I checked, and what it wasn't:**
    - The monthly OP, munitions and RP, and the trench maximums, are the same in both.
    - **Moving twice:** letting AI units move twice, as the simulator does (decision 54),
      made it *worse* (Germany 80%). That test wasn't kept.
    - **Rebuilding before repairing**, as the simulator does, barely changed anything
      (20 wars: Germany 50%, Entente 25%). That test wasn't kept either.
60. **Likely causes still to look at** (questions for you, below). The JS game follows
    RULES.md where the simulator took short cuts. The gap is most likely in what counts as
    a legal or worthwhile attack:
    - The JS AI only counts a box as **taken if some attackers survive** to move in. The
      simulator may count a win whenever the defenders are cleared.
    - JS attacks need **OP to pay the full cost** (coalition and empty-box costs from
      RULES.md §9). The simulator may charge less in some cases.
    - **Supply and rail** details differ slightly: JS checks supply each phase.
    - **Random numbers** come from one seeded stream in JS and several in Python, so single
      games can't be compared one-to-one; only the averages can.

### Milestone 10: UI overhaul
61. **Milestone numbers changed.** The UI overhaul is milestone 10, so Playtest is now
    11, Commander cards 12, the Newspaper 13 and Home-screen polish 14. Earlier notes
    in this file were updated to the new numbers.
62. **Animations moved.** Barrage, dice, losses and capture animations, skipping, fast
    mode and Reduce Motion are built in the UI overhaul (orders, then commit). Milestone
    6 keeps the sounds, the Will gauge and date-flip animations, and the STYLE.md §13
    interface details.
63. **Milestones ticked:** 2, 3, 4, 5, 7 and 8 (everything passed on your phone).
    Milestone 9 stays open for the event telegram pop-up and the Nations screen.

64. **Pieces (part 1).** Each piece is a block in the nation's colour with a lighter
    bevel, a darker side face and a shadow. The shades are the nation colour mixed with
    paper or ink, so no new colours appear. It shows a flat silhouette, the nation's mark,
    the quality badge, the small military symbol and a big Courier strength number on a
    paper chip, with pips under it.
65. **German pieces face left, Entente pieces face right**, so both armies face the
    enemy. This is set by `faces` on each side in `data/nations.json`, not hard-coded.
66. **Where pieces stand is worked out on your screen, not by the map builder** (a
    change from the plan). Town names keep a steady size on screen while the map zooms,
    so a spot that's clear at one zoom isn't at another. Each time you zoom, every stack
    tries a list of spots beside its town and takes the first that covers no town name,
    town symbol, VP ring, pencil note or other stack, and stays inside its own territory.
    - If a village or landmark name is in the way, that name is hidden.
    - In a few cramped territories at some zooms, nothing fits. The piece then covers as
      little of a name as it can, rather than standing in the wrong territory.
67. **Piece sizes on screen:** 26 px zoomed out (the simple version), 32 px at mid zoom,
    40 px fully zoomed in.

68. **The bigger map (part 2).** The map now shows about half as much again in every
    direction, at the same scale: out to Le Havre and Dover, Amsterdam, Münster and
    Frankfurt, Stuttgart, Berne and Dijon. That area is scenery: coast, rivers, borders and
    23 big towns (`sceneryTowns` in `tools/map-extra.json`).
69. **The territories are exactly as before.** All 72, with the same neighbours, and
    68 of them have identical outlines; the other 4 moved by a point or two where they
    meet the old map edge.
    - Letting rear territories spread into the new scenery changed which territories
      touched each other, so they stop at the old map edge.
    - That edge, with its terrain, contours, roads and railways, fades out softly over a
      short distance instead of stopping in a straight line.
70. **The map always fills the screen.** You can't zoom out past "fill the screen", and
    you can zoom in further than before.
    - It starts zoomed in at mid detail on your most threatened front-line territory, by
      the same threat score the computer uses (RULES.md §14), or the middle of the front
      in a two-player game.
    - **Front** (the old **Fit** button) shows the whole front line.
    - A flick makes the map glide to a stop (not with Reduce Motion), and arrow keys pan
      it on a computer.
71. **The locator map** (top left) is a live mini-map: territories in their owners'
    colours and the front line, with a red box for the part on screen. Tap it to jump
    there. On the folded phone it hides while the panel is open.

72. **Orders, then commit (part 3).** In your move and attack phases, orders are
    queued, not carried out:
    - a move is a dashed ink arrow;
    - an attack is set up on the order slip as before, but **ADD TO ORDERS** draws a red
      arrow labelled with its column and chance ("2:1 · 58%");
    - the panel lists the queued orders, each with **CANCEL**, plus the OP and munitions
      left to spend. Tapping an arrow highlights its order there;
    - each new order is checked as if the earlier ones had happened: stacking counts
      queued moves, a unit can only be in one attack, and queued attacks set aside their
      OP and munitions;
    - giving a unit a new move replaces its old order.
73. **COMMIT ORDERS** replaces END PHASE (just "COMMIT" on the folded phone). It carries
    out the orders in the order you gave them, then runs on to your next phase, with the
    computer playing its side in between. The game is saved before the turn plays back,
    so closing the app mid-animation loses nothing.
74. **No rule changes.** Move and attack phases stay separate (your answer). Each attack
    is checked again when its turn comes at commit; one that's no longer possible (say,
    its units were lost in an earlier attack) is skipped, with a line in Dispatches.
    Attack dice are still rolled one attack at a time, in the queue's order, through
    `rng.js`. A test checks that committing two attacks gives exactly the same game as
    making them one by one.
75. **The playback (STYLE.md §8):**
    - Each group of orders (your moves, your attacks, the enemy's moves, then its
      attacks) shows its arrows first.
    - Then pieces slide along the arrows (0.6 s) and a barrage puffs over the target with
      a 2 px shake (0.6 s).
    - The dice tumble on a small order slip (0.8 s) and show the roll, the losses and a
      stamp; a short pause lets you read them.
    - Losses float up in red, and a captured territory's colour cross-fades (0.6 s).
    - If the action is off screen, the map jumps to it.
    - **A tap on the map** hurries the current animation; **SKIP** jumps to the end.
    - **Fast mode** (Settings, at the bottom of the panel) keeps only the captures.
      **Reduce Motion** on the phone turns playback off entirely; Dispatches still list
      everything.
76. **The computer's turn is recorded as it plays**, without changing what it decides. A
    test plays 16 phases with and without the recording and checks the games are
    identical, so the balance is untouched.
77. **Saves are now version 3** (they hold the queued orders). Version 2 saves load with
    an empty queue.

78. **The War Office (part 4)** opens from the **War Office** button at the bottom left
    of the map. It's a paper ledger with Courier figures:
    - one column per nation in the war, swiping sideways on the folded phone, with the
      row names staying put;
    - each nation's Will as a number and an ink gauge that drains, with the change since
      last month;
    - OP, munitions, replacements and rail moves as "left / this month's allowance";
    - units, strength, the Butcher's Bill (this month, whole war, killed), the commander
      and whether it can attack.
    Below the table: the Armistice Score and what it means, the strength chart, the
    cities each side holds, this month's events and lasting effects, and countdowns (US
    troops, the next reinforcements, the end of the war).
79. **New records, no rule changes.** At the end of every month the game keeps a row
    (Will, strength and steps lost per nation) and a running loss total. Saves are now
    version 4; older saves start these records from the month they're loaded. The
    85,000 casualties a step and "1 in 5 killed" (RULES.md §16) are in
    `data/victory.json` (`butchersBill`).
80. **The commander shown is the historical one for the date** (from
    `data/commanders.json`). Their effects, and replacing them, come with the Commander
    cards milestone (12).
81. **The strength chart** draws the Entente as a solid horizon-blue line and Germany as
    a dashed ink line, each labelled at its end, with a legend. Tap or hover to read a
    month.
    - I checked the colours with a colour-blindness tool: the two lines are easy to tell
      apart.
    - The field-grey of Germany's own colour was too close to horizon blue, which is why
      Germany is drawn in ink.
    - The tool calls both colours "too grey"; that's STYLE.md's deliberate muted palette,
      so I kept them.

### Question 4 follow-up: why the game's Entente attacks less (report only, nothing changed)
82. **First findings.** I compared the computer's attack choice in
    `js/engine/ai.js` with `ai_attack` in `tools/wfsim.py` line by line.
    - **These match:** the scoring formula (value × chance + Will swing − losses −
      munitions), the depth bonus, 1 OP per single-nation attack, the "stop after RP + 2
      steps lost" rule, and trying every munitions spend.
    - **Difference 1: what counts as "taken".** The simulator counts a box as taken
      whenever its defenders are cleared, even if every attacker died. The game also
      requires an attacker to survive and move in, which is the RULES.md wording. A
      temporary test with the simulator's definition (20 wars, then undone) gave Germany
      40% / Entente 25% / draw 35%, about 18 Entente attacks a war. That's within chance
      of the current game, so **this isn't the main cause**.
    - **Difference 2: the simulator caps nothing.** Its expected attacker loss can be
      more than the attackers have; the game caps it. That makes the game's AI *bolder*,
      so it isn't the cause either.
    - **Ruled out earlier:** resources, trench limits, moving twice, rebuild order
      (decisions 58–59).
    - **Where the gap is:** over 10 wars, the game's Entente made only about 2 attacks
      per war in 1915, against Germany's 4; in 1917 the two sides were close. So the
      Entente rarely finds an attack worth making in 1915–16.
    - **Still to check:** whether the game's computer keeps French units back in the
      second and third lines (decision 54's "units in front boxes stay" rule moves
      reserves up only to the most threatened boxes), so fewer stand next to a target.
      Also whether the game's trenches are deeper on average in 1915–16 than the
      simulator's.
    - **My suggestion:** let me add a small counting tool to both simulators (attack
      odds available to the Entente each month, and how many French units stand in the
      front line), compare them, and bring you one fix with the numbers before and
      after. I haven't changed any code or numbers.

### After merging pull request #5: "I don't see the 3D pieces"
83. **The merge and the site build both worked:** GitHub Pages deployed commit e088bbc
    successfully. The phone was showing old, cached files. I loaded the merged code as
    an iPhone, an unfolded phone and a desktop, and it works there.
84. **The title screen now shows the version** ("Version 10.1 · Milestone 10 …"), so you
    can see at a glance whether your phone has the latest code.
85. **Phones now fetch new files after each update.** Every file is asked for with a
    version stamp (`?v=10.1`): the stylesheet, `main.js`, every other script (through an
    "import map" in `index.html`), the data files and the map. A test checks that no
    script is missed, and CLAUDE.md says to raise the number with every release.

### The war economy (RULES.md §19, from docs/ECONOMY.md)
86. **ECONOMY.md is merged into RULES.md as §19**, with §4, §6, §7, §9.1, §9.6, §10, §11
    and §13 updated to match, and German starting Will 108. ECONOMY.md stays as the design
    record with a note at the top.
87. **Difficulty multiplies only the base Industry** (you chose this): round(base ×
    multiplier), then the war-economy bonus, cities and research are added. That's what
    the simulator did when the numbers were balanced.
88. **Industry never goes below 0.** The reference simulator could go negative if France
    lost Paris and Amiens in 1915; I clamped it at 0, in the simulator and the game.
89. **The computer aims for 3 munitions, not 4.** The reference simulator aimed for 4 in a
    stockpile that holds 3, so it threw away 1 IP a month whenever its stockpile was
    full. I followed RULES.md §19.7 instead. Standard vs Standard moved from 49/40/11 to
    40/43/18 (Germany/Entente/draw), still inside the healthy ranges. Setting
    `mun_target=4` in `tools/wfsim.py` gives 48/39/14, matching ECONOMY.md. Tell me if
    you'd rather keep the old numbers.
90. **The munitions stockpile is the old "munitions" figure.** It now carries over from
    month to month instead of being refilled, starts the war at 0, and only the War
    Office budget adds to it. Barrages spend it exactly as before.
91. **The budget comes in a new "War Office budget" phase**, straight after events and
    reinforcements, before Germany moves. The computer and Auto-allocate spend at once;
    otherwise the turn waits for **SIGN THE ESTIMATES** (like an event question).
92. **Auto-allocate starts ON on Recruit and in two-player games**, OFF on the other
    levels. The checkbox on the budget page changes it. The player's Auto-allocate has no
    3 IP research cap (ECONOMY.md only gives the cap to the computer). Old saves load with
    Auto-allocate on.
93. **Research progress put into a tech that then arrives historically is spent.** The
    simulator did the same.
94. **Commander changes to Manpower and Industry** (Hindenburg & Ludendorff +1 MP,
    Nivelle +1 IP, Haig −1 MP) wait for milestone 12, since the commander cards aren't in
    the game yet. The simulator already has them.
95. **The A7V tank** comes in a German rear territory like any reinforcement. Germany's
    "No tanks" trait now mentions it.
96. **The research ledger** (every tech, progress bar, dates, a history note) is at the
    bottom of the budget page. Research in progress also shows on the War Office
    dashboard, with its expected month. A separate Research page is in "Later ideas".
97. **The reference simulator folder** (`tools/tools/econ_reference/`, uploaded one
    folder deeper than ECONOMY.md said) is deleted now that `tools/wfsim.py` has the
    economy, as its README asked.

### Clearer play (no rule changes)
98. **Bug check: attacks work.** A scripted turn-1 attack (three French units stacked in
    the Somme front line, barrage of 2, at 3:1) was run through the engine and through
    the real screen. Losses, retreats, advances, the change of owner, trench 0, OP and
    munitions all came out right, with no errors. Two tests now cover it. What felt
    broken was the screen: the result flashed for about a second, pieces jumped instead
    of moving, and nothing explained why most attacks were 0–3%.
99. **Why the odds jump 0 / 3 / 17 / 42 / 58 / 83%:** that's the chance of an R in each
    column of the table. Most turn-1 attacks are 1 unit against 1 at 1:1, then −1 trench,
    −1 winter, so about 3%. Each German front territory touches only one of yours, so
    the way to attack is to stack 3 units in that one territory. From trench 2 a box
    holding 8 steps is 0% at any odds (dug in: you must destroy every step). The rules
    are unchanged; the slip, the How to Play page and the guided turn now say all this.
100. **The game's computer vs the simulator (Germany 70% / Entente 10% vs 40 / 43).**
     Two causes found:
     - **The simulator broke RULES.md §8.** It moved units in two passes, so a unit could
       move two territories a turn. Fixed to one; see BALANCE.md for the re-run.
     - **The simulator plays with commander cards, the game doesn't yet** (milestone 12).
       Joffre's and Haig's extra Offensive Points are a big part of the Entente's attacks.
     With both differences removed the simulator gives Germany 59%, Entente 29%, draw 12%.
101. **Not found yet:** the rest of the gap. In 1915–16 the game's computer attacks about
     half as often as the simulator's (Entente 2–3 a year against 7–8), and it attacks
     empty territories much less. I've put "find the rest" in Later ideas rather than
     guess. No [balanced] number was changed.
102. **The guided first turn** uses seed 4 (seed 1 since decision 137). If you follow the steps, the attack succeeds
     (it's a 58% attack, so on another seed it might not). Auto-allocate is on, so the
     budget page doesn't interrupt it.
103. **Battle reports aren't saved.** They're kept until your next COMMIT, so reloading
     the page clears them. The log (Dispatches) still has every result.
104. **Question for you: the balance under the one-move rule.** With the simulator obeying
     RULES.md §8, Germany wins 56% of even games and a passive Germany 34% (tables in
     BALANCE.md). I changed no [balanced] number. Two possible fixes:
     - **(a) Make the rule what was balanced:** "a unit may move up to 2 territories by
       road through its own territory". That's what the simulator did when the numbers
       were tuned, and it would also make massing troops easier to learn.
     - **(b) Keep 1 territory** and raise the Kaiserschlacht penalty (−15 → −20), as
       ECONOMY.md suggested for a passive Germany, then re-run.
     I'd suggest (a). Tell me which, and I'll update RULES.md, the game and the tests.
     **Answered: (a).** Road moves go up to 2 territories (RULES.md §8, Version 1.4).
105. **The balance after (a)** (tables in BALANCE.md): the simulator gives Germany 50%,
     Entente 34%; the game's own engine 46 / 22 / 32 (it was 70 / 10 / 20). A unit can't
     go by road and then by rail in the same turn, because "each unit moves once" in
     RULES.md. The old simulator allowed it, which is the main reason it isn't back to
     40 / 43. If playtesting shows Germany still too strong or too comfortable sitting
     tight, my suggestion is ECONOMY.md's: Kaiserschlacht −15 → −20. I haven't changed it.
106. **Splitting and merging** (RULES.md §8.1), as you chose:
     - Only in your move phase. It doesn't use a move.
     - The 3-pieces-per-territory limit stays, so the new piece needs room.
     - A piece that already moved splits into two moved halves; otherwise each half moves
       on its own.
     - Tanks can't split or merge.
     - A merged piece takes the lower quality (so an Elite piece merged with a Regular one
       becomes Regular) and the later Green date.
     - The piece merged away **doesn't** go to the rebuild pool. Otherwise merging would
       be free rebuilds.
107. **The computer merges but never splits.** At the start of its move phase it merges
     damaged pieces of the same nation and type in one territory, strongest kept. Merges
     aren't animated in the playback, but each one is in the Dispatches.

### Milestone 9 (last part): event telegrams and the Nations screen (no rule changes)
108. **Every §10 event arrives as a telegram** sliding up from the bottom: "TELEGRAM —
     URGENT", the date, what happened and "WHAT THIS MEANS". The wording is in
     `data/events.json` (`telegram` on each event and option) and `data/nations.json` (the
     USA's entry, the French mutinies), not in the code. Telegrams change nothing in play and
     use no dice: 4 computer-vs-computer wars (`node tools/js-sim.mjs 4`) give exactly
     the same results before and after this change.
109. **What sends a telegram** (your answers 1 and 3):
     - every dated event in its month: gas, the creeping barrage, Vimy, Russia, the
       stormtroopers, the U-boat decision and the Hindenburg Line;
     - the blockade, the Turnip Winter and Hunger only in the first month each starts (the
       Nations screen shows them while they last);
     - the USA declaring war, with the month its first troops are due; the French mutinies
       starting and ending;
     - two notices that change nothing: April 1918, "Germany must attack by October 1918",
       and August 1918, German exhaustion (its effect was already a trait);
     - the Kaiserschlacht penalty in November 1918, only if it happens.
     - Not commanders: their changes come with the commander cards (milestone 12). The
       telegram can already ask a question, so they'll reuse it.
110. **Questions** (the U-boats and the Hindenburg Line) are now a telegram with a brass
     button for each answer and its consequences underneath, instead of the panel's
     DECISION REQUIRED card. It can't be tapped away, and COMMIT stays grey until you answer.
111. **The computer's choices** are telegrams too: "Germany has declared unrestricted
     submarine warfare. WHAT THIS MEANS: Britain loses 2 Will each month for 6 months. The
     United States will enter the war in April 1917; its troops follow 7 months later."
112. **When they appear** (your answer 2): after the enemy's turn has played back, never
     over an animation. Several in one month queue up ("1 of 3"); tap for the next. Only the
     first slides up (0.3 s, a transform; none with Reduce Motion), the rest replace it.
113. **Saves are now version 6** (they keep the telegrams and how many you've read). Older
     saves start with none, except a question that's waiting, which becomes a telegram.
114. **The Telegrams log** in the ☰ menu lists every telegram, newest first, with the
     answer you gave to each question.
115. **The Nations screen is the War Office ledger, rearranged.** At the top: the Armistice
     Score, a line saying who's winning and the biggest reason (Will, or cities taken),
     and the countdowns: US troops, next reinforcements, the Kaiserschlacht deadline (from
     January 1918; "Germany has attacked: no penalty" once it has), the mutinies, the
     U-boat pressure on Britain, the end of the war. Then **one page per nation** with name
     tabs, swiped sideways: Will (gauge, trend and a small Will-over-time chart),
     Manpower, Industry, the stockpile, OP and rail moves, research, units and strength,
     the VP cities its side holds, casualties, the commander, and "In effect": every trait
     and event affecting it, marked NOW, COMING or OVER, each with one line. Belgium gets a
     page too. The strength chart, cities and "This month" stay below.
116. **One tap from the map** (your answer 4): a brass **Nations** button at the bottom left
     of the map shows the running score. The ☰ menu item is now "Nations (War Office)".
117. **Small data fixes for the Nations screen** (wording only, no numbers): Britain's shell
     crisis and France's "Bleeding" got dates so they show as over or coming at the right
     time, and two trait lines now match RULES.md §4 (Industry, not munitions). The
     Entente side got `theName` ("the Entente") so sentences read properly.
118. **Readability:** the small italic notes in the ledger were in ink-faded, which is
     just under the WCAG AA contrast on paper (4.4 : 1). They're in ink now.
119. **A layout bug found while checking:** on a folded phone, once the USA is in the war,
     the phase line ("OP: FRA 2 · GBR 2 · USA 1 · rail …") made the whole screen wider than
     the phone, so the BEST ATTACKS button was cut off. The screen's single column can now
     shrink, so the line ends in "…" instead.

### Milestone 12: commander cards (Version 11.0, RULES.md Version 1.7)
120. **How it's built.** `js/engine/commanders.js` reads the effects written in
     `data/commanders.json`; no commander is named in the code. Each nation holds one card
     (`state.commanders`), and Foch is held by the Entente side, "alongside" the national
     cards. A new **Commanders** step comes straight after Events each month (RULES.md
     §7): cards that arrive on their dates (Foch, Pershing), the computer's historical
     changes, and your "Replace X with Y?" questions. The month's OP, Manpower and rail
     moves include the cards once no question is waiting. Saves are now version 7;
     older saves get the historical cards for their date.
121. **Interpretations I had to make** (all written into RULES.md §15.2 and §15.2a; tell
     me if any is wrong):
     - **"Keep" comes back every 3 turns**, and also in a month when a successor's own
       date arrives. That's how "skip Nivelle and Pétain is offered in May 1917" works.
     - **Sacking needs an available successor.** Nivelle only in his window, Pétain only
       from December 1916; Haig and Hindenburg & Ludendorff at any time. So you can sack
       Sir John French or Falkenhayn early (−5 Will), but not Joffre before December 1916.
       It's done from the commander card on the Nations screen, with a second tap to
       confirm.
     - **A sacked commander's replacement** brings its Will flaws and combat rules at once,
       but its OP, Manpower, Industry and rail only from next month (this month's were
       already handed out).
     - **Nivelle's +2** is a toggle on the order slip of a French-paid attack. It isn't
       spent on an empty territory. If the attack fails, the mutinies start at once (so
       later French attacks that month are cancelled), unless they already happened.
     - **"No French attack" (Joffre) / "no German attack" (H&L)** count coalition attacks
       with that nation's units.
     - **Mutiny length under Pétain** is counted in turns served: 2 instead of 3, decided
       by whoever is in command at each Will phase. The simulator used a slightly
       different check (it only shortened a mutiny that started on a Will phase); I
       changed `tools/wfsim.py` to match the game, so both now do the same thing.
     - **Nivelle's "+1 munition"** in `data/commanders.json` became "+1 Industry", as
       RULES.md §15.1 and §19.2 say (decision 94). Data wording only.
122. **The computer follows history**: it appoints the historical successor on the date,
     never keeps or sacks, and uses the Nivelle Method on its best French attack in
     April 1917, like `tools/wfsim.py`.
123. **The card screens (STYLE.md §6, §12.7).** A card is cream card stock with a brass
     hairline: a portrait oval in the nation's colour with an ink head-and-shoulders
     silhouette and a monogram band (no photographs), the name in IM Fell, a real
     nickname in italics, the dates in Courier, and the Strength and Flaw in two ruled
     boxes with small brass ribbons (the Flaw box is dashed). The history note from
     `data/commanders.json` is underneath in italic IM Fell.
     - **A question** ("Replace Sir John French with Haig?") fills the screen: the new
       card(s), each with a brass APPOINT button, then the old card small with KEEP and
       its cost. COMMIT stays grey until you answer.
     - **A card that arrives** (Foch, Pershing, or any change on the computer's side)
       shows full screen once, after the turn's playback, before the telegrams.
     - **The Nations screen** shows each nation's card under its figures, with Foch on
       every Entente page from April 1918, and the sack button (or why you can't yet).
     - Checked against STYLE.md §11: palette colours only, no emoji or clip art, IM Fell
       + Source Serif + Courier, nothing animates, readable at 390 px wide.
124. **A bug fixed on the way: answering an event question skipped that month's War
     Office budget.** After the U-boat or Hindenburg Line answer, COMMIT stepped past the
     budget phase, so Germany got no munitions or research that month (February and
     March 1917 for a German player). Answering now carries the turn on through the
     Commanders step and the budget, like SIGN THE ESTIMATES does. A test covers it.

### Balance after the commanders, Kaiserschlacht −20, and the counting tool
125. **The new numbers** (tables in BALANCE.md). The game's engine with commanders:
     Germany 56%, Entente 30%, draw 14% (it was 46 / 22 / 32 without them). Raising the
     Kaiserschlacht penalty to −20 changed **nothing** in 50 wars or in the simulator's
     200-game tables (same seeds, same results): a careful computer Germany always
     attacks in 1918.
126. **The simulator never applied the Kaiserschlacht gamble.** Its check was nested
     inside an old Entente setting that is switched off. Fixed. With the gamble really
     in, a passive Germany wins 0% (was 24%), Standard vs Standard is 48 / 38 / 14, and
     every healthy range holds. A beginner Germany on Recruit falls to 16% (was 71%),
     because the beginner stand-in rarely attacks in 1918; a person gets a warning
     telegram and a countdown. Worth watching in playtesting.
127. **The counting tool** (`tools/count.py`, `tools/count.mjs`) answers decision 82: the
     French aren't held back (17.3 French units in the line a month in both) and the
     trenches aren't deeper. The game's computer spreads its reserves one per territory
     because it re-ranks the front after every move; the simulator ranks once and stacks
     them. So France gets a third fewer 2:1 attacks.
128. **The one fix I propose (not applied):** rank the front once per move phase, as
     the simulator does. 50 wars: Germany 56 → 28%, Entente 30 → 44%, draw 14 → 28%. It
     fixes the Entente but overshoots on Germany and draws, so I'd approve it and then
     re-run 200 wars before touching anything else. Your call.
129. **`tools/matchups.py`** prints BALANCE.md's matchups table (there was no script for
     it). `turn.js` gained an optional "probe" for the counting tool; it only looks.

### V2a: buying units with Industry (Version 11.1, RULES.md Version 1.8, §19.9)
130. **The design you approved:** Infantry 6 IP + 2 MP, arriving with 2 steps; Tanks 8 IP +
     1 MP, 2 steps, once the nation has its tank research. War limits: Germany 4 infantry
     and 1 tank, France 2 and 3, Britain 3 and 3, the USA none. Orders open in January
     1915. IP carries over like research; the Manpower is taken in the month it's paid in
     full (or it waits for a month with enough); it arrives the month after. History and
     the simulator results are in RULES.md §19.9 and BALANCE.md.
131. **You pick the rear city** (your answer). On the budget page, under "New units", a row
     of ledger tabs lists the nation's rear cities that your side holds (Britain: the
     Channel Ports, Hazebrouck and Amiens). If that city is lost or full when the unit
     arrives, it goes to a random other rear city with room, or waits a month. The
     computer and Auto-allocate pick at random. The rear cities are listed in
     `data/economy.json` (`units.depots`), not in the code.
132. **The budget page** keeps its brass slider (Munitions ↔ the rest). When a nation
     can both research and buy a unit, a second slider splits the rest between Research
     and New units. Below the research list: the unit tabs (each with its progress bar,
     its cost and how many are left in the war), the city tabs, and one line saying what
     happens this month ("Infantry: 5 of 6 IP paid. 1 more to go." / "paid for. It takes
     2 MP from Replacements now and arrives at Paris in April 1917." / "…needs 2 MP and
     there is only 1 this month. It waits."). The Nations screen has a new "New units"
     row: what's being paid for, what's on its way, and "Bought: Infantry 1 of 4".
133. **Auto-allocate and the computer** buy a tank when they can, otherwise infantry, with
     whatever is left after munitions and research (the computer still puts at most 3
     IP a month into research). The simulator does the same.
134. **The budget page now appears more often** with Auto-allocate off: from January 1915
     there's a real choice (save for a unit or not) until a nation has used its limit.
     Auto-allocate is still on by default, so most players won't see it.
135. **Small choices I made:** new units are Regular (not Green); IP put in beyond a
     unit's cost (switching from tanks to infantry) carries over to the next unit; the
     War Office's Manpower figure is the month's Manpower before a new unit takes its
     men. **The computer's stop-loss** ("stop once expected losses pass RP + 2", §14) now
     counts the month's full Manpower, before any went to a new unit, as the simulator
     does. That changed nothing measurable, but it keeps the two the same. Saves are now
     version 8 (older saves start with nothing bought).
136. **The game's engine disagrees with the simulator** (BALANCE.md, V2a). With purchases
     the simulator gives 43 / 47 / 10, but `node tools/js-par.mjs 200` gives **Germany 62%,
     Entente 26%, draw 12%** (it was 45 / 37 / 18). The Entente's 26% is outside the healthy
     range (35–55%). I split it up: German purchases change almost nothing (47 / 36 / 18);
     **Entente infantry purchases are what hurts the computer Entente**, even when they
     cost no Manpower or arrive at full strength. Its tanks don't (42 / 39 / 20). The
     computer France gets the same number of good attacks on offer but takes fewer, and
     more of its pieces stand in the rear. It's the same gap as decision 101 (the game's
     computer attacks less than the simulator's), made bigger by more pieces. I haven't
     found the exact cause, so I haven't changed the computer. See the question below.

137. **Found it: the computer's move phase** (answers 101 and 136). `aiMove` in
     js/engine/ai.js didn't move pieces the way `ai_move` in tools/wfsim.py does:
     - it ranked the front by threat **once**; the simulator ranks it again at the
       start of each of its **two passes**;
     - a piece whose target wasn't next door made a road move of up to 2 territories
       first, and only then tried rail. The simulator tries **rail first**, otherwise steps
       1 territory towards the target, and carries on in the second pass.
     So the game's computer piled its pieces into a few territories and spent its rail
     moves differently. Both sides then got fewer good attacks, and the more pieces
     the Entente had, the worse it got. The attack phase (`aiAttack`) already matched.
     **Fix:** `aiMove` now copies `ai_move` exactly. The two passes are worked out on a
     scratch copy of the board, then each piece gets **one** real order from where it
     started (a road move of up to 2 territories, or a rail move), so the rules are
     unchanged. RULES.md §14 step 3 now describes the move in full. No [balanced]
     number changed.
     **Results** (`node tools/js-par.mjs 200`, with purchases): **Germany 48%, Entente
     40%, draw 13%** (it was 62 / 26 / 12). Attacks per war 61 → 77. The Entente now
     attacks 10–13 times a year in 1915–16, as in the simulator (it was 5–8). Without
     Entente infantry purchases it's 40 / 46 / 14. Infantry still costs the computer
     Entente about 6 points, nearly all in 1918 (4.6 attacks against 6.1), but that's
     close to the noise of 200 wars (the simulator's own gap is 2 points: 46 / 40 / 14
     against 44 / 42 / 14). So **the computer Entente keeps buying infantry**, as the rule
     says (question 7 below).
     The guided first turn moved from seed 4 to **seed 1**: Germany's computer turn now
     plays out differently, and on seed 4 the 58% attack failed (102).

### Milestone 10g: the board as a map of territories (Version 11.3, no rule changes)
138. **What you asked for:** the board should look like Axis & Allies, with territories
     shaped like real ones again, but still easy to play on a phone. Plan agreed: this
     milestone first (looks only), then V2c, then decide on fewer depth territories
     (milestone B) after playing on the new board.
139. **How the shapes are made.** `js/ui/board.js` bends the 12 × 6 layout into a
     stretched map: each border is a gently wavy line (shared by both neighbours), the
     corners are nudged, lanes have slightly different heights, and the front keeps its
     real salients (Ypres east, Noyon and St-Mihiel west, numbers in `BOW`). The "random"
     nudges come from a fixed hash of each border's name, so the board is the same every
     time; game rolls still only use `js/engine/rng.js`. `map.js` draws on it unchanged:
     the borders are straight-line paths, as it expects.
140. **Owner colour 60%** (your choice from the 50 / 60 / 75% previews). STYLE.md §2, §4.5
     and §4.12 updated; the campaign map keeps 30%.
141. **No lane strips or column letters** (your answer). Region names run down the
     margins instead: FLANDERS (Yser to La Bassée), ARTOIS (Loos to Arras), PICARDY (the
     Somme, the Oise and the Aisne, which are all Picard départements), CHAMPAGNE (Reims),
     ARGONNE, LORRAINE (Verdun to Nancy) on the French side, and ALSACE opposite Lorraine.
     The margins are the only place a piece or a name can never stand, so the names can't
     cover either. To make room the margins grew from 6 to 19 units and a territory's
     usual width went from 64 to 61; on a folded phone a territory is about 59 × 68 px.
142. **Place names instead of grid wording** (your answer). I checked every player-facing
     text: telegrams, the order slip, the tray and details, How to Play, the Nations
     screen, events, the log, battle reports and headlines.
     - `boxName` now gives a territory's town ("Laventie") instead of "Armentières /
       La Bassée E1". Battle reports, the log and the slip all use it. A test checks no
       name contains a lane or E/G label.
     - Details: "Lane 3 · Armentières / La Bassée" became "Sector: Armentières / La
       Bassée"; "Line: E1 – Entente front line" became "Line: Entente front line".
     - Gas (April 1915): "lane 2" became "the Ypres sector" (telegram, log, Nations screen).
     - The Hindenburg Line: "lanes 5–8" became "from Arras to Soissons", which is where
       the real 1917 withdrawal ran.
     - How to Play's little diagram labels its columns Rear / Support / Front instead of
       E3 … G3.
     - RULES.md still uses lanes and E1/G1: it's the rules for the code, not a screen.
143. **Two small layout fixes found by the new tests:** a piece is centred halfway between
     its territory's west and east borders (not the average of the outline, which drifted
     when the Noyon salient squeezed Compiègne), and the borders behind a salient bend
     almost as much as the front itself, so no territory gets pinched.
144. **Tests added:** every territory holds its whole piece; every territory is at least
     44 px each way on a 390 px phone; every pair of neighbours shares one border that
     lies on both outlines; the board is the same every time. 206 tests pass.
145. **Speed** (`node tools/perf.mjs board`, 4× slowdown, old and new measured on the same
     machine): first playable board 1727 → 1856 ms (target < 2 s), tap feedback 31 → 22 ms,
     pan 60 fps, pinch 56 fps, AI turn 54 → 58 ms. Every target is still met, so the
     borders weren't simplified. The margin on first load is thin (about 0.15 s); if a
     later change pushes it over, cut each border from 10 segments to 6 in `wavyLine`.
146. **The square board is gone** (your answer); the Map button still switches to the
     campaign map. Version 11.3.

### V2c: design approved, simulator only (switched off)
147. **The approved V2c design** (to build in its own session after this merges): an
     attack costs **1 IP from the munitions stockpile** (2 for a coalition attack; Foch
     makes it 1); barrages still use the stockpile; the stockpile holds **6**; each nation
     makes **at most 3 attacks a month**; the Entente's maximum barrage is **+1 from January
     1918**. Commanders' OP effects become attack-limit effects: Joffre +1 attack a month
     in March–October, Haig +1 attack a month from 1916, Pétain at most 1 attack a month,
     Foch's coalition attacks cost no extra IP. The nations' OP schedules go away.
     - Simulator results (200 games, matchups; 80 games, levels) and the IP-thrown-away
       table were in the chat on 27–28 November; they go into BALANCE.md when V2c is built.
       Standard vs Standard 44 / 39 / 18, Expert vs Expert 38 / 48 / 14, passive play still
       0%.
     - The "beginner Entente beats the careful one" oddity was noise plus the first
       design's Haig/Joffre +1 IP: over 600 games each the beginner Entente wins 48% and
       the careful one 46%. A bigger stockpile on its own would lift the beginner to 71%;
       the 1 IP attack cost cancels that, so the two parts belong together.
     - In `tools/wfsim.py` it's behind switches that are off by default (`attack_ip=0`),
       so every balance table still stands. `tools/waste.py` prints the IP-thrown-away
       table; `levels.py` now takes key=value settings like `matchups.py`.

### V2c built: attacks cost Industry (Version 11.4, RULES.md Version 1.9)
148. **What you asked for:** build the approved V2c design (decision 147): 1 IP per attack,
     stockpile 6, at most 3 attacks a month, heavier barrages from 1918, commanders
     translated (Haig +1 attack a month, Joffre's March–October +1 and Pétain's limit as
     attack-limit changes, Foch's coalition attacks at 1 IP), "France arms the Americans"
     in Later ideas only (it was already there; I added how much IP it would use).
149. **The simulator is switched on.** `tools/wfsim.py`'s defaults are now `attack_ip=1,
     attack_limit=3, stock_cap=6, mun_target=6, heavy_barrage_e=191801` (the Entente's
     maximum barrage +1 from January 1918; Germany's unchanged). `matchups.py 200` gives
     exactly the numbers from the design chat: Standard vs Standard **44 / 39 / 18**,
     Expert vs Expert **38 / 48 / 14**, passive play 0%. `waste.py 200`, which plays
     another 200 seeds, gives **42 / 44 / 14**. I couldn't find the chat's exact
     "42 / 45 / 13" for the Hundred Days version. I took "Hundred Days" to mean the
     Entente-only barrage from January 1918 (decision 147), not both sides. If you meant
     a different setting (from August 1918, say), tell me and I'll re-run it. Full
     tables in BALANCE.md "V2c".
150. **How it works in the game.**
     - Offensive Points are gone from the data (no `op` schedules in nations.json). Every
       nation has 3 attacks a month (`attackLimit` in data/combat-table.json; Belgium 0).
       An attack's IP is `attackCost` there: 1, 2 for a coalition, 1 for an empty
       territory. The heavier barrage is `barrageBonus` (Entente, +1 from 1918-01).
     - The nation that pays is the one with the most steps in the attack, as before. It
       pays the IP and uses up one of its attacks; the other nation pays nothing.
     - The barrage comes on top of the attack's IP. So in December 1914, with France
       holding 2 IP, a French attack can have a barrage of 1 at most. **The guided first
       turn** now asks for a barrage of 1 (it was 2), so the attack is at 2:1 (42%) instead
       of 3:1 (58%). On seed 1 it still succeeds.
     - Commander effects in data/commanders.json: `attacks` (Joffre, Haig),
       `attacks-max` (Pétain) and `coalition-ip-cost` (Foch) replace `op`, `op-max` and
       `coalition-op-cost`.
     - The computer only attacks with an attack left and at least 1 IP in stock; its
       barrages are what's left after that IP, as in the simulator.
     - Saves are version 9. A game saved partway through a month gets this month's
       attack limit (with its commander), less the attacks each nation has already made.
151. **What the player sees.**
     - **Order slip:** "Cost: 1 IP for the attack + 2 for the barrage, from France's
       stockpile (5 in stock). France has 3 attacks left this month." The barrage + button
       stops at what the stockpile can pay after the attack's own IP.
     - **War Office budget:** the stockpile line shows 6 shells and what they buy
       ("Stockpile 4 of 6: 3 attacks with no barrage, or 1 attack with a barrage of 3",
       never more than the month's attack limit or the biggest barrage allowed); the note
       at the top says every attack takes 1 IP.
     - **War Office ledger (Nations screen):** "Munitions stockpile: 4 IP of 6: 1 IP per
       attack, +1 per munition of barrage" and "Attacks this month: 2 left of 4". The
       "of" now includes the commander (Haig's 4, Pétain's 1).
     - **Guide line and strip:** "Attacks left: France 3 · Britain 3. Munitions
       stockpile: France 5 · Britain 2 IP". The strip shows IP instead of OP.
     - **How to Play** and the commander cards say IP and attacks. A new test fails if
       "Offensive Point" or "OP" appears in any data file or screen file.
152. **The game's engine leans towards the Entente.** `node tools/js-par.mjs 200`:
     **Germany 36%, Entente 52%, draw 13%** (Version 11.3: 48 / 40 / 13). That's inside
     every healthy range, but Germany is near the bottom of its range and the
     simulator says 44 / 39 / 18. The gap is in 1916, when the game's computer Entente
     attacks about 14 times and the simulator's about 8. That's the same gap as decision
     137's table (12.7 against 9.0), a little bigger now. I haven't changed anything for
     it. See question 8.
153. **Tests added or changed:** attack costs (1 IP, 2 for a coalition, the barrage on top,
     refused with too few IP or no attacks left); a coalition attack uses one attack of
     the payer only; the Entente's barrage of 4 from 1918 (Germany stays at 3); the
     stockpile holds 6; the computer never overspends and makes at most 3 attacks a
     month (at most 1 for France under Pétain in a whole computer war); Joffre, Haig,
     Pétain and Foch as attack-limit and IP effects; the version 8 → 9 save upgrade; the
     data matches RULES.md; no OP on any screen. 211 tests pass. Version 11.4.

## Questions for you (milestone 12)
5. **Approve the AI fix in decision 128? — answered: yes.** Applied. With 200 wars the
   game's engine went from Germany 57 / Entente 33 / draw 11 to **45 / 37 / 18**, inside
   the healthy ranges (BALANCE.md). The 50-war figures in decision 128 were mostly noise.
   You also asked for more historical advantages for Germany. With these numbers Germany
   already leads, so you chose to **leave the balance as it is** (no German bonus).
6. **Are the interpretations in decision 121 right?** Especially: sacking needs an
   available successor (so Joffre can't be sacked before December 1916), and a sacked
   commander's OP, Manpower and rail count from next month.

## Questions for you (V2a)
7. **The computer Entente gets worse when it buys infantry (decision 136). What should I
   do? — answered: find the cause and fix it.** Found and fixed (decision 137). The
   tanks-only switch for the computer was never committed, so nothing had to be undone.
   - **(a) Recommended: the computer Entente buys tanks only, for now.** Players and the
     German computer buy as the rule says. Tested: 44 / 37 / 19, back inside every
     range. A player playing the Entente can still buy infantry. Then, as a separate
     job, I'd find why the computer handles extra pieces badly (the gap from decision 101)
     and give it infantry back once that's fixed.
   - **(b) Find the cause first,** and merge this only once the engine agrees with the
     simulator.
   - **(c) Merge as it is.** Playing the Entente against the computer is unchanged, but
     playing Germany against the computer gets easier (the computer Entente buys
     infantry and does worse).

## Questions for you (V2c)
8. **The game's engine gives the Entente 52% and Germany 36% (decision 152). What should I
   do?**
   - **(a) Recommended: leave it and play it.** It's inside every healthy range, and
     playing it on the phone will tell us more than the computer playing itself. If
     Germany feels too weak, the next step is (b).
   - **(b) Find the 1916 gap first:** trace a 1916 Entente turn in the game against the
     simulator (as in decision 137), then fix the computer so they match.
   - **(c) Give Germany something back now,** e.g. its maximum barrage +1 from March 1918
     (the Kaiserschlacht's Bruchmüller barrages; `heavy_barrage_g=191803` in the
     simulator). That would need a simulator re-run first.

## Questions for you (answered)
1. **Combat table — answered: RULES.md is right.**
   - The balance tests used `tools/t2.py`, which patched the simulator's 1:2 and 1:1
     columns to match RULES.md. Those columns now sit directly in `wfsim.py`, and `t2.py`
     is deleted.
2. **German starting Will — answered: 105 is right.**
   - `levels.py` used to pass it, and the other RULES.md settings, into the simulator.
     They're now `wfsim.py`'s defaults, and `levels.py` only adds the difficulty levels.
   - A fixed-seed check gave identical results before and after, so the balance numbers
     still stand. The balance tests were not re-run, as you said.
3. **Headlines and nicknames — answered: the headlines are fine; commanders get only
   real nicknames.**
   - Joffre ("Papa Joffre") and Pershing ("Black Jack") keep theirs; the others have
     none.
   - Nivelle's "I have the formula" moved into his history note, as a boast.
   - Foch and Hindenburg & Ludendorff keep their real titles ("Allied Generalissimo",
     "The Third Supreme Command") as a separate `title`.
   - RULES.md §15 was updated to match.
4. **The JS game and the simulator disagree — answered: RULES.md is right; find out
   why.** After the UI overhaul I'll trace one war turn by turn against the simulator,
   find why the JS Entente attacks half as often, and report back with a suggested fix
   before changing anything.

## Check on my phone
- [ ] **Attacks cost Industry (Version 11.4).** Hard-refresh; the title screen should say
      Version 11.4. Start a New Campaign as the Entente (skip the guide). Tap a French
      front territory, then the German territory opposite. The order slip's Cost line
      should say "1 IP for the attack … from France's stockpile (2 in stock). France has 3
      attacks left this month", and the barrage + should stop at 1. No "OP" anywhere.
- [ ] **The guided first turn.** Start the guided first turn: step 4 should ask for a
      barrage of 1, and the attack should take its territory.
- [ ] **War Office.** Open the ☰ menu, turn Auto-allocate off, and play to January 1915.
      The budget page should show 6 shell outlines and say what the stockpile buys. On
      the Nations screen the ledger should show "Munitions stockpile … of 6" and
      "Attacks this month". In 1916 Britain should show "of 4" (Haig).
- [ ] **How to Play.** "Who can attack whom" should say an attack costs 1 IP, and 3
      attacks a month.
- [ ] **The new board (Version 11.3).** Start a New Campaign on the folded phone. The board
      should show shaped territories with wavy ink borders, blue for the Entente and grey
      for Germany, the North Sea at the top and FLANDERS, ARTOIS … down the left edge.
      Tap a few small front territories (Laventie, Noyon, St-Mihiel): each should select
      at the first tap. Unfold the phone: the board should re-fit. Tap **Map** and back.
- [ ] **Place names.** Tap any territory and open Details: "Sector" and "Line" should show
      no "lane" or "E1". After a German attack, the battle report should name a town
      ("German attack on Laventie").
- [x] **Counters.** Start a New Campaign and zoom in with **+** three times. Each front
      territory should show a small counter with a cockade, roundel or cross in the top
      left, an X-in-a-box symbol and 4 dots. Zoomed out, you should see small numbered
      squares instead.
- [x] **Selecting a unit.** Tap Verdun. The sheet lists "French infantry, 4 of 4 steps ·
      Regular". Tap that row: it gets a brass border, and the map outlines 3 territories
      in solid brass and many more in dashed brass. Tap the row again to clear it.
- [x] **Top bar.** It shows the date with the phase underneath ("German move") and a brass
      **END PHASE** button on the right. It should fit on the folded phone without
      squashing the date.
- [x] **Moving.** In "German move", tap a German territory, tap its unit, close the sheet
      (swipe it down) and tap a brass-outlined territory next door. The counter moves, and
      "Dispatches" in the panel says so. Try a dashed one too (a rail move).
- [x] **Order slip.** Tap END PHASE once ("German attack"), then tap Verdun.
      - A cream "ORDER OF ATTACK" slip should appear in typewriter text, listing every
        column shift (trench, ridge, fortress, winter, heavy howitzers, the 75s) and a
        red stamped "COLUMN 1:2".
      - A red grease-pencil arrow should point into Verdun.
      - Tap CONFIRM ORDER: the slip shows the dice and "REPULSED" (or "OBJECTIVE TAKEN").
      - Is it readable on the folded phone?
- [x] **"The war" section.** With nothing selected, the panel shows each nation's Will
      (Germany 105, France 75, Britain 85) and "Armistice Score +25.0 (Germany ahead)".
      Is it clear what the score means?
- [x] **Saving.** Start a campaign, tap END PHASE a few times, then close Safari (or
      the home-screen app) completely and reopen it. **Continue** should be lit and bring
      you back to the same month and phase.
- [x] **Export and import.** On the title screen tap **Export save**: the share sheet
      should open; save the file to Files. Then tap **Import save** and pick that file:
      the game should open at the same point. Picking a photo or any other file should
      show a polite message instead.
- [x] **Event questions.** Tap END PHASE until February 1917 (about 100 taps; or wait
      until the computer opponent plays one side). A cream "DECISION REQUIRED" card about
      the U-boats appears and END PHASE greys out until you tap an answer. Is it clear?
- [x] **Playing the computer.** New Campaign → Entente → Regular → Begin. You should
      start at "Entente move" in December 1914, with Dispatches already listing
      Germany's moves and attacks. Make a move or an attack, then tap END PHASE twice:
      the computer plays Germany's January turn and you're back at "Entente move",
      January 1915.
- [x] **Recruit advisor.** On Recruit, open an attack at poor odds: the slip should show
      "ADVISOR: This attack will probably fail and cost 3 Will".
- [x] **Counter details.** At full zoom: is the German cross pattée (top-left mark) clear
      enough? It's small and dark on field grey. Counters also sit over their own town's
      name. Tell me if you'd rather they sat beside it.
- [x] **End Phase.** Tap **END PHASE** four times: the label should go German attack →
      Entente move → Entente attack → back to German move, and the date to January 1915.
- [ ] **Board-game pieces.** Start a New Campaign and zoom in with **+**. Each unit should
      be a chunky square piece with a soldier silhouette (a tank shape for tanks), a big
      strength number and the nation's mark. German pieces face left with a clear black
      cross.
      - Zoomed out, pieces show just the mark and the number.
      - Pieces should sit beside the town names, not on them. Pinch in and out: do they
        stay clear?
      - Where two or three units share a territory you should see a small tower with a
        brass "×2" or "×3" tab.
- [ ] **The bigger map.** Start a campaign as the Entente. The map should open zoomed in
      on the front, not showing the whole map.
      - Pan around: past the playing area you'll find England, the Netherlands and the
        Rhine, and the coloured territories fade out softly at their edge.
      - Flick the map: it should glide a little and stop.
      - The small locator map (top left) shows where you are. Tap it to jump somewhere
        else.
      - **Front** shows the whole front line.
      - Is it still smooth to pan and pinch on the phone? The map file is a little bigger
        (1.0 MB, was 0.95 MB).
- [ ] **Orders, then commit.** Start a campaign as the Entente.
      - Germany's opening moves should play back first: dashed arrows, then pieces
        sliding. Try **SKIP**.
      - Tap one of your units, tap a brass-outlined territory: a dashed arrow appears and
        the unit stays put. The top button shows **COMMIT 1**. Tap the arrow: the panel
        shows the order with **CANCEL**.
      - Tap **COMMIT**: the piece slides along the arrow, and you're in "Entente attack".
      - Tap a German territory next to your units, then **ADD TO ORDERS**: a red arrow
        with the odds appears. Add a second attack, then **COMMIT**: the dice tumble on a
        small slip, losses float up in red, and then Germany's turn plays back the same
        way.
      - Tap the map during an animation to hurry it along.
      - Turn on **Fast mode** (bottom of the panel) and commit again: only captures
        should animate.
      - With Reduce Motion on (Settings → Accessibility → Motion), nothing should
        animate.
- [ ] **The War Office.** Tap **War Office** (bottom left of the map).
      - Folded, you should see Germany and France; swipe the table sideways for Britain
        (and later the USA), and the row names should stay put.
      - Do the Will gauges, the casualties and the commanders read clearly?
      - Scroll down for the Armistice Score, the strength chart (tap it to read a month),
        the cities held, this month's events and the countdowns.
      - Tap **‹ The map** to go back.
- [ ] **The War Office budget (Version 10.2).** Start a New Campaign → Entente → Regular →
      Begin.
      - Before anything moves, a ledger page "Estimates for December 1914" appears. France
        has Industry 2, Britain 1. The brass slider is all the way to Munitions, with 2 and
        1 shells filled. Nothing can be researched yet.
      - Tap **SIGN THE ESTIMATES**: Germany's opening moves play, then it's your move.
      - Play on to January 1916. France can now choose **Creeping barrage** or **Heavy
        artillery programme**. Drag the slider left: the shells empty and Research goes
        up. Tap a tech, sign, and check the bar grew in **War Office** → Research.
      - In **War Office**, check the new rows: Manpower and Industry (with ▲/▼ from last
        month), the stockpile as shells, Research, and "Industrial cities" further down.
      - Tick **Auto-allocate** on the budget page: the page stops appearing.
      - On a narrow folded phone: is the slider easy to drag, and are the shells clear?
      - Start a Recruit game: the budget page should not appear (Auto-allocate is on).
- [ ] **Guided first turn (Version 10.3).** New Campaign → **Guided first turn (Entente)**.
      Follow the telegram strip: a road move, a second road move into the same
      territory, a rail move to fill the gap, COMMIT, then the attack with a barrage of
      2, and COMMIT. Is each step clear? Does the battle report make sense?
- [ ] **The order slip.** In any attack phase, tap a red-outlined German territory. Under
      the odds you should see "You take it on a roll of N or more", a strip of 11 dice
      squares, a line saying why, and what would help. Try a dug-in territory in 1916: it
      should say why it's 0%.
- [ ] **Best attacks.** In your attack phase, tap **BEST ATTACKS**: three pencil arrows
      with their odds, and a list in the panel. Tap one to open its slip.
- [ ] **Moving.** Tap a unit in your move phase: brass outlines = road, blue dashes =
      rail. The panel says the rule in one line. A unit that went by rail shows a RAIL
      tab on its piece.
- [ ] **After a turn.** Watch the attacks play: defenders slide back, attackers slide in.
      Then the panel opens on the battle reports. Is anything confusing?
- [ ] **How to Play.** On the title screen and under the date. Is anything missing?
- [ ] **Road moves of 2 (Version 10.4).** In your move phase, tap a unit: the brass
      outlines now reach 2 territories away through your own lines.
- [ ] **Split and merge.** Tap a 4-step unit in your move phase. Under it: "Split off:
      1 step / 2 steps / 3 steps". Tap "1 step": a second, 1-step piece appears in the
      same territory (×2 on the stack). Move the big one away and leave the picket. Then
      put two damaged pieces together and tap "Merge with the …-step piece".
- [ ] **Telegrams (Version 10.7).** Start a campaign as **Germany** and play to February
      1917 (or as the Entente to April 1917).
      - In April 1915 a telegram slides up from the bottom: "TELEGRAM — URGENT", "GAS AT
        YPRES" and "WHAT THIS MEANS". Tap it to close it.
      - As Germany in February 1917: the U-boat telegram has two brass buttons, each with
        its consequences. COMMIT stays grey until you tap one.
      - As the Entente: after Germany's turn plays back in February 1917 you get "Germany
        has declared unrestricted submarine warfare", then in March the Hindenburg Line,
        then in April Vimy and "America enters the war" ("1 of 2", "2 of 2").
      - ☰ → **Telegrams**: every telegram so far, newest first, with your answers.
      - Is the text easy to read on the folded phone? Does anything cover the map for too
        long?
- [ ] **The Nations screen (Version 10.7).** Tap the brass **Nations** button at the bottom
      left of the map (it shows the score, e.g. "+4.0").
      - At the top: the Armistice Score and one line on who's ahead and why; then the
        countdowns ("US troops expected: 7 months"; from 1918 the Kaiserschlacht deadline).
      - Tap **France**, **Britain** … or swipe sideways: one page per nation, with its Will
        chart (tap it to read a month) and "In effect" (NOW / COMING / OVER).
      - Fold and unfold the phone with it open: the page should re-fit.
- [ ] **Commander cards (Version 11.0).** Check the title screen says "Version 11.0".
      - **Nations screen:** start a New Campaign as the Entente and tap the brass
        **Nations** button. On France's page, under the figures, there's Joffre's card:
        an oval portrait with a silhouette and a "J" band, "Papa Joffre", "December 1914 –
        November 1916", a STRENGTH box (Offensive drive) and a dashed FLAW box (Attaque à
        outrance). Under it: "Sacking: … first 3 months". Swipe to Britain: Sir John
        French. Your two British pieces should show the Elite star (Old Contemptibles).
      - **The first question:** play on to December 1915. Before your turn a full-screen
        page asks "Replace Sir John French with Haig?" with Haig's card and a brass
        APPOINT HAIG button, then Sir John French's card small and KEEP SIR JOHN FRENCH
        ("−3 Britain Will now; you'll be asked again in 3 months"). COMMIT is grey until you
        answer. Try KEEP once in a test game: British Will drops by 3 and the question comes
        back in March 1916.
      - **December 1916:** "Replace Joffre with Nivelle or Pétain?", with both cards.
      - **The Nivelle Method:** with Nivelle in command, tap a German territory next to
        French units. Under the barrage buttons there's a button "THE NIVELLE METHOD: +2
        COLUMNS" with a warning about the mutinies. Tap it: the chance to take it jumps.
        After one use it's gone.
      - **Sacking:** as Germany, in April 1915 or later, open Nations → Germany. Under
        Falkenhayn's card: "Sack Falkenhayn: appoint Hindenburg & Ludendorff". Tap once
        (it asks you to confirm), then again: German Will −5 and the new card shows.
      - **The enemy's commanders:** as Germany, in December 1916 a full-screen card says
        "Nivelle replaces Joffre", with TO THE MAP. In April 1918, as either side, "Foch
        takes command".
      - **Folded phone:** are the cards easy to read? Are the buttons easy to tap?
- [ ] **After answering the U-boat question (Version 11.0):** as Germany in February 1917,
      answer the U-boat telegram. The War Office budget should still happen that month
      (Nations → Germany: the stockpile was topped up in February).
- [ ] **Buying units (Version 11.1).** Check the title screen says "Version 11.1".
      - Start a New Campaign as the Entente, open ☰ and turn **Auto-allocate** off.
      - In January 1915 the "Estimates" page appears. Under France: a **NEW UNITS** heading,
        an "Infantry · 2 steps" tab (6 IP + 2 MP · 2 left) and a row of city tabs. Tap
        **Paris**. The line under it says how much is paid (for example "Infantry: 2 of 6
        IP paid. 4 more to go.").
      - Sign each month. In the month it's paid for, the line says "paid for. It takes 2 MP
        from Replacements now and arrives at Paris in …". The next month a 2-step French
        piece stands in Paris, and Dispatches says "NEW UNIT: … arrives at Paris."
      - **Nations** → France: a "New units" row shows "Bought: Infantry 1 of 2, Tanks 0 of 3".
      - In 1916 (research open) a second slider appears: Research ↔ New units. Drag it right:
        New units goes up, Research goes down.
      - On the folded phone: are the city tabs easy to tap, and is the page still easy to read?
