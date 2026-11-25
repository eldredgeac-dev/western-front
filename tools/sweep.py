import sys, json
from multiprocessing import Pool
from wfsim import run
def job(a):
    name,n,skG,skE,cfg,seed=a
    return name,skG,skE,run(n,skG,skE,cfg,seed)
def sweep(cases,n=200,chunks=8):
    tasks=[]
    for name,skG,skE,cfg in cases:
        for c in range(chunks): tasks.append((name,n//chunks,skG,skE,cfg,c*100000))
    with Pool() as p: res=p.map(job,tasks)
    agg={}
    for name,skG,skE,r in res:
        k=(name,skG,skE); agg.setdefault(k,[]).append(r)
    out=[]
    for k,rs in agg.items():
        m={x:sum(r[x] for r in rs)/len(rs) for x in ['G','E','D','turns','sudden','caps','capsG','capsE','mutiny']}
        m['endwill']={w:round(sum(r['endwill'][w] for r in rs)/len(rs)) for w in ['GER','FRA','GBR']}
        out.append((k,m))
    return out
def show(out):
    for (name,skG,skE),m in out:
        print(f"{name:14s} GER={skG:8s} ENT={skE:8s} | G {m['G']:.0%} E {m['E']:.0%} D {m['D']:.0%} | len {m['turns']:.0f} sudden {m['sudden']:.0%} mut {m['mutiny']:.0%} caps G{m['capsG']:.0f}/E{m['capsE']:.0f} | will {m['endwill']}")
