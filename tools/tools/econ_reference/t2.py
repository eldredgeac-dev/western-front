import wfsim
# harsher low-odds columns: 1:2 and 1:1 worse for attacker
wfsim.TABLE = dict(wfsim.TABLE0)
wfsim.TABLE[0] = [(4,0,0),(3,1,0),(3,1,0),(2,1,0),(2,1,0),(2,2,0)]
wfsim.TABLE[1] = [(3,1,0),(3,1,0),(2,1,0),(2,2,0),(2,2,0),(1,3,1)]
