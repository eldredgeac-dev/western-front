import sys; import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sweep import *
# wfsim.DEFAULT already follows docs/RULES.md (table, Will, blockade, ending…), so the
# difficulty levels below only add their own bonuses on top.
BASE=dict()
LEVELS={ # player will bonus, ai will bonus, ai resource mult, ai skill
 'Recruit':      (15, 0, 0.8,'standard'),
 'Regular':      (0, 0, 1.0, 'standard'),
 'Veteran':      (0, 5, 1.15,'standard'),
 'Field Marshal':(0, 10, 1.3, 'expert'),
}
def cfg_for(level, player_side):
    pw, aw, am, ask = LEVELS[level]
    ai = 'E' if player_side=='G' else 'G'
    c=dict(BASE); c['will_bonus']={player_side:pw, ai:aw}; c['res_mult']={player_side:1.0, ai:am}
    # the computer Entente buys tanks only (DECISIONS.md 137); a player buys anything
    from wfsim import DEFAULT
    c['buy_only']={k:v for k,v in DEFAULT['buy_only'].items() if k==ai}
    return c, ask
if __name__=='__main__':
    cases=[]
    for lv in LEVELS:
        for ps in ['G','E']:
            for proxy in ['standard','beginner']:
                c,ask=cfg_for(lv,ps)
                g,e=(proxy,ask) if ps=='G' else (ask,proxy)
                cases.append((f"{lv[:8]} P={ps} {proxy[:3]}",g,e,c))
    out=sweep(cases,n=80,chunks=4)
    for (name,g,e),m in out:
        ps=name.split('P=')[1][0]
        win=m[ps]; lose=m['E' if ps=='G' else 'G']
        print(f"{name:26s} player win {win:.0%}  draw {m['D']:.0%}  loss {lose:.0%}")
