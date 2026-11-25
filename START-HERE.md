# Start here — setting up and kicking off the build

## Step 1: Make the repo (5 minutes, on your Mac)
1. Go to github.com and click **+** (top right) → **New repository**.
2. Name it `western-front`. Set it to **Public**, since free GitHub Pages needs a public
   repo. Tick **Add a README**. Click **Create repository**.
3. Click **Add file** → **Upload files**.
4. Unzip `western-front-starter.zip` on your Mac. Drag in `CLAUDE.md` and the `docs`, `data`
   and `tools` folders, so the folder structure is kept.
5. Click **Commit changes**.

The repo should now look like this:
```
CLAUDE.md
README.md
docs/RULES.md
docs/HISTORY.md
docs/MILESTONES.md
docs/BALANCE.md
data/news.json  quotes.json   (real monthly news and quotes)
tools/wfsim.py  sweep.py  levels.py  t2.py   (the balance simulator)
```

## Step 2: Turn on GitHub Pages
1. In the repo, go to **Settings** → **Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**, then branch **main**
   and folder **/ (root)**. Click **Save**.
3. Your game will live at `https://eldredgeac-dev.github.io/western-front/`. It will show
   a blank or README page until milestone 1 is done.

## Step 3: Start Claude Code
1. Open Claude Code (web, Mac app or phone) and pick the **western-front** repo.
2. Turn on **plan mode** (Shift+Tab on a computer, or the mode toggle in the app).
   Claude Code will then show you a plan before it writes any code.
3. Paste the prompt below.

---

### Prompt for the first session (copy everything in the box)

```
I'm building a turn-based WWI Western Front strategy game to play on my iPhone
(a foldable, so it must work folded and unfolded) in Safari, hosted on GitHub Pages
from this repo. I'm not an experienced programmer and I'm learning as we go.

Before doing anything, read these files in full:
- CLAUDE.md (project rules and how to work with me)
- docs/RULES.md (the game rules, the source of truth)
- docs/HISTORY.md (the history behind the data)
- docs/MILESTONES.md (the build plan)
- docs/BALANCE.md (why the numbers are what they are)

Then:
1. Summarise the game back to me in 5-6 bullet points, so I know you understood it.
2. List any rules in RULES.md that are unclear, contradict each other, or will be
   hard to code. Suggest a fix for each. Don't change RULES.md until I agree.
3. Show me your plan for Milestone 1 only (skeleton and deploy): which files you will
   create and what each one does, in plain English.

Wait for my OK before writing code. When Milestone 1 is done, tell me exactly how to
check it on my phone, then commit and push.
```

---

## Every session after that
Paste this, changing the number:
```
Read CLAUDE.md and docs/MILESTONES.md. We're doing Milestone 2.
Show me the plan first. When done, explain what you changed in plain English,
run the tests, tell me what to check on my phone, then commit and push.
```

## Good habits
- **One milestone per session.** Starting a fresh session keeps Claude Code focused.
- **Test on your phone** before moving on. If something's wrong, describe exactly what
  you saw or send a screenshot.
- **Changes not showing on your phone?** Wait about a minute after the push, then pull
  down to refresh. If it still looks old, close the tab and reopen it.
- **Want to change a rule?** Say "Update RULES.md so that…" first, then ask it to change
  the code to match. That keeps the rules file the source of truth.
- **Got an idea for later?** Say "Add this to Later ideas in MILESTONES.md" instead of
  building it now.
- **Stuck or broken?** Say "Undo the last commit" — every milestone is a restore point.
