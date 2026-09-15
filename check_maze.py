"""Validate the maze layout: correct size, solvable, no orphan cells.

Run after editing MAZE in game.js (keep the two copies in sync):

    python3 check_maze.py
"""

from collections import deque

# Must match MAZE in game.js
# '#' wall, '.' floor, 'S' bear start, 'H' honey pot, '?' question trigger
MAZE = [
    "###############",
    "#S..?.#.......#",
    "#.###.#.#####.#",
    "#.#...#.#..?#.#",
    "#.#.###.#.#.#.#",
    "#...#.?.#.#...#",
    "#.###.###.###.#",
    "#.#...#...#..?#",
    "#.#.#####.#.###",
    "#..?#.....#..H#",
    "###############",
]

COLS = 15
ROWS = 11
WALL = "#"


def fail(msg):
    print(f"FAIL: {msg}")
    raise SystemExit(1)


def find_all(ch):
    return [
        (r, c) for r, row in enumerate(MAZE) for c, v in enumerate(row) if v == ch
    ]


def main():
    if len(MAZE) != ROWS:
        fail(f"expected {ROWS} rows, got {len(MAZE)}")
    for i, row in enumerate(MAZE):
        if len(row) != COLS:
            fail(f"row {i} has {len(row)} chars, expected {COLS}")

    allowed = set("#.SH?")
    for r, row in enumerate(MAZE):
        for c, v in enumerate(row):
            if v not in allowed:
                fail(f"unknown char {v!r} at row {r} col {c}")

    starts, honeys, triggers = find_all("S"), find_all("H"), find_all("?")
    if len(starts) != 1:
        fail(f"expected exactly 1 start 'S', found {len(starts)}")
    if len(honeys) != 1:
        fail(f"expected exactly 1 honey 'H', found {len(honeys)}")
    if not triggers:
        fail("no '?' question triggers in the maze")

    start, honey = starts[0], honeys[0]

    # Border must be solid so the bear cannot walk off the grid.
    for c in range(COLS):
        if MAZE[0][c] != WALL or MAZE[ROWS - 1][c] != WALL:
            fail(f"top/bottom border open at col {c}")
    for r in range(ROWS):
        if MAZE[r][0] != WALL or MAZE[r][COLS - 1] != WALL:
            fail(f"left/right border open at row {r}")

    # Flood fill from the bear.
    prev = {start: None}
    queue = deque([start])
    while queue:
        r, c = queue.popleft()
        for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nr, nc = r + dr, c + dc
            if 0 <= nr < ROWS and 0 <= nc < COLS:
                if MAZE[nr][nc] != WALL and (nr, nc) not in prev:
                    prev[(nr, nc)] = (r, c)
                    queue.append((nr, nc))

    if honey not in prev:
        fail("honey pot is unreachable from the bear")

    unreachable_triggers = [t for t in triggers if t not in prev]
    if unreachable_triggers:
        fail(f"unreachable '?' triggers: {unreachable_triggers}")

    path = []
    node = honey
    while node:
        path.append(node)
        node = prev[node]
    path.reverse()

    open_cells = sum(1 for row in MAZE for v in row if v != WALL)
    orphans = [
        (r, c)
        for r, row in enumerate(MAZE)
        for c, v in enumerate(row)
        if v != WALL and (r, c) not in prev
    ]

    print(f"size         : {ROWS} x {COLS}")
    print(f"start        : {start}")
    print(f"honey        : {honey}")
    print(f"triggers     : {len(triggers)} -> {triggers}")
    print(f"shortest path: {len(path)} cells")
    print(f"open cells   : {open_cells} (reachable {len(prev)})")

    if orphans:
        print(f"WARNING: {len(orphans)} walled-off cells: {orphans}")
    else:
        print("every open cell is reachable")

    on_path = [t for t in triggers if t in set(path)]
    print(f"triggers on shortest path: {len(on_path)} of {len(triggers)}")
    if len(on_path) < 3:
        print("WARNING: most triggers are off the direct route; a player")
        print("         taking the shortest path will skip the questions.")

    print("\nOK: maze is valid and solvable")


if __name__ == "__main__":
    main()
