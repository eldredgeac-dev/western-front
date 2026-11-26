# matchups.py — the "Matchups" table in docs/BALANCE.md: equal skill, passive and
# reckless sides, beginners (200 games each, Germany / Entente / draw).
#   python3 tools/matchups.py [games=200] [key=value …]   e.g. mandate_ger=15
# Extra key=value pairs change tools/wfsim.py's DEFAULT settings (numbers only).
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sweep import sweep

CASES = [('Standard vs Standard', 'standard', 'standard'), ('Expert vs Expert', 'expert', 'expert'),
         ('Turtle Germany vs Standard', 'turtle', 'standard'), ('Standard vs Turtle Entente', 'standard', 'turtle'),
         ('Beginner Germany vs Standard', 'beginner', 'standard'), ('Standard vs Beginner Entente', 'standard', 'beginner'),
         ('Reckless Germany vs Standard', 'novice', 'standard'), ('Standard vs Reckless Entente', 'standard', 'novice')]

if __name__ == '__main__':
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 200
    cfg = {k: float(v) if '.' in v else int(v) for k, v in (a.split('=') for a in sys.argv[2:])}
    out = sweep([(name, g, e, cfg) for name, g, e in CASES], n=n, chunks=4)
    for (name, g, e), m in out:
        print(f"| {name} | {m['G']:.0%} | {m['E']:.0%} | {m['D']:.0%} | mutinies {m['mutiny']:.0%} |")
