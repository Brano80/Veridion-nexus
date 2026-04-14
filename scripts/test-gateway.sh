#!/usr/bin/env bash
# Usage: ./scripts/test-gateway.sh [AL_SERVICE_TOKEN]
#
# Integration test for veridion-nexus-gateway against https://api.veridion-nexus.eu
# Requires: bash, curl, grep, sed (all standard on macOS/Linux).
# No extra dependencies.

set -euo pipefail

API="https://api.veridion-nexus.eu"
TOKEN="${1:-${AL_SERVICE_TOKEN:-}}"

PASS=0
FAIL=0
SKIP=0

pass()  { echo "  ✓ PASS: $*"; PASS=$((PASS + 1)); }
fail()  { echo "  ✗ FAIL: $*"; FAIL=$((FAIL + 1)); }
skip()  { echo "  - SKIP: $*"; SKIP=$((SKIP + 1)); }
header(){ echo ""; echo "── Test $1: $2 ──"; }

# ── Test 1 — signing endpoint is up, algorithm = Ed25519 ────────────────────
header 1 "Validate /api/public/keys/signing is up (algorithm: Ed25519)"

HTTP1=$(curl -sf -w "\n%{http_code}" "$API/api/public/keys/signing" 2>/dev/null || echo -e "\n000")
STATUS1=$(echo "$HTTP1" | tail -n1)
BODY1=$(echo "$HTTP1" | head -n-1)

if [ "$STATUS1" != "200" ]; then
  fail "Expected HTTP 200, got $STATUS1"
else
  ALG=$(echo "$BODY1" | grep -o '"algorithm"\s*:\s*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"')
  if [ "$ALG" = "Ed25519" ]; then
    pass "HTTP 200, algorithm = Ed25519"
  else
    fail "HTTP 200 but algorithm = '${ALG}' (expected Ed25519)"
  fi
fi

# ── Obtain sandbox key (reused in tests 2–4) ─────────────────────────────────
SBX_RESP=$(curl -sf -X POST "$API/api/public/sandbox/create" \
  -H "Content-Type: application/json" 2>/dev/null || echo "")
SBX_KEY=$(echo "$SBX_RESP" | grep -o '"sandbox_key"\s*:\s*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"')

if [ -z "$SBX_KEY" ]; then
  echo ""
  echo "  ⚠ Could not obtain sandbox key — tests 2, 3, 4 will be marked FAIL."
fi

# Helper: call sandbox/evaluate and extract decision + sandbox flag
sbx_eval() {
  local body="$1"
  if [ -z "$SBX_KEY" ]; then
    echo ""
    return
  fi
  curl -sf -X POST "$API/api/public/sandbox/evaluate" \
    -H "Authorization: Bearer $SBX_KEY" \
    -H "Content-Type: application/json" \
    -d "$body" 2>/dev/null || echo ""
}

# ── Test 2 — sandbox REVIEW (US / Salesforce) ───────────────────────────────
header 2 "Sandbox evaluate → REVIEW (US, Salesforce)"

RESP2=$(sbx_eval '{"destination_country":"US","partner":"Salesforce","data_categories":["email"]}')
DEC2=$(echo "$RESP2" | grep -o '"decision"\s*:\s*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"')
SBX2=$(echo "$RESP2" | grep -o '"sandbox"\s*:\s*[a-z]*' | grep -o '[a-z]*$')

if [ "$DEC2" = "REVIEW" ] && [ "$SBX2" = "true" ]; then
  pass "decision=REVIEW, sandbox=true"
elif [ -z "$DEC2" ]; then
  fail "No response or parse error (sandbox key may be missing)"
else
  fail "Expected decision=REVIEW sandbox=true, got decision='${DEC2}' sandbox='${SBX2}'"
fi

# ── Test 3 — sandbox BLOCK (Russia) ─────────────────────────────────────────
header 3 "Sandbox evaluate → BLOCK (RU)"

RESP3=$(sbx_eval '{"destination_country":"RU","data_categories":["email"]}')
DEC3=$(echo "$RESP3" | grep -o '"decision"\s*:\s*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"')

if [ "$DEC3" = "BLOCK" ]; then
  pass "decision=BLOCK"
elif [ -z "$DEC3" ]; then
  fail "No response or parse error (sandbox key may be missing)"
