# Fonts

All fonts are free under the SIL Open Font License 1.1 (the licence texts are the
`ofl-*.txt` files in this folder). They come from Google's font repository
(github.com/google/fonts), cut down to Latin letters and saved as `.woff2` to keep them
small. See docs/STYLE.md §3 for where each one is used.

They were cut down again (docs/PERFORMANCE.md) to the characters the game uses: plain
Latin letters, the Western European accented letters (U+00A0–00FF), Œ/œ, the dashes,
curly quotes, ellipsis, ‹ ›, arrows, − ≈ ≤ ≥ and ™. Made with fontTools:
`pyftsubset <font> --unicodes="U+20-7E,U+A0-FF,U+152-153,U+2013-2014,U+2018-201E,U+2022,U+2026,U+2039-203A,U+2122,U+2190-2193,U+2212,U+2248,U+2264-2265" --layout-features='kern,liga,smcp,c2sc,onum,lnum,pnum,tnum' --flavor=woff2`.
If new text needs another character, re-cut from the originals at github.com/google/fonts.

| File | Font | Designer | Licence file |
|---|---|---|---|
| `playfair-display-bold.woff2`, `playfair-display-black.woff2` | Playfair Display | Claus Eggers Sørensen | `ofl-playfairdisplay.txt` |
| `im-fell-english*.woff2` | IM Fell English (regular, italic, small caps) | Igino Marini | `ofl-imfellenglish.txt` |
| `source-serif-4*.woff2` | Source Serif 4 | Frank Grießhammer (Adobe) | `ofl-sourceserif4.txt` |
| `courier-prime*.woff2` | Courier Prime | Alan Dague-Greene (Quote-Unquote Apps) | `ofl-courierprime.txt` |
| `reenie-beanie.woff2` | Reenie Beanie | James Grieshaber | `ofl-reeniebeanie.txt` |
