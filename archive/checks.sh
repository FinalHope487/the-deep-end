#!/usr/bin/env bash
set -euo pipefail

# Resident guard final acceptance.
# Run from the repository root in Git Bash.
# Do not modify production sources or user files.

cd "$(git rev-parse --show-toplevel)"

BASE="de4f52e"

echo "== Repository =="
git rev-parse HEAD
git status --short

echo "== Required files =="

resident_unit=(
  tests/unit/build.test.mjs
  tests/unit/chunks.test.mjs
  tests/unit/world.test.mjs
  tests/unit/save.test.mjs
  tests/unit/gen2.test.mjs
  tests/unit/player.test.mjs
  tests/unit/gen2-s2-client.test.mjs
)

for f in "${resident_unit[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "FAIL: missing unit file: $f" >&2
    exit 1
  fi
done

test -f tests/unit/mesh-helper.mjs
test -f tests/e2e/core-release.spec.js

test ! -e tests/e2e/global-setup.js
test ! -e tests/e2e/helpers.js
test ! -e tests/unit/slow.mjs
test ! -e tests/unit/reach.mjs
test ! -e tests/slow.env

unit_files="$(
  find tests/unit -maxdepth 1 -type f -name '*.test.mjs' |
    wc -l |
    tr -d '[:space:]'
)"

browser_files="$(
  find tests/e2e -maxdepth 1 -type f -name '*.spec.js' |
    wc -l |
    tr -d '[:space:]'
)"

echo "Unit files: $unit_files"
echo "Browser files: $browser_files"

test "$unit_files" -eq 7
test "$browser_files" -eq 1

echo "== Deleted runtime dependencies =="

deleted_pattern='gen2-legacy-report|gen2-passage-oracle|reach\.mjs|slow\.mjs|slow\.env|gen2-district-baseline\.json|capture-gen2-district-baseline|global-setup\.js|tests/e2e/helpers\.js'

set +e
rg -n "$deleted_pattern" \
  js tools tests package.json playwright.config.js
rg_status=$?
set -e

if (( rg_status == 0 )); then
  echo "FAIL: deleted runtime dependency remains" >&2
  exit 1
fi

if (( rg_status != 1 )); then
  echo "FAIL: dependency search could not complete" >&2
  exit 1
fi

echo "No deleted runtime dependency found."

echo "== Playwright inventory =="

list_output="$(npx playwright test --list 2>&1)"
printf '%s\n' "$list_output"

if ! printf '%s\n' "$list_output" |
  grep -Eq 'Total: 1 test in 1 file'; then
  echo "FAIL: expected exactly one browser test" >&2
  exit 1
fi

echo "== Production source =="

git diff --exit-code "$BASE" HEAD -- \
  js/ \
  tools/build.mjs \
  tools/serve.mjs

git diff --exit-code -- \
  js/ \
  tools/build.mjs \
  tools/serve.mjs

git diff --cached --exit-code -- \
  js/ \
  tools/build.mjs \
  tools/serve.mjs

echo "== Protected user files =="

if [[ -z "${C2C_PROTECTED_HASHES:-}" ]]; then
  echo "FAIL: C2C_PROTECTED_HASHES is not set" >&2
  exit 1
fi

if [[ ! -f "$C2C_PROTECTED_HASHES" ]]; then
  echo "FAIL: protected hash file not found" >&2
  exit 1
fi

sha256sum -c "$C2C_PROTECTED_HASHES"

protected_paths=(
  AGENTS.md
  dist/index.html
  .gitignore
  claude-decisions.json
  docs/handoff/T6-link-by-distance.md
  docs/handoff/picture-scenes-plan-summary.md
)

staged_names="$(git diff --cached --name-only)"

for path in "${protected_paths[@]}"; do
  if printf '%s\n' "$staged_names" | grep -Fxq "$path"; then
    echo "FAIL: protected user file is staged: $path" >&2
    exit 1
  fi
done

# The new user file must remain untracked.
if [[ ! -f docs/handoff/picture-scenes-plan-summary.md ]]; then
  echo "FAIL: user handoff file is missing" >&2
  exit 1
fi

if git ls-files --error-unmatch \
  docs/handoff/picture-scenes-plan-summary.md \
  >/dev/null 2>&1; then
  echo "FAIL: user handoff file became tracked" >&2
  exit 1
fi

echo "== Temporary release directories =="

check_release_cleanup() {
  if [[ ! -d work ]]; then
    return 0
  fi

  local leftovers

  leftovers="$(
    find work \
      -mindepth 1 \
      -maxdepth 1 \
      -type d \
      -name '.resident-release-*' \
      -print
  )"

  if [[ -n "$leftovers" ]]; then
    printf '%s\n' "$leftovers"
    echo "FAIL: resident release output remains" >&2
    return 1
  fi

  echo "No resident release directories remain."
}

check_release_cleanup

echo "== Diff checks =="

git diff --check
git diff --cached --check

echo "== Test results =="

LOG_DIR="$(mktemp -d)"

cleanup_logs() {
  rm -rf -- "$LOG_DIR"
}

trap cleanup_logs EXIT

now_ms() {
  node -e 'process.stdout.write(String(Date.now()))'
}

run_timed() {
  local name="$1"
  local limit="$2"
  local slug="${name//:/-}"
  local log="$LOG_DIR/$slug.log"

  local start
  local end
  local elapsed_ms

  start="$(now_ms)"

  if ! npm run "$name" 2>&1 | tee "$log"; then
    echo "FAIL: $name returned a nonzero exit" >&2
    exit 1
  fi

  end="$(now_ms)"
  elapsed_ms=$((end - start))

  echo "$name wall-clock: ${elapsed_ms} ms"
  printf '%s\n' "$elapsed_ms" > "$LOG_DIR/$slug.ms"

  if (( elapsed_ms > limit * 1000 )); then
    echo "FAIL: $name exceeds ${limit} seconds" >&2
    exit 1
  fi
}

# Node 24 can use TAP:
#   # tests 9
#   # pass 9
#
# It can also use the spec reporter:
#   ℹ tests 9
#   ℹ pass 9
#
# Both formats are accepted. CRLF is normalized.

check_node_summary() {
  local input="$1"
  local clean="$LOG_DIR/normalized.log"

  tr -d '\r' < "$input" > "$clean"

  local key
  local expected

  for key in tests pass fail skipped; do
    case "$key" in
      tests|pass) expected=9 ;;
      fail|skipped) expected=0 ;;
    esac

    if ! grep -Eq \
      "(^#|^ℹ)[[:space:]]+${key}[[:space:]]+${expected}[[:space:]]*$" \
      "$clean"; then
      echo "FAIL: Node summary $key != $expected" >&2
      cat "$clean" >&2
      exit 1
    fi
  done
}

check_browser_summary() {
  local input="$1"

  if ! grep -Eq '1 passed' "$input"; then
    echo "FAIL: expected one passed browser test" >&2
    exit 1
  fi

  if grep -Eq \
    '[1-9][0-9]* failed|[1-9][0-9]* skipped' \
    "$input"; then
    echo "FAIL: browser suite has failures or skips" >&2
    exit 1
  fi
}

run_timed test:unit 15
check_node_summary "$LOG_DIR/test-unit.log"

run_timed test:e2e 35
check_browser_summary "$LOG_DIR/test-e2e.log"

check_release_cleanup

run_timed test:fast 60
check_node_summary "$LOG_DIR/test-fast.log"
check_browser_summary "$LOG_DIR/test-fast.log"

check_release_cleanup

echo "== Final Git status =="
git status --short

echo "RESIDENT_GUARDS_FINAL: PASS"
