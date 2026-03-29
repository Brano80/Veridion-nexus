import requests
import time

API_BASE = "https://api.veridion-nexus.eu"
TENANT_KEY = "ss_test_25cc5fc40167da75ea0f34ac8b5a53ca"
AGENT_ID = "agt_a1cb88597a46"
AGENT_KEY = "agt_key_a0c720d7993f83a3229e3faa86c91d92"

HEADERS = {
    "Authorization": f"Bearer {TENANT_KEY}",
    "Content-Type": "application/json"
}

def evaluate(description, payload):
    print(f"\n{'='*50}")
    print(f"TEST: {description}")
    r = requests.post(f"{API_BASE}/api/v1/shield/evaluate", headers=HEADERS, json=payload)
    print(f"Status: {r.status_code}")
    print(f"Full response: {r.text}")
    return r

evaluate("Support ticket -> OpenAI (US)", {
    "destination_country_code": "US",
    "data_categories": ["email", "name", "ticket_content"],
    "partner_name": "OpenAI",
    "agent_id": AGENT_ID,
    "agent_api_key": AGENT_KEY,
    "purpose": "ticket_summarisation"
})
time.sleep(0.5)

evaluate("Support ticket -> AWS Frankfurt (DE)", {
    "destination_country_code": "DE",
    "data_categories": ["email", "name"],
    "partner_name": "AWS Frankfurt",
    "agent_id": AGENT_ID,
    "agent_api_key": AGENT_KEY,
    "purpose": "ticket_storage"
})
