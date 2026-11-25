# STYLE.md — Art direction for Western Front 1914–18

Read this before building or changing anything the player sees. Every screen, icon,
sound and animation should look and feel like it belongs to the same game.

## 1. The look in one sentence
**A 1916 General Staff map spread on an officer's desk.** The map is the hero: aged
paper, hand-lettered place names, contour shading and a front line drawn in red ink.
Everything around it looks like the desk: dark leather, brass, typed dispatches,
telegrams and stamped orders.

Reference points to look at (search these for inspiration; don't copy any image):
- British 1917 trench maps (the McMaster University and Imperial War Museum
  collections): ink lines, hatching, tiny serif labels
- Michelin's 1919 *Illustrated Michelin Guides to the Battlefields*: muted colour
  maps and period layout
- The *Paths of Glory* board game map: a clear, readable WWI area map
- The *Empire: Total War* campaign map: territories, borders, city markers, the
  sense of a living map
- Newspapers from 1914–18 (*Le Petit Journal*, the *Daily Mirror*, the *New York
  Tribune*): mastheads, column rules, dense headlines

## 2. Colour palette
Use only these colours. Define them once as CSS variables in `css/style.css`.

**The map (paper)**
| Name | Hex | Use |
|---|---|---|
| paper | `#E8DCC0` | map background |
| paper-dark | `#D6C7A3` | folds, vignette, shading |
| ink | `#2B241C` | text, borders, symbols on the map |
| ink-faded | `#6E6253` | minor labels, grid, contours |
| river | `#5F7F95` | rivers, coast, flooded areas |
| forest | `#5E6B45` | forest stipple |
| ridge | `#8A7454` | hillshade and ridge hatching |
| front-red | `#8E1B1B` | the front line, attack arrows, losses |

**Nations** (owner tint on territories at about 30% opacity; solid on counters)
| Nation | Name | Hex |
|---|---|---|
| France | horizon blue | `#6F8FAF` |
| Britain | khaki | `#9C8A5A` |
| Germany | field grey | `#6B6E63` |
| USA | olive drab | `#5E5B33` |
| Belgium | Belgian ochre | `#B58B3A` |

**The desk (interface around the map)**
| Name | Hex | Use |
|---|---|---|
| leather | `#221D18` | app background, panels |
| leather-light | `#2E2721` | raised panels, cards |
| brass | `#B08D57` | buttons, highlights, selected outlines |
| telegram | `#F1E6C8` | event pop-ups, dispatches |
| stamp-red | `#A3241F` | "CENSORED", "URGENT", "MUTINY" stamps |

- **Contrast:** text must meet WCAG AA contrast on its background. Check ink on paper
  and paper on leather.
- **Don't use:** pure black `#000`, pure white `#fff`, bright saturated colours, neon,
  glossy gradients or glow effects.

## 3. Typography
Use free fonts under the SIL Open Font License. Download them into `fonts/` and load
them with `@font-face`. Don't load from a CDN, so the game works offline later.

| Use | Font | Notes |
|---|---|---|
| Title, newspaper headlines, big numbers | **Playfair Display** (bold / black) | Newspaper and poster feel |
| Map place names, commander cards, the rules book | **IM Fell English** (and IM Fell English SC for small caps) | A real 17th–19th century typeface, so it looks hand-set |
| Interface text, buttons, panels | **Source Serif 4** | Readable at small sizes on a phone |
| Dispatches, telegrams, combat reports, the Butcher's Bill | **Courier Prime** | Typewriter |

**Rules:**
- Interface text is at least 15px on the phone.
- Map labels scale with zoom, but never shrink below 11px.
- Place names on the map are in small caps, letter-spaced, in ink or ink-faded.
- No more than two fonts on any one screen, plus Courier for numbers and reports.

## 4. The map
The map is the most important thing in the game. Spend effort here.

1. **The base:** paper texture, a subtle fold crease or two, and a soft dark vignette
   at the edges.
2. **Geography:**
   - Coastline and rivers in thin river-blue lines.
   - The sea gets the old-map horizontal hatch.
   - The Swiss border is drawn as a dash-dot line.
3. **Relief:**
   - Light hillshading in ridge colour on high ground (Vimy, the Chemin des Dames,
     Verdun, the Vosges).
   - Ridges get short hachure strokes.
4. **Terrain textures,** drawn as SVG patterns, never flat fills:
   - **Forest:** stippled tree dots.
   - **Flooded:** blue diagonal hatch.
   - **Mud (Sep–Nov in Flanders):** a darker, blotchy wash that fades in during
     autumn.
   - **Chalk:** a pale, slightly lighter paper tone.
   - **Open ground:** plain paper.
5. **Territories:**
   - Borders are thin dashed ink lines.
   - Fill each territory with the owner's tint at 30% over the terrain.
   - When a territory is tapped, give it a brass outline with a slow pulse.
6. **No-man's land:**
   - Draw the strip between the two front-line rows with a crater stipple.
   - It gets denser the longer the front has been static there.
7. **The front line:**
   - A bold front-red line with small barbed-wire ticks.
   - It redraws smoothly (about 0.6 seconds) when territory changes hands.
8. **Trenches:**
   - Show the trench level with zigzag trench symbols along the inside of the
     territory edge: 1, 2 or 3 parallel zigzags.
9. **Cities:**
   - Named victory-point cities get a small ink church or fort symbol, their name in
     IM Fell small caps, and a VP number in a small circle.
   - Paris gets a larger star.
   - Fortresses get the star-fort outline.
10. **Map furniture:**
    - A cartouche (decorative frame) in one corner holds the title "THEATRE OF
      OPERATIONS — WESTERN FRONT" and the date.
    - Add a simple compass rose and a scale bar in km and miles.
11. **Zoom:**
    - Pinch to zoom from about 1× to 3×, and pan by dragging.
    - Labels and counters stay crisp; that's why it's SVG.

## 5. Unit counters
Style counters like real wargame pieces, not cartoon soldiers.

- **Shape:** a rounded square, about 36px at 1× zoom. Tap targets are at least 44px,
  so pad the hit area.
- **Fill:** the nation colour. A thin darker border, and a slight drop shadow, as if
  the counter is resting on the map.
- **Symbol** (military map style, in ink or paper colour):
  - Infantry: a box with an X.
  - Tank: a lozenge, like the British Mark IV outline.
  - Stormtroopers: the infantry X plus a small lightning bolt.
  - US Infantry: the infantry X with a small star.
- **Strength:** pips along the bottom edge, filled for current steps and hollow for
  lost ones.
- **Quality badges:**
  - Elite: a small brass star, top right.
  - Green: a small pale-green dot, top right.
- **National mark,** small, top left:
  - France: tricolour cockade.
  - Britain: roundel.
  - Germany: black cross pattée (Iron Cross shape).
  - USA: white star in a blue circle.
  - Belgium: black, yellow and red cockade.
- **Stacks:** up to 3 counters, offset 4px up-right like a real stack. Tapping the
  stack fans them out.
- **Moved or attacked this turn:** the counter is slightly dimmed (about 70%).

## 6. Interface: the desk
- **Panels:**
  - Leather-light cards with a 1px brass hairline border and slightly rounded
    corners (4px).
  - No floating glossy cards.
- **Buttons:**
  - The main action is a brass fill with leather text (e.g. "END TURN", "ATTACK").
  - Secondary buttons are an outlined brass rule.
  - Pressing a button nudges it down 1px, like a stamped metal plate.
- **Attack dialog: a typed order slip.**
  - Telegram paper with Courier text, a list of every column shift as typed lines,
    and the final odds stamped in front-red.
  - "CONFIRM ORDER" stamps the slip when tapped.
- **Events:** arrive as **telegrams**: a strip of telegram paper with
  "TELEGRAM — URGENT" at the top and typed text, sliding up from the bottom.
- **Commander cards:**
  - Cream card stock, a portrait oval with a silhouette, the name in IM Fell, and
    the dates.
  - Strength and Flaw in two boxes, labelled with small brass ribbons.
- **Nations screen:**
  - Like a ledger: ruled lines, Courier numbers, and the Will bar drawn as an ink
    gauge that drains.
- **Phone layout:**
  - **Folded:** the map is full screen. Panels slide up from the bottom as a sheet,
    and the top bar shows the date, the side and End Turn.
  - **Unfolded:** the map takes about 65% of the screen with the side panel always
    visible.

## 7. The newspaper
- **Real front-page structure:**
  - A masthead in Playfair Display Black with a thin double rule beneath.
  - A date line and price line ("ONE PENNY" / "10 PFENNIG").
  - One giant headline across the page.
  - Two or three narrow columns, with the Butcher's Bill in a boxed Courier column.
- **Elsewhere in the World:** in a smaller column headed "CABLES FROM ABROAD".
- **Censorship:**
  - When the paper spins your defeats, a red "PASSED BY CENSOR" stamp appears in a
    corner.
  - Withheld numbers are shown as a black redaction bar, which the player can tap to
    reveal the true figure.
- **Real Voices quotes:** set in italic IM Fell, with a thin rule above.
- **Arrival:** the paper drops onto the desk with a slight rotation (about 2°) and
  settles. **No** spinning newspaper effect — it's the most cliché effect there is.

## 8. Motion and feedback
Movement gives information. It's never decoration.

| Moment | What happens | Length |
|---|---|---|
| Barrage | Small ink flashes and puffs over the target, a faint screen shake (2px) | 0.6s |
| Dice | Two bone-coloured dice tumble on the order slip and land | 0.8s |
| Losses | Strength pips go hollow one by one; front-red "−2" floats up and fades | 0.5s |
| Capture | The territory tint cross-fades to the new owner; the front line redraws | 0.6s |
| Will change | The ink gauge drains or fills | 0.4s |
| End turn | The date in the top bar flips like a desk calendar | 0.4s |

- **Every animation can be skipped by tapping,** and none is longer than 1 second.
- Turn all animation off if the phone's Reduce Motion setting is on.
- Add a "fast mode" toggle that removes all animation except captures.

## 9. Sound
- **Sources:** public domain or CC0 only, for example freesound.org filtered to CC0.
  Record each file's source in `sounds/CREDITS.md`.

| Moment | Sound |
|---|---|
| Barrage | Distant artillery rumble |
| Attack | Short whistle blast |
| Order slip and dispatches | Typewriter clacks |
| Newspaper and cards | Paper rustle |
| Telegrams | Telegraph clicks |
| End of war | Single church bell |

- **Background:** an optional, very low wind and far-off guns. No music in Version 1.
- **Settings:** sound is ON by default, with an easy toggle on the top bar. Respect the
  phone's silent switch, and keep the files small (under 100 KB each, compressed).

## 10. Writing and tone
- **Voice:** period-appropriate and understated, like a staff officer's dispatch or
  a 1916 newspaper. Short sentences.
- **No jokes about death,** no gore and no glorifying slaughter. The Butcher's Bill
  is serious, so present it plainly.
- **Rules terms in the interface:** use the game's terms consistently (Will, OP,
  Munitions, Replacements, territory), and explain each one once with a tap-to-learn
  tooltip.
