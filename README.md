# 🐻 הדוב והדבש - Bear & Honey

A small Rosh HaShana maze game for a 4th grade class project. Guide the bear
through the forest to the honey pot, answering Hebrew questions about the
holiday along the way.

Plain HTML, CSS and JavaScript. No frameworks, no build step, no dependencies.

---

## Playing it

**Online:** open the published link (see _Publishing_ below).

**On your own computer:** you cannot just double-click `index.html`. Browsers
block reading `questions.md` from the local disk, and the game will show a
Hebrew error explaining this. Start a tiny local server instead:

```bash
cd bear-honey-game
python3 -m http.server 8000
```

Then open <http://localhost:8000> in your browser. Press `Ctrl+C` in the
terminal to stop it.

### Controls

| Key                   | Action        |
| --------------------- | ------------- |
| Arrow keys, or W A S D | Move the bear |
| Enter                 | Continue after a question, or restart from the win screen |

### The rules

- Step on a ❓ tile and a Rosh HaShana question appears.
- A correct answer earns **1 coin** 🪙.
- A wrong answer earns nothing, but the correct answer is shown.
- **💡 רמז** costs 1 coin and reveals that question's hint.
- **✂️ חצי חצי** costs 2 coins and removes two wrong answers.
- The honey pot needs **3 coins** to open.
- Arrive short on coins and the pot asks bonus questions until you can
  afford it, so the game can always be finished. Clues are disabled on
  bonus questions.

---

## Editing the questions

All game content lives in **`questions.md`**. Open it in any text editor.
Each question looks like this:

```markdown
## באיזה חודש עברי חל ראש השנה?

- [ ] בניסן
- [x] בתשרי
- [ ] בכסלו
- [ ] באלול

רמז: זהו החודש הראשון בשנה העברית, מיד אחרי חודש אלול.
```

Rules:

- `##` starts a new question.
- Each answer is a line starting with `- [ ]`.
- The correct answer is marked `- [x]`. **Exactly one per question.**
- A line starting with `רמז:` is the hint. Optional, but the hint button
  is useless without it.
- Four answers per question is best, otherwise the 50:50 clue has nothing
  to remove.

To add a question, copy a whole block and change the text. To remove one,
delete the block. Refresh the browser to see the change.

After editing, check the file:

```bash
python3 check_questions.py
```

It lists every question it found and refuses anything malformed. If this
passes, the game will load the file.

---

## Editing the maze

The maze lives in the `MAZE` array near the top of `game.js`:

```
#  wall (tree)      .  floor
S  bear start       H  honey pot
?  question trigger
```

**The same maze is also in `check_maze.py`. Change both.** After editing:

```bash
python3 check_maze.py
```

It verifies the maze is rectangular, fully enclosed, that the honey pot is
reachable, and that no floor tile is walled off.

### Other things you might want to change

| What | Where |
| ---- | ----- |
| Coins needed to open the pot | `COINS_TO_OPEN_POT` in `game.js` |
| Clue prices | `CLUE_COST` in `game.js` |
| Bear, honey, tree emoji | `EMOJI` in `game.js` |
| Colours and sizes | `:root` variables at the top of `style.css` |

---

## Publishing it for free

GitHub Pages gives a permanent public link, which the QR code points at.

1. Create a **public** repository on GitHub (e.g. `bear-honey-game`).
2. Push this folder to it:

   ```bash
   git remote add origin https://github.com/<your-username>/bear-honey-game.git
   git push -u origin main
   ```

3. On GitHub: **Settings → Pages → Source: Deploy from a branch**, pick
   `main` and `/ (root)`, then **Save**.
4. Wait a minute. The game is live at:

   ```
   https://<your-username>.github.io/bear-honey-game/
   ```

GitHub Pages requires a public repo on the free plan. There is nothing
sensitive here, so that is fine.

### Making the QR code

```bash
brew install qrencode
qrencode -o game-qr.png -s 10 "https://<your-username>.github.io/bear-honey-game/"
```

Use `-t SVG -o game-qr.svg` instead for a version that scales to any size
without blurring, which is better for printing on a poster.

---

## Files

| File | Purpose |
| ---- | ------- |
| `index.html` | Page structure. Hebrew, right-to-left. |
| `style.css` | All styling and animations. |
| `game.js` | Maze, movement, questions, coins, win screen. |
| `questions.md` | **The game content. Edit this.** |
| `check_questions.py` | Validates `questions.md`. |
| `check_maze.py` | Validates the maze layout. |
| `run_tests.sh` | Runs every check below. |
| `test_dom.js` | Shared browser stub for the Node tests. |
| `wiring_test.py` | Checks the HTML, CSS and JS agree. |
| `browser_check.js` | Inspects the page in real Safari. |
| `*_test.js`, `parity_test.py` | Automated tests. |

The test files are not needed to play or publish the game. They exist so a
change to the maze or the questions cannot silently break it.

---

## Running the tests

```bash
./run_tests.sh
```

Ten suites: HTML/CSS/JS wiring, maze solvability, question file validity,
agreement between the JavaScript and Python parsers, parsing edge cases,
error screens, the question popup, the endgame and restart, rendering and
movement, and a full end-to-end playthrough.

`browser_check.js` additionally inspects the page in real Safari. It needs
Safari > Settings > Advanced > "Show Develop menu", then
Develop > "Allow JavaScript from Apple Events":

```bash
node browser_check.js
```

---

## Notes

- `index.html` sets `dir="rtl"` for Hebrew, but the maze element is
  deliberately `dir="ltr"`. Without that, the grid mirrors and the right
  arrow key moves the bear left. **Do not remove it.**
- Movement is matched on physical key position (`event.code`), not the
  character produced, so W A S D still work on a Hebrew keyboard layout.
