#!/usr/bin/env python3
"""Latency test v2: adequate countries, warm-up, reason breakdown."""

import json
import statistics
import time
import urllib.request

API_URL = "https://api.veridion-nexus.eu/api/v1/shield/evaluate"
API_KEY = "ss_test_25cc5fc40167da75ea0f34ac8b5a53ca"
AGENT_ID = "agt_875f09beed20"
AGENT_API_KEY = "agt_key_73e78ef5b9c50f337d7132638fe991dc"

ADEQUATE_COUNTRIES = [
    "AD", "AR", "BR", "CA", "FO", "GG", "IL", "IM", "JP", "JE", "NZ", "KR", "CH", "GB", "UY",
]


def evaluate(country_code: str) -> tuple[float, int, str, str, dict]:
    """Send evaluate request. Returns (latency_ms, status_code, decision, reason, full_result)."""
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
            reason = result.get("reason", "")
            return latency_ms, resp.status, decision, reason, result
    except urllib.error.HTTPError as e:
        latency_ms = (time.time() - start) * 1000
        body_bytes = e.read() if e.fp else b""
        try:
            err = json.loads(body_bytes.decode())
            reason = err.get("message", str(e))
            result = {"decision": "ERROR", "reason": reason}
        except (json.JSONDecodeError, UnicodeDecodeError):
            reason = str(e)
            result = {"decision": "ERROR", "reason": reason}
        return latency_ms, e.code, "ERROR", reason, result
    except Exception as e:
        latency_ms = (time.time() - start) * 1000
        reason = str(e)
        return latency_ms, -1, "ERROR", reason, {"decision": "ERROR", "reason": reason}


def is_agent_policy_violation(reason: str) -> bool:
    """True if BLOCK is due to agent policy, not actual GDPR block."""
    if not reason:
        return False
    r = reason.lower()
    # "Destination country not in agent policy" or similar
    return "agent" in r and ("policy" in r or "violation" in r or "unauthorized" in r)


def main():
    print("Latency test v2: adequate countries (warm-up + 1 request each)\n")

    # Warm-up: 1 request to DE before timed loop
    print("Warm-up: 1 request to DE...")
    _, _, _, _, _ = evaluate("DE")
    print("Warm-up complete.\n")

    latencies = []
    real_gdpr_latencies = []
    agent_violations = 0
    real_gdpr_count = 0
    under_100 = 0

    for code in ADEQUATE_COUNTRIES:
        latency_ms, status, decision, reason, result = evaluate(code)
        latencies.append(latency_ms)

        if decision == "BLOCK" and is_agent_policy_violation(reason):
            agent_violations += 1
            print(f"  Country: {code} | Decision: {decision} | Latency: {latency_ms:.0f}ms | Status: {status}")
            print(f"    Reason: {reason}")
        else:
            real_gdpr_count += 1
            real_gdpr_latencies.append(latency_ms)
            if latency_ms < 100:
                under_100 += 1
            print(f"  Country: {code} | Decision: {decision} | Latency: {latency_ms:.0f}ms | Status: {status}")
            print(f"    Reason: {reason}")

    print("\n--- Summary ---")
    print(f"  Total requests: {len(ADEQUATE_COUNTRIES)}")
    print(f"  Agent policy violations: {agent_violations} (not a real GDPR decision)")
    print(f"  Real GDPR decisions: {real_gdpr_count}")

    if latencies:
        print(f"\n  Latency (all requests):")
        print(f"    Min: {min(latencies):.0f}ms")
        print(f"    Max: {max(latencies):.0f}ms")
        print(f"    Average: {statistics.mean(latencies):.0f}ms")
        print(f"    Median: {statistics.median(latencies):.0f}ms")

    if real_gdpr_latencies:
        print(f"\n  Latency (real GDPR decisions only):")
        print(f"    Min: {min(real_gdpr_latencies):.0f}ms")
        print(f"    Max: {max(real_gdpr_latencies):.0f}ms")
        print(f"    Average: {statistics.mean(real_gdpr_latencies):.0f}ms")
        print(f"    Median: {statistics.median(real_gdpr_latencies):.0f}ms")
        print(f"    Under 100ms: {sum(1 for L in real_gdpr_latencies if L < 100)}/{len(real_gdpr_latencies)}")
    else:
        print(f"\n  Latency (real GDPR decisions only): N/A — no real GDPR decisions")


if __name__ == "__main__":
    main()
