# TenderProc QA — 10 parallel Claude Code agents

Spawns 10 Claude Code agents in parallel, each driving a real headless
browser (Playwright) against tenderproc.com, covering: navigation, signup,
login/logout, language switcher, buttons/CTAs, forms, responsive layout,
basic accessibility, console/network errors, and search/filter.

## Setup (one time)

```bash
npm install -g @anthropic-ai/claude-code
npm install -D playwright
npx playwright install chromium
```

Make sure `claude` is authenticated (`claude auth login` or your usual setup).

## Before you run it

- Edit `TEST_EMAIL_DOMAIN` in `run_qa_agents.sh` to an inbox you actually
  control (or one that accepts `+tag` addresses), so the signup agent's
  emails land somewhere you can check for confirmation links.
- This hits the **live production site**. If TenderProc has a staging URL,
  set `BASE_URL` to that instead:
  ```bash
  BASE_URL="https://staging.tenderproc.com" ./run_qa_agents.sh
  ```
- The agents are instructed never to enter real card details or complete a
  real purchase, and to only sign up with the test address you provide —
  but review the prompts in the script before running against production.

## Run it

```bash
chmod +x run_qa_agents.sh
./run_qa_agents.sh
```

Each agent runs independently and writes:
- `reports/agent-N-<name>.md` — its structured findings
- `reports/agent-N-<name>.log` — raw Claude Code output (useful for debugging
  if an agent errors out)

When all 10 finish, the script merges everything into `reports/SUMMARY.md`.

## Notes

- Runtime depends on site complexity — expect several minutes since all 10
  run concurrently but each drives a real browser.
- If an agent can't complete something (e.g. an email OTP it can't access),
  it's instructed to note that as a limitation rather than get stuck.
- Re-running will overwrite previous reports with the same names — copy out
  `reports/` first if you want to keep a history across runs.
