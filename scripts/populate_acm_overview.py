#!/usr/bin/env python3
"""
Populate ACM Overview counters via ingest APIs (POST /api/acm/*).

Env:
  API_BASE          default https://api.veridion-nexus.eu
  AL_SERVICE_TOKEN  Bearer token (omit if API allows unauthenticated ACM in dev / open config)
  AGENT_ID          default agt_4a345b2b5160 (Blue agent — change if needed)
  TENANT_ID         optional; if unset, loaded from GET /api/v1/agents/{AGENT_ID}/card (x-veridion.tenant_id)
  DATABASE_URL      optional; if set + psycopg2, used when TENANT_ID unset and card has no tenant_id
  VERIDION_API_KEY  tenant API key for GET .../agents/{id}/card (default: Almaco demo key used in other scripts)
"""
import os
import sys
import uuid

import requests

API_BASE = os.environ.get("API_BASE", "https://api.veridion-nexus.eu").rstrip("/")
TOKEN = os.environ.get("AL_SERVICE_TOKEN", "")
VERIDION_API_KEY = os.environ.get("VERIDION_API_KEY", "ss_test_25cc5fc40167da75ea0f34ac8b5a53ca")
TENANT_ID = os.environ.get("TENANT_ID")


def headers():
    h = {"Content-Type": "application/json"}
    if TOKEN:
        h["Authorization"] = f"Bearer {TOKEN}"
    return h


def headers_with_tenant_key():
    h = {"Content-Type": "application/json"}
    key = VERIDION_API_KEY or TOKEN
    if key:
        h["Authorization"] = f"Bearer {key}"
    return h


def resolve_agent_from_db():
    url = os.environ.get("DATABASE_URL")
    if not url:
        return None, None
    try:
        import psycopg2
    except ImportError:
        return None, None
    conn = psycopg2.connect(url)
    try:
        cur = conn.cursor()
        cur.execute("SELECT id::text, tenant_id::text FROM agents WHERE deleted_at IS NULL LIMIT 1")
        row = cur.fetchone()
        if row:
            return row[0], row[1]
    finally:
        conn.close()
    return None, None


def fetch_tenant_from_card(agent_id: str):
    r = requests.get(
        f"{API_BASE}/api/v1/agents/{agent_id}/card",
        headers=headers_with_tenant_key(),
        timeout=60,
    )
    r.raise_for_status()
    data = r.json()
    xv = data.get("x-veridion") or {}
    return xv.get("tenant_id")


def post(path: str, body: dict) -> dict:
    r = requests.post(f"{API_BASE}{path}", headers=headers(), json=body, timeout=120)
    if not r.ok:
        print(f"POST {path} failed: {r.status_code} {r.text[:500]}", file=sys.stderr)
        r.raise_for_status()
    return r.json()


def patch(path: str, body: dict) -> dict:
    r = requests.patch(f"{API_BASE}{path}", headers=headers(), json=body, timeout=120)
    if not r.ok:
        print(f"PATCH {path} failed: {r.status_code} {r.text[:500]}", file=sys.stderr)
        r.raise_for_status()
    return r.json()


def main():
    global TENANT_ID
    agent = os.environ.get("AGENT_ID", "agt_4a345b2b5160")
    if not TENANT_ID:
        TENANT_ID = fetch_tenant_from_card(agent)
    if not TENANT_ID:
        aid, tid = resolve_agent_from_db()
        if tid:
            TENANT_ID = tid
            if not os.environ.get("AGENT_ID") and aid:
                agent = aid
            print("Using tenant (and optionally agent) from DATABASE_URL", file=sys.stderr)
    if not TENANT_ID:
        print(
            "Set TENANT_ID, or ensure GET /api/v1/agents/{AGENT_ID}/card returns x-veridion.tenant_id, "
            "or set DATABASE_URL with psycopg2 for auto-discovery.",
            file=sys.stderr,
        )
        sys.exit(1)

    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    s_tool = str(uuid.uuid4())
    s_deg_a = str(uuid.uuid4())
    s_deg_b = str(uuid.uuid4())

    for i in range(3):
        post(
            "/api/acm/events",
            {
                "agent_id": agent,
                "session_id": s_tool,
                "tenant_id": TENANT_ID,
                "tool_id": f"demo.tool.{i}",
                "called_at": now,
                "inputs": {"q": "demo"},
                "outputs": {"ok": True},
                "context_trust_level": "trusted",
                "decision_made": False,
                "human_review_required": False,
            },
        )

    post(
        "/api/acm/trust-annotations",
        {
            "agent_id": agent,
            "session_id": s_deg_a,
            "tenant_id": TENANT_ID,
            "trust_level": "degraded",
            "sources_in_context": [],
            "degradation_trigger": "demo_seed",
        },
    )
    post(
        "/api/acm/trust-annotations",
        {
            "agent_id": agent,
            "session_id": s_deg_b,
            "tenant_id": TENANT_ID,
            "trust_level": "untrusted",
            "sources_in_context": [],
        },
    )

    post(
        "/api/acm/transfers",
        {
            "agent_id": agent,
            "tenant_id": TENANT_ID,
            "origin_country": "DE",
            "destination_country": "US",
            "transfer_mechanism": "scc",
            "data_categories": ["email"],
            "dpf_relied_upon": False,
        },
    )
    post(
        "/api/acm/transfers",
        {
            "agent_id": agent,
            "tenant_id": TENANT_ID,
            "origin_country": "DE",
            "destination_country": "US",
            "transfer_mechanism": "dpf",
            "data_categories": ["email"],
            "dpf_relied_upon": True,
        },
    )

    p1 = post(
        "/api/acm/oversight",
        {
            "agent_id": agent,
            "tenant_id": TENANT_ID,
            "review_trigger": "high_impact_decision",
            "notes": "demo pending",
        },
    )["data"]["id"]
    p2 = post(
        "/api/acm/oversight",
        {
            "agent_id": agent,
            "tenant_id": TENANT_ID,
            "review_trigger": "manual_request",
        },
    )["data"]["id"]

    patch(
        f"/api/acm/oversight/{p2}",
        {
            "reviewer_outcome": "approved",
            "reviewer_id": "demo-reviewer",
            "notes": "demo decided",
            "eu_ai_act_compliance": True,
        },
    )

    print("OK — seeded ACM demo data.")
    print(f"  tenant_id={TENANT_ID} agent_id={agent}")
    print(f"  oversight pending id={p1}  decided id={p2}")
    print("  Expect: +3 tool events, +2 degraded sessions, +2 transfers (1 Schrems), +1 pending, +1 decided")
    print("  Open /acm in the dashboard for this tenant.")


if __name__ == "__main__":
    main()
