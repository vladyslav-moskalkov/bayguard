# Validation scope

## Reproducible offline evidence

`npm test` rebuilds the exports and executes the generated Code-node scripts, rather than testing a different hidden implementation.

- **41 kernel assertions**: booking/time/business-hour validation, duration/capability matching, overlap and adjacency, consent/withdrawal, ownership, exclusive holds, exact TTL boundary, next eligible customer, event replay/conflict, no fake payment and explicitly modeled economics.
- **33 adapter assertions**: menus/pagination, page ownership, booking/cancel/accept, update replay, no-send storage branch, idle sweep without a write, expiry with next-candidate transfer and temporary one-minute/restored ten-minute configuration.
- Additional structural/safety checks validate connections, node references, notes, credential-free inactive exports, fixed native button shape, data seed, compiled manual/menu/idle behavior and deterministic rebuilds.

The 74 count refers to behavioral assertions, not 74 separate live scenarios. The final JSON fixture report is `data/test-summary.json`.

## Private live integration — 19 October 2026

The original private n8n/Telegram integration was exercised with one consenting tester:

| Scenario | Observed outcome |
|---|---|
| `/start`, buttons and service navigation | Menus delivered; callback buttons worked after fixing the native inlineKeyboard structure |
| Interior-detail booking / My appointments | Future appointment confirmed and listed; configured quote AED 350 |
| Owner cancellation | State became cancelled; appointment removed from future visits |
| Explicit waitlist consent and targeted offer | One matching private offer delivered |
| Accept an active offer | Appointment recovered at the configured time/quote |
| Accelerated scheduled expiry | One-minute offer expired; scheduler processed it about four seconds after its deadline |
| Accept the stale offer afterwards | Refused as no longer active; tester confirmed the refusal |

The recovered test appointment was subsequently cancelled for expiry QA. Final checked state contained **no active confirmed bookings and no active holds**. Normal ten-minute TTL was restored and the scheduler disabled. No customer revenue or payment was collected.

## What this does not prove

- The exact sanitized imports are generated from the tested source but have **not** been reconnected to a new deployment: credentials, identities and table references intentionally require setup.
- Next-candidate progression was tested synthetically; not with two distinct real Telegram customers.
- The expiry test used one minute, not a ten-minute wall-clock wait.
- Sequential tests and one-tester live checks do not establish atomic multi-worker behavior, production throughput, or absence of every possible race.
- A verified state update is not a delivery receipt. Prepared delivery intents are not a durable outbox, and ambiguous send failures require operator review.
- Boundaries include state retention limits, JSON-row scalability, restore/recovery, privacy controls and monitoring.

Private execution logs, bot identifiers, account/server URLs and actual chat data are deliberately excluded from this repository. This is an evidence-bounded engineering showcase, not an audit-certified service or a confidential-client claim.
