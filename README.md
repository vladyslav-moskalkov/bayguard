# BayGuard

### A cancellation should become an opening — not an empty bay.

An independent **n8n + Telegram appointment-recovery prototype** for a Dubai detailing studio scenario. Customers book a suitable service, cancel their appointment or opt into a waitlist. A released opening goes to one compatible customer at a time, with an exclusive expiring hold.

**Native integrations. Deterministic booking rules. No LLM required.**

![BayGuard workflow — native Telegram, state persistence and targeted recovery](docs/workflow.jpg)

[Українською](README.uk.md) · [Setup](docs/setup.md) · [Validation](docs/validation.md) · [Node guide](docs/nodes.md) · [Business model](docs/business-model.uk.md)

## What it does

- Checks service duration, bay capability, business hours and overlapping bookings.
- Supports booking, owner-only cancellation and explicit waitlist opt-in/withdrawal.
- Selects the first compatible waiting customer, rather than broadcasting to everyone.
- Holds the opening for **10 minutes**; decline/expiry makes it available to the next eligible candidate.
- Uses authenticated Telegram identity, paginated inline buttons and replay guards.
- Reads native n8n Data table state, conditionally updates the expected revision and checks the returned commit token **before sending a confirmation**.
- Keeps quoted booking value separate from payments and measured business results.

## Repository contents

| File / directory | Purpose |
|---|---|
| `workflows/bayguard-telegram.json` | Importable private Telegram workflow: 23 functional nodes + 3 sticky notes |
| `workflows/bayguard-acceptance-lab.json` | Manual, network-free kernel acceptance suite |
| `engine.mjs` | Pure reservation, consent, hold, expiry and matching rules |
| `bot_adapter.mjs` | Pure conversation adapter; no Telegram/API calls |
| `build_bot.mjs`, `build_workflow.mjs` | Workflow generators and 74 synthetic assertions |
| `scripts/` | Portable packaging and structural/safety validation |
| `data/BayGuard_State.csv` | Empty seed state for a new isolated Data table |
| `docs/` | Setup, node responsibilities, evidence, limitations and visual |

## Run offline checks

Node.js **22+**, npm, no third-party dependencies and no API credentials needed:

```sh
npm test
```

This rebuilds both JSON workflows, runs **41 kernel + 33 adapter assertions**, then validates import structure, node references, compiled Code-node behavior, safe defaults and reproducible output. `npm run check` validates committed artifacts without rebuilding them. Generated temporary results are ignored in `output/`.

## Import into n8n

1. Start with the manual acceptance lab if you only want to inspect the rules.
2. For Telegram, create a separate Data table and import the seed CSV; select it in both Data table nodes.
3. Attach your own Telegram credential, configure your private tester ID in all required places and run the storage-only smoke test.
4. Follow the [setup checklist](docs/setup.md) before allowing live delivery or publishing. Importing an export alone does not configure or prove a deployment.

Exports contain **no credentials, real Telegram IDs, instance URLs or live booking state**. Delivery is **OFF**, the periodic trigger is **disabled**, workflows are **inactive**, and the tester ID is `0` until configured. Use a separate test bot: Telegram supports one incoming webhook per bot.

## Evidence and readiness

The original private integration was exercised through a real Telegram conversation: menu → booking → cancellation → waitlist offer → acceptance. A separately approved **one-minute expiry test** verified scheduled expiry and rejection of stale acceptance. Normal TTL was restored to ten minutes and the scheduler disabled afterwards. See [validation scope](docs/validation.md).

This is **not a production-ready client deployment**. Multi-customer concurrency/load, durable delivery outbox/reconciliation, monitoring, backup/restore and retention/privacy controls still need implementation or operational validation. Conditional updates and replay checks are not an exactly-once delivery guarantee.

No payments, CRM, Google Calendar, WhatsApp, reminders or AI model integration are included. Service prices and unit economics are illustrative configuration, not actual studio offers or proven revenue. No open-source license has been selected; publication does not itself grant a reuse license.
