"""Monte Carlo simulator of docs/RULES.md (Western Front 1914-18, V1).
Abstracted but follows the rules: grid map, OP/munitions/RP, 2d6 odds table,
trenches, supply, rail, events, reinforcements, National Will, victory.
Both sides are played by an AI with a skill level (novice/standard/expert).
"""
import random, copy
from collections import deque

LANES, COLS = 12, 6           # cols: 0=E3 1=E2 2=E1 | 3=G1 4=G2 5=G3
COLNAMES = ['1:2', '1:1', '3:2', '2:1', '3:1', '4:1']
RATIOS = [0.5, 1, 1.5, 2, 3, 4]
BANDS = [(2, 4), (5, 6), (7, 7), (8, 9), (10, 11), (12, 12)]
# The combat table, exactly as docs/RULES.md §9.3 [balanced]: TABLE0[column] lists
# (attacker loss, defender loss, retreat) for each 2d6 band in BANDS.
# (The 1:2 and 1:1 columns used to be patched in by tools/t2.py; they now live here.)
TABLE0 = {  # (A, D, R) by column, by band
 0: [(4,0,0),(3,1,0),(3,1,0),(2,1,0),(2,1,0),(2,2,0)],
 1: [(3,1,0),(3,1,0),(2,1,0),(2,2,0),(2,2,0),(1,3,1)],
 2: [(3,1,0),(2,2,0),(2,2,0),(1,2,0),(1,3,1),(1,3,1)],
 3: [(2,1,0),(2,2,0),(1,2,0),(1,3,1),(1,3,1),(0,4,1)],
 4: [(2,2,0),(1,2,0),(1,3,1),(1,3,1),(0,4,1),(0,4,1)],
 5: [(1,2,0),(1,3,1),(1,3,1),(0,4,1),(0,4,1),(0,5,1)],
}
TABLE = TABLE0
P2D6 = {s: sum(1 for a in range(1,7) for b in range(1,7) if a+b == s)/36 for s in range(2,13)}
BANDP = [sum(P2D6[s] for s in range(lo, hi+1)) for lo, hi in BANDS]

VP = {(0,0):8,(0,5):2,(1,0):3,(2,4):3,(4,5):2,(5,0):5,(5,5):2,(6,0):15,(7,5):2,
      (8,1):2,(8,0):2,(9,5):5,(10,2):5,(10,0):2,(10,5):4,(11,0):2,(11,5):3}
FORTRESS = {(10,2),(10,5)}
PARIS, PORTS, HAZE = (6,0), (0,0), (1,0)
WET_LANES = {0,1,2}; CHALK_LANES = {3,4,5,7,8}; OPEN_LANES = {4,5,8}
RIDGE = {(1,3),(2,3),(3,3),(7,3),(8,3),(10,2),(10,3)}
FOREST_LANES = {9}; MOUNTAIN_LANES = {11}; FLOODED = {(0,2)}
def terrain_shift(box, month, attackers_have_tank):
    l, c = box; sh = 0
    if box in FLOODED: sh -= 2
    if box in RIDGE: sh -= 1
    if l in FOREST_LANES or l in MOUNTAIN_LANES: sh -= 1
    if l in WET_LANES and month in (9,10,11): sh -= 1
    if attackers_have_tank and not (l in FOREST_LANES or l in MOUNTAIN_LANES):
        sh += 2 if l in OPEN_LANES else 1
    return sh

def ym(t):  # turn 0 = Dec 1914
    m = 11 + t
    return 1914 + m // 12, m % 12 + 1
def mkey(t):
    y, m = ym(t); return y*100 + m

# The default settings follow docs/RULES.md. (They used to be passed in by
# tools/levels.py; levels.py now only adds the difficulty levels on top.)
DEFAULT = dict(
  will={'GER':108,'FRA':75,'GBR':85,'USA':90},            # §11 starting Will (GER 108 with the economy, §19)
  stack=3, dug_in_level=2, winter_shift=1, mutiny_at=35,   # §5 stacking, §9.4 dug in, §9.2 winter, §10 mutinies
  blockade1=1, blockade1_every=2,                          # §10 1916: GER −1 Will every other month
  blockade2=1,                                             # §10 1917 Turnip Winter: GER −1 every month
  blockade3=2,                                             # §10 1918 Hunger: GER −2 every month
  uboat_gbr=2, paris_loss=25, ports_loss=15,               # §10 U-boats, §11 Paris and the Channel Ports
  loss_div={'GER':3,'FRA':2,'GBR':2,'USA':3},             # §4, §11: 1 Will per 3 (GER, USA) or 2 (FRA, GBR) steps
  commanders=True,                                         # §15 commander cards
  fail_mode='futile', futile_pen=3,                        # §9.4 futile attacks cost 3 Will
  mandate=0, mandate_ger=15,                               # §10 Kaiserschlacht gamble: GER −15 if no attack Apr–Oct 1918
  score_end=True, avg_score=True, draw_margin=2,           # §11 Armistice Score (GER − FRA/GBR average), ±2 is a draw
  end_ger_will=25, end_boxes=3,                            # (old ending, unused while score_end is on)
  res_mult={'G':1.0,'E':1.0}, will_bonus={'G':0,'E':0},    # §13 difficulty (set by levels.py)
  # §19 the war economy (Version 1.3). economy=False plays Version 1.2 (no stockpile,
  # no research, no cities); then also set will GER 105 to get the old results.
  economy=True,                                            # §19 on
  split=True,                                              # separate Manpower and Industry (not one shared budget)
  blockade_pp=0,                                           # §19.3 the blockade does NOT cut German Industry
  industry=True,                                           # §19.3 industrial cities
  stock_cap=3,                                             # §19.4 munitions stockpile, max 3
  mun_target=3,                                            # §19.7 the computer tops the stockpile up to 3
  res_cap=3,                                               # §19.7 ...then up to 3 IP a month into research
  pp_extra={'GER':(1,1), 'FRA':(0,1), 'GBR':(0,0), 'USA':(0,0)},  # §19.2 war-economy bonus (1915, 1916+)
)

