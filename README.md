# Western Front 1914–18

A single-player, turn-based strategy game of the First World War on the Western Front,
from December 1914 to the Armistice in November 1918. Play Germany or the Entente; the
computer plays the other side. It's built for an iPhone in Safari, folded or unfolded, and
uses plain HTML, CSS and JavaScript with no build step.

**Play:** https://eldredgeac-dev.github.io/western-front/

The rules are in [`docs/RULES.md`](docs/RULES.md) and the build plan is in
[`docs/MILESTONES.md`](docs/MILESTONES.md).

## Turn on GitHub Pages (one time)
1. On GitHub, open the repo and go to **Settings** → **Pages**.
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
3. Pick branch **main** and folder **/ (root)**, then tap **Save**.
4. After about a minute, the game is live at the link above. Every push or merge to
   `main` updates it. On iPhone you may need to pull down to refresh, or close and reopen
   the tab.

## Run it on your computer
ES modules don't work if you just double-click `index.html`, so use a small local web
server instead. In the repo folder, run:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000 in a browser.

## Run the tests
- **In a browser:** with the server above running, open
  http://localhost:8000/tests/tests.html. Green means everything passes.
- **In the terminal** (needs Node.js):

```bash
node tests/run.mjs
```

## Folder guide
- `index.html`: the page
- `css/`: styles
- `js/`: code (`js/engine/` is the game logic and never touches the page)
- `data/`: game content as JSON
- `tests/`: tests
- `docs/`: rules, history, balance and plan
- `tools/`: the Python balance simulator
