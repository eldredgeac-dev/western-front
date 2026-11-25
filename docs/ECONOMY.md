# ECONOMY.md — War economy (rules addendum, Version 1.3)

**For Claude Code:** merge this into `docs/RULES.md` as a new §19. Update §6
(Resources) and §11 (German starting Will 105 → 108) to match. The simulator
implementation is in `tools/econ_reference/wfsim.py`. Bring its `economy` / `split`
code into `tools/wfsim.py`, using the config listed in §19.8 below. Every number here
is **[balanced]**.

## 19. The war economy
Each month every nation receives two separate resources. You decide how to spend them.

| Resource | Represents | Spent on | Can you save it? |
|---|---|---|---|
| **Manpower (MP)** | Fresh men from the depots | Replacements (1 MP = +1 step) and rebuilding destroyed units (2 MP) | No. Unspent MP is lost. |
| **Industry (IP)** | Factories, shells, guns | Munitions, research | Munitions bought go into a **stockpile** (max 3). Unspent IP is otherwise lost. |

Why two resources: France ran out of **men** long before it ran out of **factories**.
Britain had plenty of men by 1916 but couldn't turn spare men into shells. Merging the
two let Britain convert unused replacements into artillery, and testing showed that
broke the balance (see §19.8).

### 19.1 Manpower per month
Manpower is the old Replacements column from §6, unchanged:
- **GER:** 3 (1917: 2, from Aug 1918: 1). +1 under Hindenburg & Ludendorff.
- **FRA:** 3 (1916–17: 2, 1918: 1).
- **GBR:** 2 (from 1916: 3). −1 in Jan–Apr 1918 under Haig.
- **USA:** 2.

### 19.2 Industry per month
Industry = the old Munitions number from §6 + a **war-economy bonus**, then adjusted
for industrial cities (§19.3):

| Nation | Base (= old munitions) | War-economy bonus |
|---|---|---|
| GER | 3 | +1 |
| FRA | 2 / 3 / 4 / 5 (1915 / 16 / 17 / 18); +1 under Nivelle | +0 in 1915, +1 from 1916 |
| GBR | 1 (1916: 3, from 1917: 4) | +0 |
| USA | 1 | +0 |

Difficulty multipliers (§13) apply to both Manpower and Industry.

### 19.3 Industrial cities
Owning these named territories changes Industry each month:

| City | Effect if captured |
|---|---|
| **Paris** | FRA −3 IP |
| **Amiens** | FRA −1 IP |
| **Channel Ports** | GBR −2 IP |
| **Lille** (German-held French industry) | If the Entente retakes it: GER −1 IP, FRA +1 IP |
| **Metz** (Lorraine iron) | GER −2 IP |
| **Sedan–Mézières rail** | GER −1 IP |

The blockade does **not** cut German Industry. It already drains German Will (§10).
Testing showed that doing both collapsed Germany (it won only 8% of games).

### 19.4 Spending: the War Office screen
At the start of each month, before moving, the player sees a **War Office** budget
screen (styled per STYLE.md §6 as a ledger with brass sliders):
- **Manpower:** goes automatically to Replacements. The player assigns steps to units
  in the Replacements phase, as before.
- **Industry:** split with sliders between:
  - **Munitions:** 1 IP each, added to the stockpile, max 3 in stock. This is the
    "artillery left" number on the dashboard.
  - **Research:** IP put towards one tech at a time (§19.5). Progress carries over
    between months.
- **Auto-allocate** (default ON on Recruit): tops the stockpile up to 3 first and puts
  the rest into the cheapest available research.

Barrages spend munitions from the stockpile. The per-attack maximum is still 2, or 3
after the creeping barrage.

### 19.5 Research
Every tech arrives **for free on its historical date** if you haven't researched it.
Research lets you get it **earlier**, but not before its "earliest" date. Some techs
never happened historically and can only be researched.

