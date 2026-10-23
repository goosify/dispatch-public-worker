# Dispatch community worker

A bounded Skool collector that submits source checkpoints and event proposals to an authenticated Dispatch backend. This public repository contains generic code only; account configuration and credentials are GitHub Actions secrets.

## Configuration

Set DISPATCH_URL (HTTPS origin), SKOOL_MONITOR_SECRET (scoped backend credential), SKOOL_STORAGE_STATE (dedicated session), GROQ_API_KEY, and WORKER_CONFIG (JSON with authorIds, accountId, accountHandle, accountName, testCommunity). Never commit their values. The backend retains approval and delivery policy; this worker cannot send email or approve proposals.

Run the connection test and event monitor manually before enabling scheduling. The monitor checks eligibility before installing browser dependencies. Quiet communities are due every two hours; imminent events every run. Committed checkpoints survive failures. No source text, account identifiers, screenshots, or private artifacts should be logged. Workflow runs are restricted to the canonical repository and never triggered by pull requests.

Run `node scripts/skool/plan.test.mjs` for offline cadence tests. Public standard runner minutes are free; third-party services and other GitHub products may have their own charges.
