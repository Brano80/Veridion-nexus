#!/usr/bin/env python3
"""
Send 8 test transfers with Blue agent in Almaco tenant:
- 7 to allowed countries (ES, DE, FR, IT, PT, GB, US)
- 1 to Slovakia (SK) - not in Blue's allowed list, expect REVIEW/BLOCK
"""

import os
import time
import requests

API_BASE = os.environ.get("VERIDION_API_URL", "https://api.veridion-nexus.eu")
API_KEY = os.environ.get("VERIDION_API_KEY", "")
if not API_KEY:
    raise SystemExit("ERROR: Set VERIDION_API_KEY environment variable")
AGENT_ID = os.environ.get("BLUE_AGENT_ID", "agt_4a345b2b5160")
AGENT_API_KEY = os.environ.get("BLUE_AGENT_API_KEY", "")

ENDPOINT = f"{API_BASE}/api/v1/shield/evaluate"
HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}

# Blue agent allowed data categories
BLUE_DATA_CATEGORIES = ["email", "name", "financial_data"]

TRANSFERS = [
    # 7 allowed countries
    {"code": "ES", "country": "Spain", "partner": "BBVA Backend"},
    {"code": "DE", "country": "Germany", "partner": "Amazon AWS"},
    {"code": "FR", "country": "France", "partner": "BBVA App"},
    {"code": "IT", "country": "Italy", "partner": "BBVA App"},
    {"code": "PT", "country": "Portugal", "partner": "BBVA App"},
    {"code": "GB", "country": "United Kingdom", "partner": "Google Dialog Flow"},
    {"code": "US", "country": "United States", "partner": "Amazon AWS"},
    # 1 to Slovakia (not in Blue's allowed_destination_countries)
    {"code": "SK", "country": "Slovakia", "partner": "BBVA App"},
]


def evaluate(transfer: dict) -> dict:
    payload = {
        "destination_country_code": transfer["code"],
        "destination_country": transfer["country"],
        "data_categories": BLUE_DATA_CATEGORIES,
        "partner_name": transfer["partner"],
        "agent_id": AGENT_ID,
        "agent_api_key": AGENT_API_KEY,
        "source_ip": "192.168.1.100",
        "data_size": 2048,
        "protocol": "HTTPS",
    }
    r = requests.post(ENDPOINT, json=payload, headers=HEADERS, timeout=30)
    return r


def main():
    print("Sending 8 transfers with Blue agent (Almaco tenant)")
    print(f"  API:       {ENDPOINT}")
    print(f"  Agent ID:  {AGENT_ID}")
    print(f"  Countries: 7 allowed (ES,DE,FR,IT,PT,GB,US) + 1 SK")
    print("=" * 60)

    for i, t in enumerate(TRANSFERS, 1):
        print(f"\n[{i}/8] {t['partner']} -> {t['country']} ({t['code']})...")

        try:
            r = evaluate(t)
            data = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}

            decision = data.get("decision", "-")
            reason = data.get("reason", "-")[:80]

            status = "[OK]" if r.status_code == 200 else f"[{r.status_code}]"
            print(f"  {status} Decision: {decision}")
            print(f"  Reason: {reason}")

            if r.status_code != 200:
                err = data.get("error") or data.get("message") or r.text[:150]
                print(f"  Error: {err}")

        except requests.RequestException as e:
            print(f"  Error: {e}")

        if i < len(TRANSFERS):
            time.sleep(0.5)

    print("\n" + "=" * 60)
    print("Done.")


if __name__ == "__main__":
    main()
