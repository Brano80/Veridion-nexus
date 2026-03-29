import requests

r = requests.post(
    "https://api.veridion-nexus.eu/api/v1/shield/evaluate",
    headers={
        "Authorization": "Bearer ss_test_25cc5fc40167da75ea0f34ac8b5a53ca",
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
