#!/bin/bash
# Run every check for the game. Usage: ./run_tests.sh
cd "$(dirname "$0")" || exit 1

failed=0

run() {
  printf '\n=== %s ===\n' "$1"
  shift
  if "$@"; then
    return
  fi
  failed=$((failed + 1))
  printf '^^^ FAILED\n'
}

run "html/css/js wiring" python3 wiring_test.py
run "maze layout"      python3 check_maze.py
run "questions.md"     python3 check_questions.py
run "parser parity"    python3 parity_test.py
run "parser"           node parser_test.js
run "error panels"     node error_test.js
run "question popup"   node popup_test.js
run "endgame + restart" node endgame_test.js
run "render + movement" node smoke_test.js
run "end to end walk"  node walk_test.js

printf '\n----------------------------------------\n'
if [ "$failed" -eq 0 ]; then
  printf 'All test suites passed\n'
  exit 0
fi
printf '%d test suite(s) failed\n' "$failed"
exit 1
