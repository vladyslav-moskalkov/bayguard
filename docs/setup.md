# Setup — isolated private test

## Prerequisites and scope

Use an n8n installation supporting the exported native node versions, including Data table and Telegram Trigger v1.5. The installation version was not captured as a pinned compatibility baseline; validate imports on your own installation before enabling delivery. JSON exports are not a backup of credentials or a ready-to-publish deployment.

Use a **separate Telegram test bot**, a private chat and one consenting tester. The current delivery gate supports one tester; it intentionally blocks other recipients. Removing it for a multi-customer service requires a separate security/privacy review and production hardening. No additional community nodes or JavaScript packages are required.

## 1. Rebuild and inspect

Run `npm test` with Node.js 22+. Import `workflows/bayguard-acceptance-lab.json` for a manual, synthetic kernel run. It makes no external calls. Do not activate the Telegram workflow yet.

## 2. Prepare new state storage

Create a **new isolated** native n8n Data table, e.g. `BayGuard_State`:

| Column | Native type |
|---|---|
| `scope` | String |
| `revision` | Number |
| `commit_token` | String |
| `state_json` | String |

n8n supplies system `id`, creation and update timestamps. Import `data/BayGuard_State.csv` into this new table. Verify **exactly one row** with `scope=bayguard_demo`, numeric `revision=0`, and valid JSON in `state_json`. If CSV import infers a string for revision, fix the schema before proceeding. Never import the seed over existing/live booking state.

Import `workflows/bayguard-telegram.json`. In **Read appointment state** and **Commit only if revision unchanged**, replace `REPLACE_WITH_DATA_TABLE_ID` by selecting your new table. Keep both ID and revision filters and all-conditions matching unchanged. Preserve numeric revision mapping.

## 3. Configure identity and credentials

Create/select a Telegram credential in n8n; do not paste tokens into the workflow JSON or Git.

Attach it to all three native channel nodes:

- Telegram — messages and buttons
- Telegram — acknowledge button
- Telegram — reply with inline buttons

Replace placeholder `0` with your tester's **numeric Telegram user/private-chat ID**, stored as a string, in:

1. Trigger → additional fields → user IDs **and** chat IDs.
2. Private test settings → `allowedUserId`.
3. Trusted expiry event → `userId` **and** `chatId`.

Do not change the synthetic storage-test sender `10001`: this branch is deliberately separate and never sends messages. Leave `deliveryEnabled=false`, `offerMinutes=10`, and the scheduler disabled for now. For multiple imports of this workflow, regenerate a unique webhook ID in the editor if necessary.

## 4. Verify persistence without messages

Run **Manual — storage smoke test**. Expect `STORAGE_ROUNDTRIP_PASSED`, an incremented revision and zero messages. Missing/duplicate state rows and a failed revision commit must stop without a success confirmation. The smoke test mutates only your new test row; it is not a live chat test.

## 5. Test Telegram deliberately

Publishing a Telegram trigger can replace the selected bot's existing incoming webhook. Obtain approval from anyone responsible for that bot first. Test mode can also register a webhook; do not use a production/shared bot casually.

Only after identity/storage checks, set `deliveryEnabled=true` and publish the private workflow. Test `/start`, service selection, booking, My appointments, owner cancellation, opt-in waitlist and offer acceptance. Use synthetic appointments, not customer records. Verify executions without exporting personal logs into Git.

## 6. Expiry and ongoing operation

The timer is disabled in this export. Accepting an expired offer is rejected by the rules even if no timer ran, but **proactive expiry processing and progression require the scheduler or a subsequent event**. To test scheduled expiry, explicitly enable the timer in your isolated environment. A temporary `offerMinutes=1` is supported for accelerated private QA; restore `10` after testing. Confirm both settings and persisted state, not only the UI field.

The timer uses trusted server events, never a role supplied by Telegram text. Idle sweeps produce no state write. Leave it disabled if you do not want recurring executions.

## Before a real customer rollout

- Validate concurrent conditional updates under load and failure/retry behavior.
- Add a durable delivery outbox, reconciliation and alerting; no blind resends after ambiguous Telegram timeouts.
- Define retention/archival, access controls, privacy/consent handling and backup/restore.
- Monitor failed executions, API limits and growing JSON state; current bounded ledgers stop when retention is needed.
- Expand and test recipient authorization deliberately; the export is owner-only, not a public booking product.
- Reconcile business configuration, opening hours, service durations, prices and cancellation policy with the actual studio.

No payment collection, attendance tracking or revenue recognition is implemented.
