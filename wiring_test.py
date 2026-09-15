"""Check index.html, style.css and game.js agree with each other.

The Node tests use a stubbed DOM, so they cannot catch a typo in an element
id or a CSS class that is applied but never styled. This reads the real
files and cross-references them.

Run: python3 wiring_test.py
"""

import re
import sys
from pathlib import Path

HERE = Path(__file__).parent

# CSS classes game.js adds at runtime that must exist in the stylesheet.
RUNTIME_CLASSES = [
    "cell",
    "wall",
    "floor",
    "bear",
    "honey",
    "trigger",
    "alt",
    "bump-wall",
    "error-panel",
    "error-footer",
    "overlay",
    "dialog",
    "answer-btn",
    "correct",
    "wrong",
    "eliminated",
    "faded",
    "feedback",
    "good",
    "bad",
    "hint",
    "clue-btn",
    "continue-btn",
    "win-dialog",
    "scoreboard",
    "dialog-intro",
    "bump",
]

failures = []


def check(label, ok, detail=""):
    print(f"{'PASS' if ok else 'FAIL'}  {label}{'' if ok else f' -> {detail}'}")
    if not ok:
        failures.append(label)


def main():
    html = (HERE / "index.html").read_text(encoding="utf-8")
    css = (HERE / "style.css").read_text(encoding="utf-8")
    js = (HERE / "game.js").read_text(encoding="utf-8")

    # 1. Every element game.js looks up must exist in the markup.
    js_ids = set(re.findall(r'getElementById\("([^"]+)"\)', js))
    html_ids = set(re.findall(r'id="([^"]+)"', html))
    missing = sorted(js_ids - html_ids)
    check(
        f"all {len(js_ids)} getElementById targets exist in index.html",
        not missing,
        f"missing: {missing}",
    )

    # 2. Ids defined but never used are dead markup.
    unused = sorted(html_ids - js_ids)
    check("no unused ids in index.html", not unused, f"unused: {unused}")

    # 3. Every runtime class must be styled.
    css_classes = set(re.findall(r"\.([a-zA-Z][\w-]*)", css))
    unstyled = [c for c in RUNTIME_CLASSES if c not in css_classes]
    check("every runtime CSS class is styled", not unstyled, f"unstyled: {unstyled}")

    # 4. The RTL trap: page is RTL, maze must be forced LTR.
    check("document is RTL", 'dir="rtl"' in html)
    maze_tag = re.search(r"<div[^>]*id=\"maze\"[^>]*>", html)
    check(
        "maze element overrides to LTR",
        bool(maze_tag) and 'dir="ltr"' in maze_tag.group(0),
        "the maze would mirror and reverse the arrow keys",
    )

    # 5. Assets are linked.
    check("style.css linked", 'href="style.css"' in html)
    check("game.js linked", 'src="game.js"' in html)

    # 6. The two maze copies must match.
    def maze_of(text, var):
        block = re.search(var + r"\s*=\s*\[(.*?)\]", text, re.S)
        return re.findall(r'"([^"]*)"', block.group(1)) if block else []

    js_maze = maze_of(js, "MAZE")
    py_maze = maze_of((HERE / "check_maze.py").read_text(encoding="utf-8"), "MAZE")
    check(
        "game.js and check_maze.py hold the same maze",
        js_maze == py_maze and js_maze,
        "edit both copies together",
    )

    # 7. Movement must key off physical codes, not characters, or WASD
    #    breaks on a Hebrew keyboard layout.
    check(
        "movement uses event.code, not event.key",
        "MOVE_KEYS[event.code]" in js,
        "WASD would stop working on a Hebrew layout",
    )

    print()
    if failures:
        print(f"{len(failures)} wiring problem(s)")
        return 1
    print("HTML, CSS and JS are consistent")
    return 0


if __name__ == "__main__":
    sys.exit(main())
