# count.py — the counting tool (DECISIONS.md 82). Plays computer-vs-computer wars in
# tools/wfsim.py and reports, per year, averaged per month at the start of the Entente
# attack phase: French units (and steps) in the front line, German territories French
# units could attack, how many of those reach 2:1 or better with the best barrage
# France can afford, French OP, and French attacks actually made.
# Compare with `node tools/count.mjs`, the same count in the game's own engine.
#   python3 tools/count.py [games=50] [key=value …]
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wfsim import Game

def count(n, cfg):
    tot = {}
    for i in range(n):
        g = Game('standard', 'standard', dict(cfg, probe=True), seed=i)
        g.play()
        for y, p in g.stats.get('probe', {}).items():
            t = tot.setdefault(y, {k: 0 for k in p})
            for k, v in p.items(): t[k] += v
    return tot

if __name__ == '__main__':
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 50
    cfg = {k: float(v) if '.' in v else int(v) for k, v in (a.split('=') for a in sys.argv[2:])}
    tot = count(n, cfg)
    print('year | French units in front | their steps | targets in reach | at 2:1+ | French OP | French attacks  (per month)')
    for y in sorted(tot):
        t = tot[y]; m = max(1, t['months'])
        print(f"{y} | {t['front']/m:.1f} | {t['frontSteps']/m:.1f} | {t['targets']/m:.1f} | {t['ok']/m:.2f} | {t['op']/m:.1f} | {t['attacks']/m:.2f}")
    print('per target in reach: year | French steps next to it | defending steps | trench | odds column before shifts | after shifts  (0 = 1:2 … 3 = 2:1 … 5 = 4:1)')
    for y in sorted(tot):
        t = tot[y]; c = max(1, t['targets'])
        print(f"{y} | {t['asteps']/c:.1f} | {t['dsteps']/c:.1f} | {t['trench']/c:.2f} | {t['ratio']/c:.2f} | {t['final']/c:.2f}")
