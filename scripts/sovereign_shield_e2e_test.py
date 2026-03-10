#!/usr/bin/env python3
"""
Sovereign Shield End-to-End Test
Simulates an EU SaaS startup (Almaco) with AI agent traffic.
"""

import requests
import json
import time

API_BASE = "https://api.veridion-nexus.eu"
API_KEY = "ss_test_244c6c2a87e5ab765c3e36fef9345cd4"

HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

def evaluate(description, payload):
    print(f"\n{'='*60}")
    print(f"TEST: {description}")
    print(f"Payload: {json.dumps(payload, indent=2)}")
    r = requests.post(f"{API_BASE}/api/v1/shield/evaluate", headers=HEADERS, json=payload)
    result = r.json()
    print(f"Status: {r.status_code}")
    print(f"Decision: {result.get('decision')}")
    print(f"Reason: {result.get('reason')}")
    print(f"Legal Basis: {result.get('legal_basis')}")
    print(f"Seal ID: {result.get('seal_id')}")
    return result

print("SOVEREIGN SHIELD — END-TO-END TEST")
print(f"API: {API_BASE}")
print(f"Key: {API_KEY[:20]}...")
print(f"Scenario: EU SaaS startup (Almaco) with AI agent traffic")

# 1. EU internal — should ALLOW
evaluate("EU internal transfer (Frankfurt AWS)", {
    "destination_country_code": "DE",
    "data_categories": ["email", "name"],
    "partner_name": "AWS Frankfurt",
    "protocol": "HTTPS"
})
time.sleep(0.5)

# 2. Adequate country — should ALLOW
evaluate("Transfer to Japan (adequate country)", {
    "destination_country_code": "JP",
    "data_categories": ["email", "user_id"],
    "partner_name": "Datadog Tokyo",
    "protocol": "HTTPS"
})
time.sleep(0.5)

# 3. US/OpenAI — no SCC yet, should REVIEW
evaluate("OpenAI API call (US, no SCC registered)", {
    "destination_country_code": "US",
    "data_categories": ["email", "name", "user_content"],
    "partner_name": "OpenAI",
    "protocol": "HTTPS",
    "request_path": "/v1/chat/completions"
})
time.sleep(0.5)

# 4. US/AWS — no SCC yet, should REVIEW
evaluate("AWS S3 bucket (US, no SCC registered)", {
    "destination_country_code": "US",
    "data_categories": ["documents", "email"],
    "partner_name": "AWS S3 US-East",
    "protocol": "HTTPS"
})
time.sleep(0.5)

# 5. India — should REVIEW (SCC required)
evaluate("Transfer to India (SCC required)", {
    "destination_country_code": "IN",
    "data_categories": ["name", "phone", "address"],
    "partner_name": "Freshdesk Support",
    "protocol": "HTTPS"
})
time.sleep(0.5)

# 6. China — should BLOCK
evaluate("Transfer to China (blocked country)", {
    "destination_country_code": "CN",
    "data_categories": ["email", "name", "ip_address"],
    "partner_name": "Alibaba Cloud",
    "protocol": "HTTPS"
})
time.sleep(0.5)

# 7. Russia — should BLOCK
evaluate("Transfer to Russia (blocked country)", {
    "destination_country_code": "RU",
    "data_categories": ["email"],
    "partner_name": "Yandex Analytics",
    "protocol": "HTTPS"
})
time.sleep(0.5)

# 8. No data categories — should REVIEW (safe default)
evaluate("Missing data categories (safe default)", {
    "destination_country_code": "US",
    "partner_name": "Stripe",
    "protocol": "HTTPS"
})
time.sleep(0.5)

# 9. Brazil — should ALLOW (adequacy Jan 2026)
evaluate("Transfer to Brazil (adequacy Jan 2026)", {
    "destination_country_code": "BR",
    "data_categories": ["email", "name"],
    "partner_name": "Brazilian partner",
    "protocol": "HTTPS"
})
time.sleep(0.5)

# 10. Check compliance status
print(f"\n{'='*60}")
print("COMPLIANCE STATUS CHECK")
r = requests.get(f"{API_BASE}/api/v1/lenses/sovereign-shield/stats", headers=HEADERS)
print(f"Status: {r.status_code}")
print(json.dumps(r.json(), indent=2))