def resources(nat, t, cfg, side):
    y, m = ym(t); k = y*100+m
    if nat == 'GER':
        op = 4 if y >= 1918 else 2; mu = 3
        rp = 1 if k >= 191808 else (2 if y >= 1917 else 3)
    elif nat == 'FRA':
        op = 2; mu = (5 if y >= 1918 else 4 if y >= 1917 else 3 if y >= 1916 else 2) if cfg.get('traits', True) else (3 if y >= 1916 else 2)
        rp = 1 if y >= 1918 else (2 if y >= 1916 else 3)
    elif nat == 'GBR':
        op = 3 if y >= 1918 else (2 if y >= 1916 else 1)
        mu = 4 if y >= 1917 else (3 if y >= 1916 else 1)
        rp = 3 if y >= 1916 else 2
    elif nat == 'USA':
        op = 2 if k >= 191808 else 1; mu = 1; rp = 2
    else:
        return 0, 0, 0
    f = cfg['res_mult'][side]
    return op, int(round(mu*f)), int(round(rp*f))

def reinf_schedule(us_declare):
    R = {}
    def add(k, nat, typ='inf', n=1):
        R.setdefault(k, []).extend([(nat, typ)]*n)
    for k in [191503,191506,191509,191601,191604,191607,191610]: add(k,'GER')
    add(191703,'GER',n=2); add(191706,'GER',n=2)
    add(191801,'GER',n=3); add(191802,'GER',n=3); add(191803,'GER',n=2)
    for k in [191502,191504,191506,191509]: add(k,'FRA')
    for k,n in [(191503,2),(191505,2),(191507,2),(191509,1),(191601,2),(191603,1)]: add(k,'GBR',n=n)
    add(191609,'GBR','tank'); add(191711,'GBR','tank'); add(191808,'GBR','tank',2)
    add(191704,'FRA','tank'); add(191806,'FRA','tank'); add(191808,'FRA','tank')
    if us_declare:
        base = [(7,1),(11,1),(12,1),(13,2),(14,2),(15,3),(16,3),(17,2),(18,1)]
        y, m = us_declare // 100, us_declare % 100
        for off, n in base:
            mm = m - 1 + off; k = (y + mm//12)*100 + mm % 12 + 1
            if k <= 191811: add(k, 'USA', 'usinf', n)
    return R

SKILL = {
 # min_col: lowest column it will attack at; noise: random score jitter; mun: spends munitions well
 'novice':   dict(thresh=-0.6, attr_w=0.0, loss_w=0.1, min_col=1, noise=0.8, smart_mun=False, rail_eff=0.5, hindenburg=False, focus=0.0, uboat=0.5, stop_loss=False),
 'standard': dict(attr_w=0.5, loss_w=0.5, min_col=3, noise=0.1, smart_mun=True,  rail_eff=1.0, hindenburg=True,  focus=0.3, uboat=1.0, stop_loss=True),
 'turtle':   dict(attr_w=0.5, loss_w=0.5, min_col=9, noise=0.1, smart_mun=True, rail_eff=1.0, hindenburg=True, focus=0.3, uboat=1.0, stop_loss=True),
 'beginner': dict(thresh=-0.2, attr_w=0.0, loss_w=0.3, min_col=2, noise=0.5, smart_mun=False, rail_eff=0.5, hindenburg=False, focus=0.0, uboat=0.5, stop_loss=False),
 'patient':  dict(attr_w=0.5, loss_w=0.5, min_col=4, noise=0.1, smart_mun=True, rail_eff=1.0, hindenburg=True, focus=0.3, uboat=1.0, stop_loss=True),
 'expert':   dict(attr_w=1.0, loss_w=0.6, min_col=3, noise=0.05,smart_mun=True,  rail_eff=1.0, hindenburg=True,  focus=1.0, uboat=1.0, stop_loss=True, expert=True),
}

def best_col_low(g, att, tb, mn, s):
    c = g.column(att, tb, mn, s); return c is not None and c <= 1

# The war economy (docs/RULES.md §19). Must match data/economy.json.
# TECHS: research (§19.5). Historical month (None = never happened), earliest month, cost in IP.
TECHS = {  # name: (nation, historical key or None, earliest key, cost)
 'creeping': ('ENT', 191606, 191601, 8),
 'tanks':    ('GBR', 191609, 191603, 10),
 'renault':  ('FRA', 191806, 191801, 8),
 'heavyart': ('FRA', None,   191601, 10),
 'depth':    ('GER', 191701, 191607, 8),
 'storm':    ('GER', 191801, 191707, 10),
 'a7v':      ('GER', None,   191801, 12),
}
# INDUSTRY: industrial cities (§19.3), box (lane-1, column) -> (nation it belongs to, IP lost if captured).
# Lille (2,4) also gives France +1 IP when the Entente retakes it.
INDUSTRY = {(6,0): ('FRA', 3), (0,0): ('GBR', 2), (5,0): ('FRA', 1),
            (2,4): ('GER', 1), (10,5): ('GER', 2), (9,5): ('GER', 1)}

def cmdr(g, nat):
    if not g.cfg.get('commanders'): return None
    r = _cmdr(g, nat)
    return None if r in g.cfg.get('cmd_off', ()) else r

def _cmdr(g, nat):
    k = mkey(g.t)
    if nat == 'FRA': return 'joffre' if k <= 191611 else ('nivelle' if k <= 191704 else 'petain')
    if nat == 'GBR': return 'french' if k <= 191511 else 'haig'
    if nat == 'GER': return 'falkenhayn' if k <= 191608 else 'hl'
    if nat == 'USA': return 'pershing'
    if nat == 'ENT': return 'foch' if k >= 191804 else None

class Game:
    def __init__(self, skillG, skillE, cfg=None, seed=0):
        self.cfg = copy.deepcopy(DEFAULT)
        if cfg:
            for k, v in cfg.items(): self.cfg[k] = v
        self.rng = random.Random(seed)
        self.sk = {'G': SKILL[skillG], 'E': SKILL[skillE]}
        self.owner = {(l,c): ('E' if c < 3 else 'G') for l in range(LANES) for c in range(COLS)}
        self.trench = {(l,c): (1 if c in (2,3) else 0) for l in range(LANES) for c in range(COLS)}
        self.units = []
        self.will = {n: self.cfg['will'][n] for n in ['GER','FRA','GBR']}
        self.will['GER'] += self.cfg['will_bonus']['G']
        self.will['FRA'] += self.cfg['will_bonus']['E']; self.will['GBR'] += self.cfg['will_bonus']['E']
        self.pool = {'GER':0,'FRA':0,'GBR':0,'USA':0,'BEL':0}
        self.us_declare = None; self.mutiny_left = 0; self.mutinied = False
        self.uboat_left = 0; self.result = None; self.t = 0
        self.stats = dict(caps={'G':0,'E':0}, attacks={'G':0,'E':0}, will_hist=[])
        for l in range(12): self.add('GER','inf',(l,3))
        for l in [1,5,6,7,10]: self.add('GER','inf',(l,4))
        self.add('BEL','inf',(0,2)); a1 = self.add('GBR','inf',(1,2)); a2 = self.add('GBR','inf',(2,2))
        if self.cfg.get('commanders') and 'french' not in self.cfg.get('cmd_off', ()): a1['elite'] = a2['elite'] = True
        for l in range(3,12): self.add('FRA','inf',(l,2))
        for l in [0,1,3,5,6,7,8,10,11]: self.add('FRA','inf',(l,1))
        self.reinf = None
        self.season_att = {}
        self.nivelle_used = False
        self.stock = {n: 0 for n in ['GER','FRA','GBR','USA']}
        self.econ_rp = {n: 0 for n in ['GER','FRA','GBR','USA']}
        self.rprog = {}; self.tech = set(); self.ppspent = {n: {'mun':0,'rp':0,'res':0} for n in ['GER','FRA','GBR','USA']}
        self.month_att = {}

    def side(self, nat): return 'G' if nat == 'GER' else 'E'
    def res(self, nat, s):
        op, mu, rp = resources(nat, self.t, self.cfg, s)
        c = cmdr(self, nat); y, m = ym(self.t); k = mkey(self.t)
        if c == 'joffre' and 3 <= m <= 10: op += 1
        if c == 'nivelle': mu += 1
        if c == 'petain': op = min(op, 1)
        if c == 'haig' and y >= 1916: op += 1
        if c == 'haig' and 191801 <= k <= 191804: rp = max(0, rp - 1)
        if c == 'hl': rp += 1
        return op, mu, rp
    def has(self, t):
        nat, hist, early, cost = TECHS[t]
        if t in self.tech: return True
        return (not self.cfg.get('economy')) and hist is not None and mkey(self.t) >= hist or (self.cfg.get('economy') and hist is not None and mkey(self.t) >= hist)
    def pp(self, nat, s):
        op, mu, rp = self.res(nat, s)
        y = ym(self.t)[0]
        ex = self.cfg.get('pp_extra', {}).get(nat)
        if ex is None: ex = (self.cfg.get('pp_extra1', 1), self.cfg.get('pp_extra2', 2))
        p = mu + rp + (ex[0] if y <= 1915 else ex[1])
        if nat == 'GER': p -= {1917: 1, 1918: 2}.get(y, 0) * self.cfg.get('blockade_pp', 1)
        for b, (n, v) in (INDUSTRY.items() if self.cfg.get('industry', True) else []):
            owner_side = self.owner[b]
            if n == 'GER' and owner_side == 'E':
                if nat == 'GER': p -= v
                if nat == 'FRA' and b == (2,4): p += v
            if n in ('FRA','GBR') and owner_side == 'G' and nat == n: p -= v
        if 'heavyart' in self.tech and nat == 'FRA': p += 1
        return max(0, p)
    # §19.4 and §19.7: each nation's monthly budget. With split=True, Manpower (= the
    # replacements schedule) goes to RP and Industry buys munitions (stockpile, max
    # stock_cap) and research; a careful AI tops munitions up to mun_target first.
    def economy(self, s):
        k = mkey(self.t); sk = self.sk[s]
        nats = ['GER'] if s == 'G' else ['FRA','GBR'] + (['USA'] if self.us_declare and k >= self.us_declare else [])
        sm = self.supply_maps()
        for nat in nats:
            p = self.pp(nat, s); hist_rp = self.res(nat, s)[2]
            if self.cfg.get('no_stock'): self.stock[nat] = 0
            need = sum(u['mx'] - u['steps'] for u in self.units if u['nat'] == nat and self.in_supply(u, sm))
            need += 2 * self.pool[nat]
            opts = [t for t, (n, hist, early, cost) in TECHS.items()
                    if (n == nat or (n == 'ENT' and nat in ('FRA','GBR'))) and t not in self.tech
                    and k >= early and not (hist and k >= hist)]
            left = min((TECHS[t][3] - self.rprog.get(t, 0) for t in opts), default=0)
            if self.cfg.get('no_research'): left = 0
            cap = self.cfg.get('stock_cap', 6)
            if self.cfg.get('split'):
                rp = hist_rp                      # manpower: replacements only
                p = max(0, p - hist_rp)           # industry = the rest (never below 0)
                assert p >= 0, 'Industry can never go below 0 (RULES.md §19.2)'
                if not sk['smart_mun']:
                    res = min(self.rng.randint(0, p), left); mun = p - res
                else:
                    tgt = self.cfg.get('mun_target', 4)
                    mun = min(max(0, tgt - self.stock[nat]), p); p -= mun
                    res = min(p, left, self.cfg.get('res_cap', 3)) if sk.get('research', True) else 0; p -= res
                    mun += p
            elif not sk['smart_mun']:   # beginner/novice: random split
                rp = self.rng.randint(0, p); p -= rp
                res = min(self.rng.randint(0, p), left); p -= res
                mun = p
            else:
                rp = min(need, hist_rp, p); p -= rp
                tgt = self.cfg.get('mun_target', 4)
                mun = min(max(0, tgt - self.stock[nat]), p); p -= mun
                res = min(p, left, self.cfg.get('res_cap', 3)) if sk.get('research', True) else 0; p -= res
                extra = min(p, max(0, need - rp)); rp += extra; p -= extra
                mun += p
            self.econ_rp[nat] = rp
            mun = min(mun, cap - self.stock[nat])
            self.stock[nat] += mun
            self.ppspent[nat]['mun'] += mun; self.ppspent[nat]['rp'] += rp; self.ppspent[nat]['res'] += res
            # research: pick cheapest available unfinished tech for this nation
            if res and opts:
                if True:
                    t = min(opts, key=lambda t: TECHS[t][3])
                    self.rprog[t] = self.rprog.get(t, 0) + res
                    if self.rprog[t] >= TECHS[t][3]:
                        self.tech.add(t)
                        if t == 'tanks': self.add('GBR', 'tank', self.rear_box('E'))
                        if t == 'renault': self.add('FRA', 'tank', self.rear_box('E'))
                        if t == 'a7v': self.add('GER', 'tank', self.rear_box('G'))
                        if t == 'storm':
                            n_ = 0
                            for u in self.units:
                                if u['nat'] == 'GER' and u['typ'] == 'inf' and n_ < 4: u['typ'] = 'storm'; n_ += 1
    def rear_box(self, s):
        col = self.rear_col(s)
        b = [(l, col) for l in range(LANES) if self.owner[(l, col)] == s and len(self.at((l, col))) < self.cfg['stack']]
        return self.rng.choice(b) if b else (0, col)
    def add(self, nat, typ, box, steps=None):
        mx = 5 if typ == 'usinf' else (2 if typ == 'tank' else 4)
        u = dict(nat=nat, typ=typ, steps=steps or mx, mx=mx, box=box, attacked=False, moved_rail=False)
        self.units.append(u); return u
    def at(self, box): return [u for u in self.units if u['box'] == box]
    def adj(self, b):
        l, c = b
        for dl, dc in ((1,0),(-1,0),(0,1),(0,-1)):
            if 0 <= l+dl < LANES and 0 <= c+dc < COLS: yield (l+dl, c+dc)
    def rear_col(self, s): return 0 if s == 'E' else 5

    # ---------- supply ----------
    def supplied_boxes(self, s, sources):
        seen = set(b for b in sources if self.owner[b] == s); dq = deque(seen)
        while dq:
            b = dq.popleft()
            for n in self.adj(b):
                if n not in seen and self.owner[n] == s: seen.add(n); dq.append(n)
        return seen
    def supply_maps(self):
        g = self.supplied_boxes('G', [(l,5) for l in range(LANES)])
        e = self.supplied_boxes('E', [(l,0) for l in range(LANES)])
        b = self.supplied_boxes('E', [PORTS, HAZE])
        return {'G': g, 'E': e, 'GBR': b}
    def in_supply(self, u, sm):
        if u['nat'] == 'GBR': return u['box'] in sm['GBR']
        return u['box'] in sm[self.side(u['nat'])]

    # ---------- combat ----------
    def max_trench(self, box=None):
        k = mkey(self.t); m = 1 if k < 191506 else (2 if k < 191606 else 3)
        if box is not None and self.cfg.get('terrain', True):
            if box[0] in CHALK_LANES and k >= 191506: m = 3
            if box[0] in WET_LANES: m = min(m, 2)
        return m
    def max_mun(self, side=None):
        if self.cfg.get('economy') and side == 'E' and 'creeping' in self.tech: return 3
        return 3 if mkey(self.t) >= 191606 else 2
    def column(self, att, box, mun, side, gas=0):
        dsteps = sum(u['steps'] for u in self.at(box))
        asteps = sum(u['steps'] for u in att)
        if dsteps == 0: col = 5
        else:
            r = asteps / dsteps
            if r < 0.5: return None
            col = max(i for i, x in enumerate(RATIOS) if r >= x - 1e-9)
        sh = -self.trench[box]
        if box in FORTRESS: sh -= 1
        if ym(self.t)[1] in (12,1,2): sh -= self.cfg['winter_shift']
        k = mkey(self.t); y, mo = ym(self.t)
        if self.cfg.get('terrain', True):
            sh += terrain_shift(box, mo, any(u['typ'] == 'tank' for u in att))
        else:
            if box[0] == 11: sh -= 1
            if any(u['typ'] == 'tank' for u in att): sh += 1
        sh += mun
        if self.cfg.get('traits', True):
            defn = [u['nat'] for u in self.at(box)]
            if side == 'G' and k <= 191512: sh += 1                       # German heavy howitzers
            if side == 'G' and defn and defn[0] == 'FRA' and self.trench[box] <= 1 and k <= 191612: sh -= 1  # French 75s
            if side == 'E' and k >= 191808: sh += 1                       # German army exhausted
            green = sum(u['steps'] for u in att if u.get('green_until', 0) > k)
            if green * 2 > sum(u['steps'] for u in att): sh -= 1          # inexperienced troops
            if any(u.get('elite') for u in att): sh += 1                  # Dominion corps
        if any(u['typ'] == 'storm' for u in att) and self.trench[box] > 0: sh += 1
        sh += gas
        return max(0, min(5, col + sh))
    def exp_outcome(self, col, box):
        dug = self.trench[box] >= self.cfg['dug_in_level']
        dsteps = sum(u['steps'] for u in self.at(box))
        ea = ed = pt = 0
        did = self.at(box) and self.at(box)[0]['nat'] == 'GER' and (self.has('depth') if self.cfg.get('economy') else mkey(self.t) >= 191701) and self.trench[box] >= 2 and self.cfg.get('traits', True)
        if did: ea += 1
        for p, (a, d, r) in zip(BANDP, TABLE[col]):
            if dug and r: d += 1; r = 0
            ea += p*a; ed += p*min(d, dsteps)
            if r or d >= dsteps: pt += p
        if dsteps == 0: pt = 1
        return ea, ed, pt
    def roll(self):
        s = self.rng.randint(1,6) + self.rng.randint(1,6)
        for i, (lo, hi) in enumerate(BANDS):
            if lo <= s <= hi: return i
    def take_losses(self, units, n, lost):
        for _ in range(n):
            alive = [u for u in units if u['steps'] > 0]
            if not alive: break
            u = max(alive, key=lambda x: x['steps']); u['steps'] -= 1; lost[u['nat']] += 1
        for u in units:
            if u['steps'] <= 0 and u in self.units:
                self.units.remove(u)
                if u['typ'] != 'tank': self.pool[u['nat']] += 1

    def resolve(self, att, box, mun, side, lost, gas=0):
        col = self.column(att, box, mun, side, gas)
        self.last_col = col
        defs = self.at(box)
        dug = self.trench[box] >= self.cfg['dug_in_level']
        if not defs:
            a, d, r = 0, 0, 1
        else:
            a, d, r = TABLE[col][self.roll()]
            if dug and r: d += 1; r = 0
            if self.cfg.get('traits', True) and side == 'E' and (self.has('depth') if self.cfg.get('economy') else mkey(self.t) >= 191701) and self.trench[box] >= 2 and defs[0]['nat'] == 'GER':
                a += 1
        before_fra = lost['FRA']
        self.take_losses(att, a, lost); self.take_losses(defs, d, lost)
        if box == (10,2) and side == 'G': self.verdun_fra += lost['FRA'] - before_fra
        defs = self.at(box)
        for u in att: u['attacked'] = True
        took = False
        if r or not defs:
            enemy = 'G' if side == 'E' else 'E'
            for u in defs:
                opts = [n for n in self.adj(box) if self.owner[n] == enemy and len(self.at(n)) < self.cfg['stack']]
                if opts:
                    deeper = [n for n in opts if (n[1] > box[1] if enemy == 'G' else n[1] < box[1])]
                    u['box'] = (deeper or opts)[0]
                else:
                    self.units.remove(u); lost[u['nat']] += u['steps']
                    if u['typ'] != 'tank': self.pool[u['nat']] += 1
            alive = sorted([u for u in att if u['steps'] > 0], key=lambda x: -x['steps'])
            if alive:
                for u in alive[:2]: u['box'] = box
                prev = self.owner[box]; self.owner[box] = side; self.trench[box] = 0; took = True
                self.stats['caps'][side] += 1
                self.on_capture(box, prev, side)
        return took

    def on_capture(self, box, prev, side):
        if box in VP:
            v = VP[box]
            if side == 'G':
                loser = 'GBR' if box[0] <= 2 else 'FRA'
                self.will[loser] -= v; self.will['GER'] += v // 2
            else:
                self.will['GER'] -= v
                self.will['FRA'] += v // 4; self.will['GBR'] += v // 4
        if box == PARIS and side == 'G':
            self.will['FRA'] -= self.cfg['paris_loss']; self.will['GER'] += 10
        if box == PORTS and side == 'G':
            self.will['GBR'] -= self.cfg['ports_loss']

    # ---------- AI ----------
    def front_boxes(self, s):
        return [b for b, o in self.owner.items() if o == s and any(self.owner[n] != s for n in self.adj(b))]
    def threat(self, b, s):
        en = sum(u['steps'] for n in self.adj(b) if self.owner[n] != s for u in self.at(n))
        own = sum(u['steps'] for u in self.at(b))
        val = VP.get(b, 0) * 0.3
        return en - own - 2*self.trench[b] + val + (6 if own == 0 else 0)
    def path_step(self, u, target, s):
        prev = {u['box']: None}; dq = deque([u['box']])
        while dq:
            b = dq.popleft()
            if b == target: break
            for n in self.adj(b):
                if n not in prev and self.owner[n] == s: prev[n] = b; dq.append(n)
        if target not in prev: return None
        b = target
        while prev[b] != u['box']:
            b = prev[b]
            if b is None: return None
        return b
    def ai_move(self, s):
        sk = self.sk[s]
        nats = ['GER'] if s == 'G' else ['FRA','GBR','USA','BEL']
        rails = {'GER':3,'FRA':2,'GBR':1,'USA':0,'BEL':0}
        if s == 'G' and getattr(self, 'extra_rail', 0): rails['GER'] += self.extra_rail; self.extra_rail = 0
        if cmdr(self, 'GER') == 'falkenhayn': rails['GER'] = min(rails['GER'], 2)
        if cmdr(self, 'ENT') == 'foch': rails['FRA'] += 1; rails['GBR'] += 1
        rails = {k: int(v*sk['rail_eff']+0.5) for k, v in rails.items()}
        front = set(self.front_boxes(s))
        # mobile units: units not in front, or surplus units in quiet front boxes
        for _ in range(self.cfg.get('move_passes', 1)):   # RULES.md §8: each unit moves once a turn (the old default of 2 let units move twice; docs/BALANCE.md)
            fl = sorted(front, key=lambda b: -self.threat(b, s))
            for u in [u for u in self.units if self.side(u['nat']) == s]:
                if u['nat'] == 'BEL': continue
                here = u['box']
                if here in front:
                    stack = self.at(here)
                    if len(stack) <= 1 or self.threat(here, s) > -4: continue
                tgt = None
                for b in fl:
                    if b != here and len(self.at(b)) < self.cfg['stack'] and self.threat(b, s) > -6:
                        tgt = b; break
                if not tgt: continue
                if tgt in self.adj(here): u['box'] = tgt; continue
                if rails[u['nat']] > 0 and tgt in self.supplied_boxes(s, [here]):
                    rails[u['nat']] -= 1; u['box'] = tgt; u['moved_rail'] = True; continue
                nb = self.path_step(u, tgt, s)
                if nb and len(self.at(nb)) < self.cfg['stack']: u['box'] = nb
    def ai_attack(self, s, lost):
        sk = self.sk[s]
        nats = ['GER'] if s == 'G' else ['FRA','GBR','USA']
        sm = self.supply_maps()
        res = {n: list(self.res(n, s)) for n in nats}
        if self.cfg.get('economy'):
            for n in nats: res[n][1] = self.stock.get(n, 0)
        failed = {n: 0 for n in nats}
        spent_loss = {n: 0.0 for n in nats}
        y, m = ym(self.t); k = mkey(self.t)
        gas_used = False
        while True:
            best = None
            for nat in nats:
                if nat == 'FRA' and self.mutiny_left > 0: continue
                op, mu, rp = res[nat]
                if op < 1: continue
                if sk['stop_loss'] and spent_loss[nat] > rp + 2: continue
                targets = set(n for b in self.front_boxes(s) for n in self.adj(b) if self.owner[n] != s)
                for tb in targets:
                    att = [u for n in self.adj(tb) if self.owner[n] == s for u in self.at(n)
                           if u['nat'] == nat and not u['attacked'] and not u['moved_rail'] and self.in_supply(u, sm)]
                    if not att: continue
                    # keep at least one unit in each source box unless capture is likely
                    gas = 2 if (nat == 'GER' and k == 191504 and tb[0] == 1 and not gas_used) else 0
                    if nat == 'FRA' and cmdr(self, 'FRA') == 'nivelle' and not self.nivelle_used and k >= 191704: gas = 2
                    mun_opts = range(0, min(mu, self.max_mun(s)) + 1)
                    if not sk['smart_mun']:
                        mun_opts = [self.rng.randint(0, min(mu, self.max_mun(s)))]
                    for mn in mun_opts:
                        col = self.column(att, tb, mn, s, gas)
                        if col is None: continue
                        if col < min(sk['min_col'],5) or sk['min_col'] > 5: continue
                        ea, ed, pt = self.exp_outcome(col, tb)
                        val = VP.get(tb, 1) if VP.get(tb) else 1
                        # depth value: boxes deeper toward enemy rear
                        depth = (tb[1] - 2) if s == 'E' else (3 - tb[1])
                        val += 0.5*max(depth, 0)
                        if sk.get('expert'):
                            # value boxes on the road to VP targets
                            for n2 in self.adj(tb):
                                if self.owner[n2] != s and n2 in VP: val += VP[n2]*0.25
                        urge = 0
                        if s == 'G' and 191602 <= k <= 191606 and tb == (10,2): urge = 2
                        if s == 'G' and 191803 <= k <= 191806 and tb[0] <= 5: urge = 2
                        if s == 'E' and nat == 'GBR' and 191607 <= k <= 191609 and tb[0] == 5: urge = 2
                        # will-aware attrition: value enemy will lost vs own will lost
                        ldo = self.cfg['loss_div'][nat]
                        enat = 'GER' if s == 'E' else ('GBR' if tb[0] <= 2 else 'FRA')
                        lde = self.cfg['loss_div'][enat]
                        attr = ed/lde - ea/ldo
                        score = pt*(val+urge) + sk['attr_w']*attr*3 - ea*sk['loss_w'] - 0.15*mn
                        score *= 1 + self.rng.uniform(-sk['noise'], sk['noise'])
                        if best is None or score > best[0]:
                            best = (score, nat, tb, att, mn, gas, ea)
            if not best or best[0] <= sk.get('thresh', 0): break
            score, nat, tb, att, mn, gas, ea = best
            if gas and nat == 'GER': gas_used = True
            niv = gas and nat == 'FRA' and cmdr(self, 'FRA') == 'nivelle'
            if niv: self.nivelle_used = True
            res[nat][0] -= 1; res[nat][1] -= mn
            if self.cfg.get('economy'): self.stock[nat] -= mn
            spent_loss[nat] += ea
            self.stats['attacks'][s] += 1
            took = self.resolve(att, tb, mn, s, lost, gas)
            self.attacked_boxes.add(tb)
            if niv and not took and not self.mutinied:
                self.mutinied = True; self.mutiny_left = 3
            if not took:
                fm = self.cfg.get('fail_mode', 'mun')
                if fm == 'all' or self.cfg.get('fail_all') and fm != 'futile': failed[nat] += 1
                elif fm == 'futile' and self.last_col <= 1: failed[nat] += self.cfg.get('futile_pen', 2)
                elif fm == 'mun' and mn > 0: failed[nat] += 1
            self.season_att[nat] = self.season_att.get(nat, 0) + 1
            self.month_att[nat] = self.month_att.get(nat, 0) + 1
            sm = self.supply_maps()
        for nat, f in failed.items(): self.will[nat] = self.will.get(nat, 0) - f
        return res

    # ---------- phases ----------
    def events(self):
        k = mkey(self.t); s = self.sk['G']
        if self.reinf is None or k in (191702, 191801):
            pass
        if k == 191702:
            if self.rng.random() < s['uboat']:
                self.us_declare = 191704; self.uboat_left = 6
            else:
                self.us_declare = 191801
            self.reinf = None
        if self.reinf is None: self.reinf = reinf_schedule(self.us_declare)
        if k == 191703 and s['hindenburg']:
            for l in range(4, 8):
                if self.owner[(l,3)] == 'G':
                    for u in self.at((l,3)):
                        if len(self.at((l,4))) < self.cfg['stack']: u['box'] = (l,4)
                        else: u['box'] = (l,5)
                    if not self.at((l,3)) and self.owner[(l,2)] == 'E':
                        self.owner[(l,3)] = 'E'; self.trench[(l,3)] = 0
                if self.owner[(l,4)] == 'G': self.trench[(l,4)] = 3
            self.extra_rail = 2
        if k == 191712: self.will['GER'] += 10
        if k == 191704 and self.cfg.get('traits', True):
            gb = [u for u in self.units if u['nat'] == 'GBR' and u['typ'] == 'inf' and not u.get('green_until')]
            gb += [u for u in self.units if u['nat'] == 'GBR' and u['typ'] == 'inf' and u.get('green_until')]
            for u in gb[:2]: u['elite'] = True; u['green_until'] = 0
        if k == 191801 and not (self.cfg.get('economy') and 'storm' in self.tech):
            n = 0
            for u in self.units:
                if u['nat'] == 'GER' and u['typ'] == 'inf' and n < 4: u['typ'] = 'storm'; n += 1
        if self.us_declare and k == self.us_declare: self.will['USA'] = self.cfg['will']['USA']
        for nat, typ in self.reinf.get(k, []):
            if self.cfg.get('economy') and typ == 'tank' and ((k == 191609 and 'tanks' in self.tech) or (k == 191806 and 'renault' in self.tech)): continue
            s_ = self.side(nat); col = self.rear_col(s_)
            boxes = [(l, col) for l in range(LANES) if self.owner[(l, col)] == s_ and len(self.at((l, col))) < self.cfg['stack']]
            if nat == 'GBR': boxes = [b for b in boxes if b[0] <= 5] or boxes
            if nat == 'USA': boxes = [b for b in boxes if b[0] >= 8] or boxes
            if boxes:
                u = self.add(nat, typ, self.rng.choice(boxes))
                if self.cfg.get('traits', True):
                    if nat == 'GBR' and typ == 'inf' and k <= 191603: u['green_until'] = 191701
                    if nat == 'USA': mm = k % 100 + (2 if (self.cfg.get('commanders') and 'pershing' not in self.cfg.get('cmd_off', ())) else 3); u['green_until'] = (k//100 + (mm-1)//12)*100 + (mm-1) % 12 + 1
    def step(self):
        k = mkey(self.t)
        for u in self.units: u['attacked'] = False; u['moved_rail'] = False
        self.attacked_boxes = set(); self.month_att = {}; self.verdun_fra = 0
        lost = {n: 0 for n in ['GER','FRA','GBR','USA','BEL']}
        self.events()
        if self.cfg.get('economy'):
            self.economy('G'); self.economy('E')
        for s in ('G', 'E'):
            self.ai_move(s)
            res = self.ai_attack(s, lost)
            if s == 'G': resG = res
            else: resE = res
        # supply attrition
        sm = self.supply_maps()
        for u in list(self.units):
            if not self.in_supply(u, sm):
                u['steps'] -= 1; lost[u['nat']] += 1
                if u['steps'] <= 0:
                    self.units.remove(u)
                    if u['typ'] != 'tank': self.pool[u['nat']] += 1
        # dig in
        for b in self.owner:
            mt = self.max_trench(b)
            if self.at(b) and b not in self.attacked_boxes and self.trench[b] < mt:
                self.trench[b] += 1
        # replacements
        for nat, s in [('GER','G'),('FRA','E'),('GBR','E'),('USA','E')]:
            if nat == 'USA' and not (self.us_declare and k >= self.us_declare): continue
            rp = self.econ_rp[nat] if self.cfg.get('economy') else self.res(nat, s)[2]
            mine = [u for u in self.units if u['nat'] == nat and self.in_supply(u, sm) and u['steps'] < u['mx']]
            mine.sort(key=lambda u: (-(self.threat(u['box'], s)), u['steps']))
            if not self.sk[s]['smart_mun']: self.rng.shuffle(mine)
            while rp > 0:
                if rp >= 2 and self.pool[nat] > 0 and (not mine or self.pool[nat] > 0 and len(mine) == 0 or rp >= 3):
                    col = self.rear_col(s)
                    boxes = [(l, col) for l in range(LANES) if self.owner[(l, col)] == s and len(self.at((l, col))) < self.cfg['stack']]
                    if boxes:
                        self.add(nat, 'inf', self.rng.choice(boxes), steps=1); self.pool[nat] -= 1; rp -= 2; continue
                mine = [u for u in mine if u['steps'] < u['mx']]
                if not mine: break
                mine[0]['steps'] += 1; rp -= 1
                mine.sort(key=lambda u: (-(self.threat(u['box'], s)), u['steps']))
        # will
        for nat_ in lost: self.stats.setdefault('steps', {}).setdefault(nat_, 0); self.stats['steps'][nat_] += lost[nat_]
        for nat in ['GER','FRA','GBR','USA']:
            ld = self.cfg['loss_div'][nat]
            if nat == 'FRA' and cmdr(self, 'FRA') == 'petain': ld = 3
            if nat in self.will: self.will[nat] -= lost[nat] // ld
        if cmdr(self, 'GER') == 'falkenhayn': self.will['FRA'] -= self.verdun_fra // 4
        if cmdr(self, 'FRA') == 'joffre' and 3 <= k % 100 <= 10 and self.month_att.get('FRA', 0) == 0: self.will['FRA'] -= 2
        if cmdr(self, 'GER') == 'hl' and 191803 <= k <= 191807 and self.month_att.get('GER', 0) == 0: self.will['GER'] -= self.cfg.get('hl_must', 3)
        self.will['FRA'] -= lost['BEL'] // self.cfg['loss_div']['FRA']
        if k >= 191801: self.will['GER'] -= self.cfg.get('blockade3', self.cfg['blockade2'])
        elif k >= 191701: self.will['GER'] -= self.cfg['blockade2']
        elif k >= 191601 and (self.t % self.cfg.get('blockade1_every',1) == 0): self.will['GER'] -= self.cfg['blockade1']
        if self.uboat_left > 0: self.will['GBR'] -= self.cfg['uboat_gbr']; self.uboat_left -= 1
        if self.mutiny_left > 0:
            self.mutiny_left -= 1
            if cmdr(self, 'FRA') == 'petain' and self.mutiny_left == 2: self.mutiny_left = 1
            if self.mutiny_left == 0: self.will['FRA'] += 15 if cmdr(self, 'FRA') == 'petain' else 10
        elif not self.mutinied and self.will['FRA'] < self.cfg['mutiny_at']:
            self.mutinied = True; self.mutiny_left = 3
        if self.cfg.get('mandate'):
            if k % 100 == 4: self.season_att = {}
            if k % 100 == 10:
                for nat in (['FRA','GBR'] + (['USA'] if self.us_declare and k >= 191806 else [])):
                    if self.season_att.get(nat, 0) == 0 and not (nat == 'FRA' and self.mutinied and 191705 <= k <= 191712):
                        self.will[nat] -= self.cfg['mandate']
                if self.cfg.get('mandate_ger') and k >= 191801 and self.season_att.get('GER', 0) == 0:
                    self.will['GER'] -= self.cfg['mandate_ger']
        self.stats['will_hist'].append(dict(self.will))
        # victory
        if self.will['FRA'] <= 0 or self.will['GBR'] <= 0 or self.owner[PARIS] == 'G':
            self.result = 'G'; return
        if self.will['GER'] <= 0: self.result = 'E'; return
        if k == 191811:
            gboxes = sum(1 for b in VP if b[1] >= 3 and self.owner[b] == 'E')
            ebox = any(self.owner[b] == 'G' for b in VP if b[1] == 0)
            if self.cfg.get('score_end'):
                gvp = sum(v for b, v in VP.items() if b[1] < 3 and self.owner[b] == 'G')
                evp = sum(v for b, v in VP.items() if b[1] >= 3 and self.owner[b] == 'E')
                ew_ = (self.will['FRA'] + self.will['GBR'])/2 if self.cfg.get('avg_score') else min(self.will['FRA'], self.will['GBR'])
                sc = self.will['GER'] - ew_ + gvp - evp
                self.final_score = sc
                m = self.cfg.get('draw_margin', 5)
                self.result = 'G' if sc > m else ('E' if sc < -m else 'D')
            else:
                ew = self.cfg.get('end_ent_will', -999)
                e_ok = self.will['GER'] <= self.cfg['end_ger_will'] or gboxes >= self.cfg['end_boxes']
                g_ok = ebox or min(self.will['FRA'], self.will['GBR']) <= ew
                if e_ok and not g_ok: self.result = 'E'
                elif g_ok and not e_ok: self.result = 'G'
                else: self.result = 'D'
            return
        self.t += 1
    def play(self):
        while self.result is None: self.step()
        return self.result

def run(n, skG, skE, cfg=None, seed0=0):
    out = {'G':0,'E':0,'D':0}; turns = []; caps = []; capsG=[]; capsE=[]; sudden = 0; mut = 0; wills = []
    for i in range(n):
        g = Game(skG, skE, cfg, seed=seed0+i); r = g.play(); out[r] += 1
        turns.append(g.t); capsG.append(g.stats['caps']['G']); capsE.append(g.stats['caps']['E']); caps.append(g.stats['caps']['G'] + g.stats['caps']['E'])
        if mkey(g.t) < 191811: sudden += 1
        mut += g.mutinied
        wills.append(g.stats['will_hist'][-1])
    import statistics as st
    return dict(G=out['G']/n, E=out['E']/n, D=out['D']/n, turns=st.mean(turns),
                sudden=sudden/n, capsG=st.mean(g_ for g_ in capsG), capsE=st.mean(capsE), caps=st.mean(caps), mutiny=mut/n,
                endwill={k: round(st.mean(w.get(k,0) for w in wills)) for k in ['GER','FRA','GBR']})
