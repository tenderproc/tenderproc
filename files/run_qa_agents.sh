#!/usr/bin/env bash
#
# run_qa_agents.sh
# Spawns 10 parallel Claude Code agents to QA-test tenderproc.com.
# Each agent gets a distinct area of the app, drives a real browser via
# Playwright, and writes a structured markdown report. A final step merges
# all reports into one summary.
#
# PREREQUISITES (run once):
#   npm install -g @anthropic-ai/claude-code   # Claude Code CLI
#   npm install -D playwright && npx playwright install chromium
#
# USAGE:
#   chmod +x run_qa_agents.sh
#   ./run_qa_agents.sh
#
# Reports land in ./reports/agent-<N>.md, and a combined ./reports/SUMMARY.md
# is produced at the end.

set -euo pipefail

BASE_URL="${BASE_URL:-https://www.tenderproc.com}"
OUT_DIR="./reports"
mkdir -p "$OUT_DIR"

# One test email per agent so signup flows don't collide with each other.
# All use +tags on one inbox — swap in your own domain/inbox before running.
TEST_EMAIL_DOMAIN="${TEST_EMAIL_DOMAIN:-yourtestinbox.com}"

# --- Agent task definitions -------------------------------------------------
# Each entry: "short-name|focus area description"
TASKS=(
  "nav|Test every top-level navigation link and footer link. Confirm each loads without a 404, error page, or console error. Record broken/dead links."
  "signup|Test the sign-up flow end to end using test+signup-agent@${TEST_EMAIL_DOMAIN}. Try valid input, then invalid input (bad email format, weak/empty password, missing required fields) and confirm validation messages are correct and clear."
  "login-logout|Test login with valid and invalid credentials (wrong password, non-existent email, empty fields). Then test logout, and confirm that after logout, protected pages redirect to login rather than staying accessible."
  "language-switcher|Test the language switcher (EN/FR/NL or whatever is present). Confirm every language loads properly, text actually changes, and the choice persists on page reload/navigation."
  "buttons-cta|Click every visible button and call-to-action on the homepage and pricing page (Sign up free, Log in, Pricing tiers, any 'Learn more'/'Contact' buttons). Confirm each does what its label implies and none are dead/no-op."
  "forms|Find every form on the site (contact, newsletter signup, search/filter on tenders, profile/settings if reachable) and submit each with valid data, then with invalid/empty data. Record validation behavior and confirm no form silently fails."
  "responsive|Test the site at three viewport sizes: 1440x900 (desktop), 768x1024 (tablet), 390x844 (mobile). For each, check the nav/menu collapses appropriately and no layout overlaps or cut-off text/buttons occur."
  "accessibility|Check basic accessibility: keyboard-only navigation (Tab through interactive elements, confirm visible focus states), image alt text presence, and heading structure (h1/h2 hierarchy) on the homepage and one inner page."
  "performance-console|Load the homepage, pricing page, and one tender-listing page (if reachable without login). Record any browser console errors/warnings, failed network requests (4xx/5xx), and rough page load feel (fast/slow)."
  "search-filter|If a tender search/filter/list view is reachable, test searching, filtering, sorting, and pagination (if present). Confirm results update correctly and empty/no-result states are handled gracefully."
)

echo "Starting ${#TASKS[@]} QA agents against ${BASE_URL} ..."
echo "Reports -> ${OUT_DIR}/"
echo

PIDS=()

i=0
for task in "${TASKS[@]}"; do
  i=$((i+1))
  name="${task%%|*}"
  focus="${task#*|}"
  report_file="${OUT_DIR}/agent-${i}-${name}.md"

  prompt=$(cat <<EOF
You are QA Agent #${i} testing the live web app at ${BASE_URL}.

YOUR FOCUS AREA: ${focus}

RULES:
- Use Playwright (already installed) via a Node.js script you write and run
  with bash, to drive a real headless Chromium browser. Do not just fetch
  HTML — actually click, type, and navigate like a user would.
- Never enter real payment card details or complete a real purchase.
- Never sign up with anyone else's real email. Only use the test address(es)
  named in your focus area above, or clearly fake test data otherwise.
- If a flow requires an OTP/email confirmation you can't access, note that
  as a limitation in your report rather than getting stuck.
- Work autonomously. Don't ask me questions — make reasonable judgment calls
  and note assumptions in your report.

OUTPUT: Write your findings to ${report_file} as markdown with this structure:
  # Agent ${i}: ${name}
  ## Summary (2-3 sentences: overall health of this area)
  ## Steps taken
  ## Bugs / issues found (severity: critical/major/minor, with repro steps)
  ## Things that worked well
  ## Could not test (and why)

Be specific: include exact button labels, URLs, and error text you saw.
EOF
)

  echo "[agent ${i}: ${name}] launching..."
  claude -p "$prompt" \
    --output-format text \
    --allowedTools "Bash,Read,Write" \
    > "${OUT_DIR}/agent-${i}-${name}.log" 2>&1 &

  PIDS+=($!)
done

echo
echo "All ${#PIDS[@]} agents launched. Waiting for completion..."
FAILED=0
for pid in "${PIDS[@]}"; do
  if ! wait "$pid"; then
    FAILED=$((FAILED+1))
  fi
done

echo
if [ "$FAILED" -gt 0 ]; then
  echo "${FAILED} agent(s) exited with a non-zero status — check their .log files."
else
  echo "All agents finished."
fi

# --- Merge into one summary --------------------------------------------------
echo "Merging reports into ${OUT_DIR}/SUMMARY.md ..."
{
  echo "# TenderProc QA Run — Combined Summary"
  echo
  echo "Generated: $(date -u +"%Y-%m-%d %H:%M UTC")"
  echo "Target: ${BASE_URL}"
  echo
  for f in "${OUT_DIR}"/agent-*.md; do
    [ -f "$f" ] || continue
    echo "---"
    echo
    cat "$f"
    echo
  done
} > "${OUT_DIR}/SUMMARY.md"

echo "Done. See ${OUT_DIR}/SUMMARY.md for the combined report."