- **Dates:** "March 1916" style everywhere, never "1916-03".

## 11. "Is it cheesy?" checklist
Check every screen against this list before calling a milestone done. Any **yes**
means fix it.
- [ ] Is anything bright, neon, glossy or using a default system font?
- [ ] Are there emoji, clip art or cartoon soldiers or explosions?
- [ ] Is any colour used that isn't in the palette (§2)?
- [ ] Does anything animate for longer than 1 second, or block play?
- [ ] Is any text hard to read on the phone, folded?
- [ ] Is it a spinning newspaper, a stock "victory" fanfare or a generic game-template
      look?
- [ ] Could the screen belong to a different game? It should only look like this one.

## 12. Screens to design (in this style)
1. **Title screen:**
   - A dark desk with the folded map in the middle and the title in Playfair.
   - Grey's quote ("The lamps are going out…") in italic underneath.
   - Buttons: New Campaign, Continue, How to Play.
2. **New campaign:** choose a side (two commander-style cards: Entente and Germany)
   and a difficulty (four brass tabs).
3. **Main map:** the hero screen (§4–6).
4. **Attack order slip** (§6).
5. **Telegram** event pop-up (§6).
6. **Newspaper** (§7).
7. **Commander card** (§6).
8. **Nations ledger** (§6).
9. **End-of-war report card:** a typed War Office report with the Butcher's Bill
   against history, stamped "ARMISTICE" or "PEACE NEGOTIATED" or "DEFEAT".
