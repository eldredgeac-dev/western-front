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
    - Commander effects (Milestone 11).
    - The attack screen and its animations (Milestones 5–6).

### Side jobs: commanders and headlines (data only, no code yet)
23. **`data/commanders.json`** holds all nine §15 cards.
    - Each Strength and Flaw has machine-readable `effects` for Milestone 11, and each card
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
    again. Nivelle's and Pétain's changes come with the commander cards (Milestone 11).
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
    quotes (Milestone 12). The French mutinies are handled with Will (Milestone 7); the
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
    the JS game yet (Milestone 10).

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

## Questions for you (open)
4. **The JS game and the simulator disagree** (decisions 58–60): Germany 52% / Entente
   12% in the game, against 48% / 35% in BALANCE.md. Which should be the reference?
   - **My suggestion:** treat RULES.md as right and find out why the JS Entente attacks
     half as often. Then either change the JS AI to match the simulator (if it's an AI
     difference) or update the simulator to match the game and re-run the balance tests
     (if it's a rules difference). I haven't done either, because you said not to change
     balance numbers to fix this.
   - You can repeat the check yourself on a computer with `node tools/js-sim.mjs 50`.

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

## Check on my phone
- [ ] **Counters.** Start a New Campaign and zoom in with **+** three times. Each front
      territory should show a small counter with a cockade, roundel or cross in the top
      left, an X-in-a-box symbol and 4 dots. Zoomed out, you should see small numbered
      squares instead.
- [ ] **Selecting a unit.** Tap Verdun. The sheet lists "French infantry, 4 of 4 steps ·
      Regular". Tap that row: it gets a brass border, and the map outlines 3 territories
      in solid brass and many more in dashed brass. Tap the row again to clear it.
- [ ] **Top bar.** It shows the date with the phase underneath ("German move") and a brass
      **END PHASE** button on the right. It should fit on the folded phone without
      squashing the date.
- [ ] **Moving.** In "German move", tap a German territory, tap its unit, close the sheet
      (swipe it down) and tap a brass-outlined territory next door. The counter moves, and
      "Dispatches" in the panel says so. Try a dashed one too (a rail move).
- [ ] **Order slip.** Tap END PHASE once ("German attack"), then tap Verdun.
      - A cream "ORDER OF ATTACK" slip should appear in typewriter text, listing every
        column shift (trench, ridge, fortress, winter, heavy howitzers, the 75s) and a
        red stamped "COLUMN 1:2".
      - A red grease-pencil arrow should point into Verdun.
      - Tap CONFIRM ORDER: the slip shows the dice and "REPULSED" (or "OBJECTIVE TAKEN").
      - Is it readable on the folded phone?
- [ ] **"The war" section.** With nothing selected, the panel shows each nation's Will
      (Germany 105, France 75, Britain 85) and "Armistice Score +25.0 (Germany ahead)".
      Is it clear what the score means?
- [ ] **Saving.** Start a campaign, tap END PHASE a few times, then close Safari (or
      the home-screen app) completely and reopen it. **Continue** should be lit and bring
      you back to the same month and phase.
- [ ] **Export and import.** On the title screen tap **Export save**: the share sheet
      should open; save the file to Files. Then tap **Import save** and pick that file:
      the game should open at the same point. Picking a photo or any other file should
      show a polite message instead.
- [ ] **Event questions.** Tap END PHASE until February 1917 (about 100 taps; or wait
      until the computer opponent plays one side). A cream "DECISION REQUIRED" card about
      the U-boats appears and END PHASE greys out until you tap an answer. Is it clear?
- [ ] **Playing the computer.** New Campaign → Entente → Regular → Begin. You should
      start at "Entente move" in December 1914, with Dispatches already listing
      Germany's moves and attacks. Make a move or an attack, then tap END PHASE twice:
      the computer plays Germany's January turn and you're back at "Entente move",
      January 1915.
- [ ] **Recruit advisor.** On Recruit, open an attack at poor odds: the slip should show
      "ADVISOR: This attack will probably fail and cost 3 Will".
- [ ] **Counter details.** At full zoom: is the German cross pattée (top-left mark) clear
      enough? It's small and dark on field grey. Counters also sit over their own town's
      name. Tell me if you'd rather they sat beside it.
- [ ] **End Phase.** Tap **END PHASE** four times: the label should go German attack →
      Entente move → Entente attack → back to German move, and the date to January 1915.
