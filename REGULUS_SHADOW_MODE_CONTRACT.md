# REGULUS — Shadow Mode Regulatory Contract

## APPLICABLE REGULATIONS

- **GDPR Art. 30**: Records of processing activities (processing records)
- **GDPR Art. 44–49**: International transfers (Sovereign Shield scope)
- **GDPR Art. 25**: Data protection by design (evidence must be immutable)

## KEY REGULATORY QUESTION

When the system is in Shadow Mode and would normally **BLOCK** a transfer, but instead returns **ALLOW** to the caller — what are the regulatory implications?

### Answer

Shadow Mode is a **pre-enforcement observation mode**. The transfer proceeds (ALLOW is returned to the caller) but the system **must not hide** what would have happened under enforcement. The regulatory risk is:

1. **GDPR Art. 30**: Records must show processing activities. If a transfer to a blocked country proceeds (because Shadow Mode returns ALLOW), the record must still document that the transfer **would have been blocked** under policy. This is essential for:
   - Demonstrating that the controller knew the transfer was to a blocked destination
   - Preserving auditor trail for "what would have happened" if enforcement were enabled
   - Avoiding any claim that the controller was unaware of non-compliant transfers

2. **Evidence Integrity**: Shadow decisions must be **sealed** with the same rigor as enforcement decisions. The evidence event must contain:
   - `shadow_mode: true` in the payload
   - Real event type (e.g., `DATA_TRANSFER_BLOCKED`, `DATA_TRANSFER_REVIEW`, `DATA_TRANSFER`) — same as enforcement mode
   - Real decision in payload (BLOCK, REVIEW, ALLOW) — same as enforcement mode

## COMPLIANCE REQUIREMENTS (Technical)

1. **Evidence creation**: Shadow Mode must NEVER skip evidence creation. Every shadow decision must be sealed in the Evidence Graph.
2. **Real decision accuracy**: The evidence event type and payload must record the **real** policy decision (what would have happened under enforcement). Shadow mode cannot hide or alter this.
3. **Event type**: Uses normal event types (`DATA_TRANSFER_BLOCKED`, `DATA_TRANSFER_REVIEW`, `DATA_TRANSFER`) — same as enforcement mode. Shadow mode is indicated only by `payload.shadow_mode: true`.
4. **Severity**: Same as the real decision (e.g. BLOCK → CRITICAL, REVIEW → HIGH).

## EVIDENCE REQUIREMENTS (GDPR Art. 30)

For every Shadow Mode decision, the evidence event must include:

| Field | Value | Purpose |
|-------|-------|---------|
| `event_type` | `DATA_TRANSFER_BLOCKED` \| `DATA_TRANSFER_REVIEW` \| `DATA_TRANSFER` | Real decision event type (same as enforcement) |
| `payload.shadow_mode` | `true` | Indicates observation-only mode |
| `payload.decision` | `BLOCK` \| `REVIEW` \| `ALLOW` | Real policy decision (same as enforcement) |

All other standard payload fields (destination, country_status, etc.) must be present.

## RISK FLAGS

- **Overclaiming**: UI must never say "transfer was blocked" for shadow events. Use "would have been blocked" (AUDITOR).
- **Evidence gap**: If evidence creation fails in shadow mode, the API must fail — never return ALLOW without sealing evidence.

## LANGUAGE CONSTRAINTS

- **Shadow mode UI**: "All transfers are passing through. Decisions shown are not being enforced."
- **Shadow mode UI**: Show real decision badge (BLOCK/REVIEW/ALLOW) with SHADOW indicator — decisions are recorded but not enforced.
- **No** claims that shadow mode is "compliant" or "certified" — it is observation-only.
