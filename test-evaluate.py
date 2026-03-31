import os
import requests

API_KEY = os.environ.get("VERIDION_API_KEY", "")
if not API_KEY:
    raise SystemExit("ERROR: Set VERIDION_API_KEY environment variable")

r = requests.post(
    "https://api.veridion-nexus.eu/api/v1/shield/evaluate",
    headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    },
    json={
        "destination_country_code": "US",
        "data_categories": ["email"],
        "partner_name": "OpenAI"
    }
)
print(f"Status: {r.status_code}")
print(f"Response: {r.text}")
