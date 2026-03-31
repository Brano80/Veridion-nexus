#!/usr/bin/env python3
"""Latency test: 1 evaluate() call per adequate country."""

import json
import os
import statistics
import time
import urllib.request

API_URL = "https://api.veridion-nexus.eu/api/v1/shield/evaluate"
API_KEY = os.environ.get("VERIDION_API_KEY", "")
if not API_KEY:
    raise SystemExit("ERROR: Set VERIDION_API_KEY environment variable")
AGENT_ID = os.environ.get("AGENT_ID", "agt_a1cb88597a46")
AGENT_API_KEY = os.environ.get("AGENT_API_KEY", "")

ADEQUATE_COUNTRIES = [
    "AD", "AR", "BR", "CA", "FO", "GG", "IL", "IM", "JP", "JE", "NZ", "KR", "CH", "GB", "UY",
]


def evaluate(country_code: str) -> tuple[float, int, str]:
    """Send evaluate request, return (latency_ms, status_code, decision)."""
    body = {
        "destination_country_code": country_code,
        "data_categories": ["email", "name"],
        "partner_name": "AWS",
        "agent_id": AGENT_ID,
        "agent_api_key": AGENT_API_KEY,
        "purpose": "latency_test",
    }
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        API_URL,
        data=data,
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    start = time.time()
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode())
            latency_ms = (time.time() - start) * 1000
            decision = result.get("decision", "UNKNOWN")
            return latency_ms, resp.status, decision
    except urllib.error.HTTPError as e:
        latency_ms = (time.time() - start) * 1000
        body = e.read().decode() if e.fp else ""
        try:
            err = json.loads(body)
            decision = err.get("message", body)[:30]
        except json.JSONDecodeError:
            decision = str(e)[:30]
        return latency_ms, e.code, decision
    except Exception as e:
        latency_ms = (time.time() - start) * 1000
        return latency_ms, -1, str(e)[:30]


def main():
    print("Latency test: adequate countries (1 request each)\n")
    latencies = []
    decisions = []
    under_100 = 0

    for code in ADEQUATE_COUNTRIES:
        latency_ms, status, decision = evaluate(code)
        latencies.append(latency_ms)
        decisions.append(decision)
        if latency_ms < 100:
            under_100 += 1
        print(f"  Country: {code} | Decision: {decision} | Latency: {latency_ms:.0f}ms | Status: {status}")

    print("\n--- Summary ---")
    print(f"  Total requests: {len(ADEQUATE_COUNTRIES)}")
    all_allow = all(d == "ALLOW" for d in decisions)
    print(f"  All ALLOW: {'yes' if all_allow else 'no'}")
    if latencies:
        print(f"  Min latency: {min(latencies):.0f}ms")
        print(f"  Max latency: {max(latencies):.0f}ms")
        print(f"  Average latency: {statistics.mean(latencies):.0f}ms")
        print(f"  Median latency: {statistics.median(latencies):.0f}ms")
        print(f"  Under 100ms: {under_100}/{len(ADEQUATE_COUNTRIES)}")


if __name__ == "__main__":
    main()