else
  fail "Expected decision=BLOCK, got '${DEC3}'"
fi

# ── Test 4 — sandbox ALLOW (Germany / EU) ───────────────────────────────────
header 4 "Sandbox evaluate → ALLOW (DE)"

RESP4=$(sbx_eval '{"destination_country":"DE","data_categories":["email"]}')
DEC4=$(echo "$RESP4" | grep -o '"decision"\s*:\s*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"')

if [ "$DEC4" = "ALLOW" ]; then
  pass "decision=ALLOW"
elif [ -z "$DEC4" ]; then
  fail "No response or parse error (sandbox key may be missing)"
else
  fail "Expected decision=ALLOW, got '${DEC4}'"
fi

# ── Test 5 — Ed25519 verify via ACM events (requires AL_SERVICE_TOKEN) ───────
header 5 "Ed25519 signature verify (POST /api/acm/events → GET /api/acm/events/{id}/verify)"

if [ -z "$TOKEN" ]; then
  skip "AL_SERVICE_TOKEN not set — set env var or pass as \$1 to enable this test"
  SKIP=$((SKIP + 1))
  # Adjust: skip() already incremented SKIP; undo double-count
  SKIP=$((SKIP - 1))
else
  NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || python3 -c "from datetime import datetime,timezone; print(datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'))")
  SESSION=$(python3 -c "import uuid; print(uuid.uuid4())" 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || openssl rand -hex 16 | sed 's/.\{8\}/&-/;s/.\{13\}/&-/;s/.\{18\}/&-/;s/.\{23\}/&-/;s/-$//')

  EVENT_BODY=$(printf '{
    "agent_id": "agt_demo_public",
    "session_id": "%s",
    "tenant_id": "a0000001-0000-4000-8000-00000000d3d0",
    "tool_id": "evaluate_transfer",
    "called_at": "%s",
    "inputs": {"fields_requested": ["email"], "data_subjects": ["user:test_gateway"]},
    "outputs": {"fields_returned": ["decision"]},
    "context_trust_level": "trusted",
    "decision_made": true,
    "human_review_required": false
  }' "$SESSION" "$NOW")

  CREATE_RESP=$(curl -sf -X POST "$API/api/acm/events" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$EVENT_BODY" 2>/dev/null || echo "")

  EVENT_ID=$(echo "$CREATE_RESP" | grep -o '"id"\s*:\s*"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"')

  if [ -z "$EVENT_ID" ]; then
    fail "Could not create ToolCallEvent (check AL_SERVICE_TOKEN and that agt_demo_public exists). Response: ${CREATE_RESP}"
  else
    VERIFY_RESP=$(curl -sf "$API/api/acm/events/$EVENT_ID/verify" \
      -H "Authorization: Bearer $TOKEN" 2>/dev/null || echo "")
    VERIFIED=$(echo "$VERIFY_RESP" | grep -o '"verified"\s*:\s*[a-z]*' | grep -o '[a-z]*$')
    if [ "$VERIFIED" = "true" ]; then
      pass "event_id=$EVENT_ID verified=true (Ed25519)"
    else
      fail "Expected verified=true, got '${VERIFIED}'. Verify response: ${VERIFY_RESP}"
    fi
  fi
fi

# ── Test 6 — signing key consistency (two calls, same key_id) ────────────────
header 6 "Signing key consistency (two calls return the same key_id)"

KID1=$(curl -sf "$API/api/public/keys/signing" 2>/dev/null \
  | grep -o '"key_id"\s*:\s*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"')
KID2=$(curl -sf "$API/api/public/keys/signing" 2>/dev/null \
  | grep -o '"key_id"\s*:\s*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"')

if [ -z "$KID1" ] || [ -z "$KID2" ]; then
  fail "Could not retrieve key_id from one or both calls"
elif [ "$KID1" = "$KID2" ]; then
  pass "key_id is stable across calls: $KID1"
else
  fail "key_id mismatch: call1='$KID1' call2='$KID2'"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
TOTAL=$((PASS + FAIL + SKIP))
echo ""
echo "════════════════════════════════"
echo "  Results: ${PASS}/${TOTAL} tests passed  (${SKIP} skipped)"
echo "════════════════════════════════"
echo ""

[ "$FAIL" -eq 0 ]
