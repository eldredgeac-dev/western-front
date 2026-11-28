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

**Nations** (owner tint on territories: 60% on the board, 30% on the campaign map; solid on counters)
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
| Pencil notes on the map (§13) | **Reenie Beanie** | A staff officer's handwriting. Only for annotations on the map |

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
   - Fill each territory with the owner's tint at 30% over the terrain (the board uses
     60%, §4.12).
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
    - Pinch to zoom from about 1× to 6×, and pan by dragging. (Front-line territories
      are only 5–15 km wide, so they need about 6× to be big enough to tap.)
    - Labels and counters stay crisp; that's why it's SVG.
12. **The board (the main playing view, milestone 10g):** an Axis & Allies-style map of
    the same 72 territories, drawn by `js/ui/board.js` from the map data. It's real
    geography **stretched so every territory is big enough to tap**, like an A&A board
    distorting Europe:
    - North at the top, the Entente on the left, Germany on the right. Each sector of
      the front is a band of six territories (rear, support and front line on each side).
    - The front keeps its real salients: Ypres bulges into the German line, the Noyon
      salient points at Paris, St-Mihiel pushes into the French side. The front wanders
      in a gentle S.
    - Borders are gently wavy, hand-drawn ink lines (1.5 px, ink), shared exactly by the
      two neighbours. The shapes are the same every time (no randomness).
    - Each territory: its owner's colour at **60%** over the terrain textures (chosen from
      50 / 60 / 75% previews: 75% hid the German pieces in their own grey), its name in
      IM Fell small caps centred at the top, a front-red VP roundel for cities, and the
      star-fort for fortresses. The piece stands in the middle.
    - Around it: the North Sea (river-blue with the sea hatch) along the coast and the
      Channel Ports, the Netherlands at the top right and Switzerland along the bottom
      (paper-dark, dash-dot border, "neutral"). The Yser, Somme, Aisne and Marne are thin
      river-blue lines with italic names.
    - **No grid labels.** No lane strips and no E3 … G3 letters. Instead, region names in
      large, faint, letter-spaced IM Fell small caps run down the margins like a period
      map: FLANDERS, ARTOIS, PICARDY, CHAMPAGNE, ARGONNE, LORRAINE on the west, ALSACE on
      the east. They stand outside the territories, so they never cover a piece or a name.
      Everything the player reads uses place names ("the Ypres sector", "from Arras to
      Soissons"), never "lane 2" or "E1"; those labels are only for RULES.md and the code.
    - On a folded phone (390 px) a territory is about 59 × 68 px; a test checks every one
      is at least 44 px each way and holds its whole piece.
    - The **Map** button (above the zoom buttons) switches to the campaign map, which
      stays as the zoomed-out overview; the locator always shows the campaign map.

## 5. Unit counters
Style counters like real board-wargame pieces (think a cardboard counter or a wooden
block), not cartoon soldiers.

- **Shape:** a chunky square piece, about 36px at 1× zoom, that looks about 2 mm thick:
  - a slightly lighter strip along the top edge (the bevel), and a darker face along the
    bottom and right edges (the side of the piece);
  - a soft ink shadow down and to the right, as if it's standing on the map;
  - flat palette colours only: lighter and darker shades are the nation colour mixed with
    paper or ink. No gradients, no gloss, no glow.
  - Tap targets are at least 44px, so pad the hit area.
- **Fill:** the nation colour.
- **Silhouette** (flat, in paper or ink to contrast with the fill), filling the middle:
  - Infantry: a soldier in profile with a rifle at the slope.
  - Tank: the British Mark IV rhomboid, side on.
  - Stormtroopers: a soldier in the 1916 steel helmet with a stick grenade.
  - US Infantry: a soldier in the campaign hat with a rifle.
  - The small military symbol (a box with an X; a lozenge for tanks) stays in the bottom
    left corner, as on real wargame counters.
- **Strength:** a big Courier number on a small paper chip, bottom right. Under it, a row
  of tiny pips: filled for current steps, hollow for lost ones.
- **Quality badges,** top right:
  - Elite: a small brass star.
  - Green: a pale chevron.
- **National mark,** top left, big enough to read at every zoom (with a thin paper
  outline where it's dark on a dark piece):
  - France: tricolour cockade.
  - Britain: roundel.
  - Germany: black cross pattée (Iron Cross shape) with a paper outline.
  - USA: white star in a blue circle.
  - Belgium: black, yellow and red cockade.
- **Zoomed out:** the same piece, smaller and simplified: colour, national mark and
  strength number only.
- **Stacks:** a territory's pieces show as **one piece**, like an Axis & Allies stack:
  the strongest unit's piece with the territory's **total steps**, a thin edge behind it
  for each extra piece, and the number of pieces on a brass tab ("×3"). Tapping the
  territory lists every piece in the panel.
- **Size:** on the campaign map, at least 44 px wide on screen at the normal and close
  zooms (a finger's width); smaller only on the zoomed-out overview. On the board a piece
  is a fixed 38 board units (about 38 px on a phone) in the middle of its square, and
  the whole square is the tap target.
- **Where they stand:** beside the town name, never on top of it or of the town dot,
  the city label or the VP ring. Each territory has a "unit spot" worked out by the map
  builder.
- **Moved or attacked this turn:** the piece is slightly dimmed (about 70%).

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
- **Orders, then commit** (like Axis & Allies):
  - Orders you give in your phase are queued, not carried out. Each is a grease-pencil
    arrow on the map: dashed for a move, front-red for an attack with the odds written
    on it ("2:1 · 58%"). Tap an arrow to see or cancel its order.
  - The brass **COMMIT ORDERS** button plays the queued orders out in order, with the
    §8 animations. The enemy's turn plays the same way: its arrows first, then the
    action, with a **SKIP** button.
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

## 13. Detail pass
The map should reward a closer look. It shows more as you zoom in, it records the war as
it's played, and it looks drawn by hand.

### Map: detail by zoom level
| Zoom | What you see |
|---|---|
| **Zoomed out** | Regions (territories), the front line, VP cities, rivers, country names |
| **Mid zoom** | Plus towns, **railways** (black-and-white tick lines; they matter for rail moves), main roads, river names |
| **Fully zoomed** | Plus villages, famous landmarks as small ink symbols with labels, contour lines, and the trench network drawn as real zigzag lines along the front |

- **Landmarks:** Fort Douaumont, Mort Homme, Hill 304, Vimy Ridge, Hill 60, Delville
  Wood, Messines Ridge, Chemin des Dames, Butte de Vauquois.
- **Railways** are the lines of 1914, not today's network.
- **Trenches** follow the 1917 British trench-map convention: German trenches in
  front-red, Allied trenches in river-blue.

### Map: a living map that records the war
- **Battle scars:**
  - Each time a territory is fought over, it gets more shell-crater stipple.
  - So the Somme and Verdun visibly churn up as the war goes on.
- **Pencil annotations:**
  - When a big battle happens (6 or more steps lost in a territory), a staff officer's
    pencil note appears in the margin by that spot, e.g. "Verdun — Feb 1916".
  - It's in a handwritten font (Reenie Beanie).
- **Seasons:**
  - A faint snow wash in December–February.
  - The mud wash in Flanders in September–November.
  - A faint green tint in spring.
- **Planned attacks** show as grease-pencil arrows before you confirm the order.

### Map: hand-made feel
- **Paper:** paper grain texture, slight ink bleed on lines, a coffee ring and some
  foxing (age spots) near one corner, and the map's fold creases.
- **Lines:** borders and the front line are slightly hand-wobbled, not perfect vectors.

### Interface (built in the "Feel and sound" milestone)
- The desk is lit by a warm lamp from the top left: a soft vignette.
- Commander cards are sealed with a wax seal in the nation's colour.
- Drop caps and old-style numbers in the newspaper.
- Brass map pins mark your selected territory.
