# Workflow node guide

Native integrations own transport and storage. The single Code node owns deterministic business and conversation rules. All node labels and in-editor notes are English.

## 1. Telegram — messages and buttons

Receives authenticated Telegram messages and callback_query updates. Native chat/user restrictions limit this private prototype to its owner.

## 2. Telegram identity

Maps sender ID, private chat ID, command, callback ID and Telegram update ID. Identity never comes from user message text.

## 3. Private test settings

Defines the owner allowlist, delivery switch, server timestamp and offer lifetime. One-minute TTL is used only for explicitly approved accelerated QA; the normal setting is ten minutes.

## 4. Private tester only

Rejects non-owner or non-private requests before reading or changing appointment state. Trusted manual storage tests use a separate synthetic branch.

## 5. Read appointment state

Reads exactly one scoped prototype row from the native n8n Data table. Missing or duplicate state rows fail closed.

## 6. Availability + booking rules

Pure deterministic service/bay capacity checks, appointment ownership, explicit waitlist consent, FIFO-compatible matching, holds, expiry, deduplication and paginated Telegram menus. No LLM and no network calls.

## 7. Commit only if revision unchanged

Writes the next state only when both row ID and expected revision still match. This is a conditional state update, not an unconditional overwrite.

## 8. Our commit succeeded

Verifies the returned revision and execution-specific commit token before any success message can be sent. Production concurrency stress testing remains a separate gate.

## 9. Verified delivery context

Restores the prepared messages and trusted routing context only after the state commit was verified.

## 10. Messages to send

Routes nonempty message batches to delivery. Silent expiry or synthetic storage checks finish without Telegram calls.

## 11. One recipient per message

Splits prepared replies and targeted offers into individual recipient items. This is not a subscriber broadcast.

## 12. Live delivery and tester allowlist

A second delivery gate checks the live switch, recipient allowlist and non-synthetic source before Telegram sendMessage.

## 13. Telegram — reply with inline buttons

Uses the native Telegram credential to send a message with four native inline buttons. Each label and callback has its own expression; variable menus use short pages.

## 14. Preview only — nothing sent

Produces a readable preview when live delivery is disabled or the recipient is not allowlisted. Does not send messages.

## 15. Storage smoke test PASSED

Reports a verified state roundtrip and zero messages sent for the manual synthetic storage branch.

## 16. No confirmation after storage conflict

Stops on a failed/ambiguous conditional commit. No false booking confirmation is emitted; reloading and a controlled retry are required.

## 17. Button needs acknowledgement

Detects real inline callbacks requiring an answerQuery acknowledgement. Ordinary text and synthetic events skip it.

## 18. Telegram — acknowledge button

Answers the inline callback to dismiss Telegram loading feedback. An acknowledgement failure is not a booking decision.

## 19. Ignore non-test users

Ends non-authorized/private-chat requests without a reply or state change.

## 20. Manual — storage smoke test

Starts a synthetic persistence-only check. It is not a replacement for a real Telegram end-to-end test.

## 21. Synthetic event — NO messages

Builds a synthetic sender and unique probe event. This branch is restored to storage-only mode after transport QA.

## 22. Every minute — expire offers

Scheduled sweep for due holds and newly eligible cancelled windows. Temporarily enabled only for approved private expiry QA; otherwise disabled in this handoff.

## 23. Trusted expiry event

Builds a server-owned timer event. End users cannot grant themselves the internal scheduler role through Telegram text.

The three colored sticky notes separate intake/identity, state-before-confirmation and targeted recovery. The screenshot documents the original private integration; exported safe defaults intentionally differ: credentials removed, IDs replaced and delivery disabled.
