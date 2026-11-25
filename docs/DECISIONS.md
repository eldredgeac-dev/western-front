# Decisions and questions (overnight work)

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

## Questions for you
(none yet)

## Check on my phone
- [ ] **Counters.** Start a New Campaign and zoom in with **+** three times. Each front
      territory should show a small counter with a cockade, roundel or cross in the top
      left, an X-in-a-box symbol and 4 dots. Zoomed out, you should see small numbered
      squares instead.
- [ ] **Selecting a unit.** Tap Verdun. The sheet lists "French infantry, 4 of 4 steps ·
      Regular". Tap that row: it gets a brass border, and the map outlines 3 territories
      in solid brass and many more in dashed brass. Tap the row again to clear it.
