#!/usr/bin/env python3
"""Send 6 test transfers to Veridion API for Almaco tenant."""

import os
import time
import requests

API_BASE = os.environ.get("VERIDION_API_URL", "https://api.veridion-nexus.eu")
API_KEY = os.environ.get("VERIDION_API_KEY", "")
if not API_KEY:
    raise SystemExit("ERROR: Set VERIDION_API_KEY environment variable")
ENDPOINT = f"{API_BASE}/api/v1/shield/evaluate"

HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}

TRANSFERS = [
    {
        "destination_country_code": "DE",
        "data_categories": ["email", "name"],
        "partner_name": "AWS Frankfurt",
    },
    {
        "destination_country_code": "DE",
        "data_categories": ["financial_data"],
        "partner_name": "Deutsche Bank API",
    },
    {
        "destination_country_code": "FR",
        "data_categories": ["email", "user_id"],
        "partner_name": "OVH Cloud Paris",
    },
    {
        "destination_country_code": "IN",
        "data_categories": ["name", "phone"],
        "partner_name": "Freshdesk",
    },
    {
        "destination_country_code": "US",
        "data_categories": ["email", "user_content"],
        "partner_name": "OpenAI",
    },
    {
        "destination_country_code": "CN",
        "data_categories": ["email", "name", "ip_address"],
        "partner_name": "Alibaba Cloud",
    },
]

def main():
    print("Sending 6 test transfers to Veridion API (Almaco tenant)...")
    print("=" * 60)

    for i, transfer in enumerate(TRANSFERS, 1):
        dest = transfer["destination_country_code"]
        partner = transfer["partner_name"]
        print(f"\n[{i}/6] {partner} ({dest})...")

        try:
            r = requests.post(ENDPOINT, json=transfer, headers=HEADERS, timeout=30)
            r.raise_for_status()
            data = r.json()

            decision = data.get("decision", "-")
            reason = data.get("reason", "-")
            seal_id = data.get("review_id") or data.get("seal_id") or data.get("evidence_id", "-")

            print(f"  Decision: {decision}")
            print(f"  Reason:   {reason}")
            print(f"  Seal ID:  {seal_id}")

        except requests.RequestException as e:
            print(f"  Error: {e}")
            if hasattr(e, "response") and e.response is not None:
                try:
                    err = e.response.json()
                    print(f"  Response: {err}")
                except Exception:
                    print(f"  Response: {e.response.text[:200]}")

        if i < len(TRANSFERS):
            time.sleep(0.5)

    print("\n" + "=" * 60)
    print("Done.")

if __name__ == "__main__":
    main()