| Tech | Nation | Historical date | Earliest | Cost (IP) | Effect |
|---|---|---|---|---|---|
| **Creeping barrage** | Entente (FRA or GBR pays; both get it) | Jun 1916 | Jan 1916 | 8 | Max barrage 3 for the Entente |
| **Landships** | GBR | Sep 1916 | Mar 1916 | 10 | The first GBR Tank unit arrives when researched |
| **Renault FT** | FRA | Jun 1918 | Jan 1918 | 8 | That FRA Tank unit arrives when researched |
| **Heavy artillery programme** | FRA | never | Jan 1916 | 10 | FRA +1 IP every month from then on |
| **Defence in depth** | GER | Jan 1917 | Jul 1916 | 8 | The §4 trait starts when researched |
| **Stormtroop tactics** | GER | Jan 1918 | Jul 1917 | 10 | Convert up to 4 infantry units to Stormtroopers when researched |
| **A7V tanks** | GER | never | Jan 1918 | 12 | GER gains 1 Tank unit. Its only tank, and an alternate-history option. |

- Research a tech by putting IP into it. It completes at the start of the month its
  total reaches the cost.
- A historical event doesn't fire twice: if Landships came early, the September 1916
  tank doesn't arrive again.
- Show research as a **ledger page with progress bars** and a one-line history note
  for each tech.

### 19.6 Dashboard additions
The War Office dashboard (UI overhaul milestone) also shows, for each nation:
- Manpower and Industry this month, with arrows comparing them to last month.
- The munitions stockpile (0–3) as shell icons.
- Research in progress, as a progress bar and the month it's expected.
- Industrial cities held and lost, with their IP effect.

### 19.7 The computer opponent's spending
- **Manpower:** repair the most threatened units first (§14).
- **Industry:** buy munitions up to 3 in stock, then put up to 3 IP a month into the
  cheapest available research, then put any rest into munitions.
- The computer does research. On average it gets the creeping barrage, Defence in
  depth and Landships a few months early.

### 19.8 Balance results (tools/wfsim.py, 80–200 games per row)
**Testing each piece from a clean baseline** (Germany / Entente / Draw, careful vs
careful):

| Version | GER | ENT | Draw |
|---|---|---|---|
| Economy fully off (matches Version 1.2) | 46% | 38% | 16% |
| + Industrial cities | 44% | 40% | 16% |
| + Stockpile, max 3 | 39% | 42% | 19% |
| + Research | 42% | 41% | 17% |
| + Blockade also cuts German Industry | **8%** | **82%** | 9% → **rejected** |
| One shared budget instead of separate MP/IP | 22% | 66% | 12% → **rejected** |

**Final economy** (separate MP/IP, stockpile 3, research, industrial cities, bonuses
as in §19.2, German Will 108):

| Matchup | Germany | Entente | Draw |
|---|---|---|---|
| Standard vs Standard | 49% | 40% | 11% |
| Expert vs Expert | 43% | 44% | 13% |
| Turtle Germany vs Standard | 21% | 49% | 30% |
| Standard vs Turtle Entente | 100% | 0% | 0% |
| Beginner Germany vs Standard | 13% | 70% | 16% |
| Standard vs Beginner Entente | 44% | 52% | 5% |
| Reckless Germany vs Standard | 0% | 100% | 0% |
| Standard vs Reckless Entente | 54% | 45% | 2% |

**Difficulty** (player win %):

| Level | Careful as GER | Careful as ENT | Beginner as GER | Beginner as ENT |
|---|---|---|---|---|
| Recruit | 68% | 81% | 64% | 82% |
| Regular | 45% | 44% | 10% | 46% |
| Veteran | 36% | 30% | 0% | 39% |
| Field Marshal | 9% | 11% | 1% | 18% |

**Watch in playtesting:**
- A passive Germany now wins 21%, just over the 20% target, because its stockpile
  lets it wait well. If it feels too easy to sit tight as Germany, raise the
  Kaiserschlacht penalty (§10) from −15 to −20.
- Recruit is a little harder than before (64–82%). If it feels hard, raise the Recruit
  Will bonus from +15 to +20.

**Simulator config for the final version:**
```
economy=True, split=True, blockade_pp=0, industry=True, stock_cap=3,
pp_extra={'GER':(1,1), 'FRA':(0,1), 'GBR':(0,0), 'USA':(0,0)},  # (1915, 1916+)
will GER = 108
```
