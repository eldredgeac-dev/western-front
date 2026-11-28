# waste.py — the "IP thrown away per year" table in docs/BALANCE.md, plus attacks a
# year and the months a nation ran out of OP (or hit its attack limit).
#   python3 tools/waste.py [games=200] ['{"attack_ip":0,"stock_cap":3,"mun_target":3,"heavy_barrage_e":0}']  (that JSON = Version 1.8)
# Standard vs Standard. The JSON changes tools/wfsim.py's DEFAULT settings.
import sys, os, json; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wfsim
from multiprocessing import Pool
cfg = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
N = int(sys.argv[1]) if len(sys.argv) > 1 else 100
orig = wfsim.Game.ai_attack
def patched(self, s, lost):
    before = dict(self.month_att)
    res = orig(self, s, lost)
    y = wfsim.ym(self.t)[0]
    for nat, r in res.items():
        a = self.month_att.get(nat, 0) - before.get(nat, 0)
        A = self.stats.setdefault('att', {}).setdefault(nat, {}); A[y] = A.get(y, 0) + a
        if r[0] < 1 and a > 0:
            B = self.stats.setdefault('opout', {}).setdefault(nat, {}); B[y] = B.get(y, 0) + 1
    return res
wfsim.Game.ai_attack = patched
def one(i):
    g = wfsim.Game('standard', 'standard', cfg, seed=i); r = g.play()
    return r, g.stats.get('waste', {}), g.stats.get('att', {}), g.stats.get('opout', {}), g.t
if __name__ == '__main__':
    with Pool() as p: out = p.map(one, range(N))
    res = {'G':0,'E':0,'D':0}
    for r, *_ in out: res[r] += 1
    print('result', {k: f"{v/N:.0%}" for k, v in res.items()})
    for key, name in ((1, 'IP thrown away'), (2, 'attacks'), (3, 'months OP or the attack limit ran out')):
        print(name)
        for nat in ['GER','FRA','GBR','USA']:
            row = [sum(o[key].get(nat, {}).get(y, 0) for o in out)/N for y in (1915,1916,1917,1918)]
            print(f"  {nat}: " + '  '.join(f"{v:5.1f}" for v in row))
