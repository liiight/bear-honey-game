"""Validate the maze generator in game.js.

The maze is built fresh on every page load, so there is no single layout to
check. This generates many mazes through Node and asserts that every one of
them is playable: correct size, solid border, honey pot reachable, no walled
off pockets, and question tiles that sit on open floor.

Run: python3 check_maze.py [count]
"""

import json
import subprocess
import sys
from collections import deque
from pathlib import Path

HERE = Path(__file__).parent
DEFAULT_RUNS = 300

# Generates mazes with the real game code and prints them as JSON.
HARNESS = r"""
const fs = require("fs");
function makeEl() {
  const e = {
    className: "", textContent: "", innerHTML: "", hidden: false,
    disabled: false, children: [], offsetWidth: 0, parentElement: null,
    style: { setProperty() {} },
    classList: { add() {}, remove() {}, contains() { return false; } },
    appendChild(c) { this.children.push(c); return c; },
    replaceChildren() { this.children = []; },
    addEventListener() {}, focus() {},
  };
  return e;
}
global.document = {
  getElementById: () => makeEl(),
  createElement: makeEl,
  createDocumentFragment: makeEl,
  addEventListener() {},
};
global.window = { addEventListener() {} };
global.fetch = async () => { throw new Error("offline"); };

const api = eval(
  fs.readFileSync(process.argv[2], "utf8") +
    "\n;({ installMaze, MAZE_CONFIG });"
);

const runs = Number(process.argv[3]);
const out = [];
for (let i = 0; i < runs; i++) out.push(api.installMaze());
console.log(JSON.stringify({ config: api.MAZE_CONFIG, mazes: out }));
"""

WALL = "#"


def generate(runs):
    harness = HERE / "_gen_harness.js"
    harness.write_text(HARNESS, encoding="utf-8")
    try:
        proc = subprocess.run(
            ["node", str(harness), str(HERE / "game.js"), str(runs)],
            capture_output=True,
            text=True,
            check=True,
        )
        return json.loads(proc.stdout)
    finally:
        harness.unlink(missing_ok=True)


def inspect(maze):
    """Return (problems, stats) for one maze."""
    problems = []
    rows = len(maze)
    cols = len(maze[0])

    for i, row in enumerate(maze):
        if len(row) != cols:
            problems.append(f"row {i} is {len(row)} wide, expected {cols}")

    allowed = set("#.SH?")
    bad = {ch for row in maze for ch in row} - allowed
    if bad:
        problems.append(f"unexpected characters: {sorted(bad)}")

    def find_all(ch):
        return [
            (r, c)
            for r, row in enumerate(maze)
            for c, v in enumerate(row)
            if v == ch
        ]

    starts = find_all("S")
    honeys = find_all("H")
    triggers = find_all("?")

    if len(starts) != 1:
        problems.append(f"expected 1 start, found {len(starts)}")
    if len(honeys) != 1:
        problems.append(f"expected 1 honey pot, found {len(honeys)}")

    # Border must be solid.
    for c in range(cols):
        if maze[0][c] != WALL or maze[rows - 1][c] != WALL:
            problems.append("top or bottom border is open")
            break
    for r in range(rows):
        if maze[r][0] != WALL or maze[r][cols - 1] != WALL:
            problems.append("left or right border is open")
            break

    if problems:
        return problems, {}

    start = starts[0]
    honey = honeys[0]

    prev = {start: None}
    queue = deque([start])
    while queue:
        r, c = queue.popleft()
        for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nr, nc = r + dr, c + dc
            if 0 <= nr < rows and 0 <= nc < cols:
                if maze[nr][nc] != WALL and (nr, nc) not in prev:
                    prev[(nr, nc)] = (r, c)
                    queue.append((nr, nc))

    if honey not in prev:
        problems.append("honey pot is unreachable")

    unreachable = [t for t in triggers if t not in prev]
    if unreachable:
        problems.append(f"{len(unreachable)} unreachable question tiles")

    open_cells = sum(1 for row in maze for v in row if v != WALL)
    if len(prev) != open_cells:
        problems.append(f"{open_cells - len(prev)} walled off floor tiles")

    if start in triggers or honey in triggers:
        problems.append("a question tile overlaps the bear or the honey pot")

    path_len = 0
    if honey in prev:
        node = honey
        while node:
            path_len += 1
            node = prev[node]

    stats = {
        "rows": rows,
        "cols": cols,
        "triggers": len(triggers),
        "path": path_len,
        "open": open_cells,
        "on_path": count_on_path(prev, honey, triggers),
    }
    return problems, stats


def count_on_path(prev, honey, triggers):
    path = set()
    node = honey
    while node:
        path.add(node)
        node = prev.get(node)
    return sum(1 for t in triggers if t in path)


def main():
    runs = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_RUNS

    data = generate(runs)
    config = data["config"]
    mazes = data["mazes"]

    expected_rows = config["cellRows"] * 2 + 1
    expected_cols = config["cellCols"] * 2 + 1

    print(f"generated {len(mazes)} mazes at {expected_rows} x {expected_cols}")

    failures = 0
    paths = []
    on_path = []

    for i, maze in enumerate(mazes):
        problems, stats = inspect(maze)
        if problems:
            failures += 1
            print(f"\nFAIL maze {i}:")
            for p in problems:
                print(f"  - {p}")
            if failures == 1:
                print("\n".join(maze))
            continue

        if stats["rows"] != expected_rows or stats["cols"] != expected_cols:
            failures += 1
            print(f"FAIL maze {i}: wrong size {stats['rows']}x{stats['cols']}")
            continue

        if stats["triggers"] != config["triggers"]:
            failures += 1
            print(
                f"FAIL maze {i}: {stats['triggers']} question tiles, "
                f"expected {config['triggers']}"
            )
            continue

        paths.append(stats["path"])
        on_path.append(stats["on_path"])

    if failures:
        print(f"\n{failures} of {len(mazes)} mazes are unplayable")
        return 1

    print(f"shortest path : min {min(paths)}, avg {sum(paths) // len(paths)}, max {max(paths)}")
    print(f"triggers on the direct route: avg {sum(on_path) / len(on_path):.1f} of {config['triggers']}")

    # Every maze must be distinct, otherwise "random" is not random.
    unique = len({tuple(m) for m in mazes})
    print(f"unique layouts: {unique} of {len(mazes)}")
    if unique < len(mazes) * 0.99:
        print("FAIL: the generator repeats itself")
        return 1

    print("\nOK: every generated maze is playable")
    return 0


if __name__ == "__main__":
    sys.exit(main())
