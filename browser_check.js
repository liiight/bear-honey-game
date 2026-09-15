/* Paste-free browser check.
   Loads the game in real Safari via AppleScript and inspects the live DOM,
   so the Node tests are backed up by an actual browser.

   Requires Safari > Develop > "Allow JavaScript from Apple Events".
   Run: node browser_check.js [url]
*/

const { execFileSync } = require("child_process");

const URL = process.argv[2] || "http://localhost:8731/index.html";

const PROBE = `
(function () {
  var cells = Array.prototype.slice.call(document.querySelectorAll('.cell'));
  var text = function (t) {
    return cells.filter(function (c) { return c.textContent === t; }).length;
  };
  var maze = document.getElementById('maze');
  var style = getComputedStyle(maze);
  return JSON.stringify({
    cells: cells.length,
    bear: text('\\uD83D\\uDC3B'),
    honey: text('\\uD83C\\uDF6F'),
    triggers: text('\\u2753'),
    walls: document.querySelectorAll('.cell.wall').length,
    floors: document.querySelectorAll('.cell.floor').length,
    errorPanel: document.querySelector('.error-panel') ? 1 : 0,
    htmlDir: document.documentElement.getAttribute('dir'),
    mazeDir: maze.getAttribute('dir'),
    computedDir: style.direction,
    gridCols: (style.gridTemplateColumns || '').split(' ').length,
    overlayHidden: document.getElementById('overlay').hidden ? 1 : 0,
    winHidden: document.getElementById('win-overlay').hidden ? 1 : 0,
    coins: document.getElementById('coin-count').textContent,
    title: document.title
  });
})()
`;

function run(js) {
  const script = `
    tell application "Safari"
      set r to do JavaScript ${JSON.stringify(js)} in front document
      return r as string
    end tell
  `;
  return execFileSync("osascript", ["-e", script], { encoding: "utf8" }).trim();
}

let failures = 0;
function check(label, actual, expected) {
  const ok = String(actual) === String(expected);
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}: ${actual}${ok ? "" : ` (expected ${expected})`}`,
  );
}

try {
  execFileSync("osascript", [
    "-e",
    `tell application "Safari"
       if (count of documents) = 0 then make new document
       set URL of front document to ${JSON.stringify(URL)}
     end tell`,
  ]);
} catch (e) {
  console.error("Could not drive Safari:", e.message);
  process.exit(1);
}

// Give the page time to fetch questions.md and render.
const waitUntil = Date.now() + 6000;
let raw = "";
(function poll() {
  while (Date.now() < waitUntil) {
    try {
      raw = run(PROBE);
      if (raw && raw !== "missing value") break;
    } catch (e) {
      /* page still loading */
    }
    execFileSync("sleep", ["0.4"]);
  }
})();

if (!raw || raw === "missing value") {
  console.error(
    "No response from Safari. Enable: Safari > Settings > Advanced >\n" +
      '"Show Develop menu", then Develop > "Allow JavaScript from Apple Events".',
  );
  process.exit(1);
}

const d = JSON.parse(raw);
console.log(`checked ${URL}\n`);

check("page title", d.title, "הדוב והדבש - משחק ראש השנה");
check("no error panel", d.errorPanel, 0);
check("165 cells rendered", d.cells, 165);
check("one bear", d.bear, 1);
check("one honey pot", d.honey, 1);
check("five question tiles", d.triggers, 5);
check("95 walls", d.walls, 95);
check("70 floors", d.floors, 70);
check("page is RTL", d.htmlDir, "rtl");
check("maze overrides to LTR", d.mazeDir, "ltr");
check("maze computes as LTR (not mirrored)", d.computedDir, "ltr");
check("grid has 15 columns", d.gridCols, 15);
check("question popup hidden", d.overlayHidden, 1);
check("win screen hidden", d.winHidden, 1);
check("coins start at zero", d.coins, "0");

console.log(
  failures === 0
    ? "\nBrowser render verified"
    : `\n${failures} check(s) failed in the browser`,
);
process.exit(failures === 0 ? 0 : 1);
