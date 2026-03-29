#!/usr/bin/env python3
"""
Register 'Blue agent' in Almaco tenant — modelled after BBVA's Blue.

BBVA Blue is an AI-powered virtual assistant for conversational banking in Spain:
- Handles 150+ customer queries, 3000+ interactions
- Voice and text, 24/7, in-app
- Uses NLP/LLM (Dialog Flow, Amazon cloud)
- Financial insights, account balances, ATM locations, transaction summaries
- Spain-focused, EU banking domain
- Partners: BBVA systems, Google, Amazon

Reference: https://www.bbva.com/en/es/innovation/blue-bbvas-new-voice-assistant-in-spain/
"""

import os
import requests

API_BASE = os.environ.get("VERIDION_API_URL", "https://api.veridion-nexus.eu")
API_KEY = "ss_test_25cc5fc40167da75ea0f34ac8b5a53ca"  # Almaco tenant
ENDPOINT = f"{API_BASE}/api/v1/agents"

HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}

# Blue agent payload — same characteristics as BBVA's Blue
BLUE_AGENT = {
    "name": "Blue agent",
    "description": (
        "AI-powered virtual assistant for conversational banking. "
        "Modelled after BBVA Blue - handles 150+ customer queries and 3000+ interactions. "
        "Voice and text, 24/7. Provides financial insights, account info, ATM locations, "
        "transaction summaries. Uses NLP/LLM. Spain-focused, EU banking domain."
    ),
    "version": "1.0.0",
    "url": "https://www.bbva.es/en/general/nueva-relacion-banca/blue.html",
    "provider_org": "BBVA",
    "provider_url": "https://www.bbva.com",
    "allowed_data_categories": [
        "email",
        "name",
        "financial_data",
        "phone_number",
        "user_content",
        "ip_address",
        "behavioral_data",
    ],
    "allowed_destination_countries": [
        "ES",  # Spain — Blue primary market
        "DE", "FR", "IT", "PT",  # EU/EEA
        "GB",  # UK
        "US",  # Cloud providers (Google Dialog Flow, Amazon)
    ],
    "allowed_partners": [
        "BBVA App",
        "Google Dialog Flow",
        "Amazon AWS",
        "BBVA Backend",
    ],
    "policy_metadata": {
        "source": "BBVA Blue",
        "domain": "banking",
        "deployment": "Spain",
        "features": [
            "voice_assistant",
            "text_chat",
            "financial_insights",
            "account_queries",
            "atm_location",
        ],
    },
}


def main():
    print("Registering Blue agent in Almaco tenant...")
    print(f"API: {ENDPOINT}")
    print()

    try:
        r = requests.post(ENDPOINT, json=BLUE_AGENT, headers=HEADERS, timeout=30)
        r.raise_for_status()
        data = r.json()

        agent_id = data.get("agent_id") or data.get("x-veridion", {}).get("agent_id")
        agent_api_key = data.get("agent_api_key")

        print("[OK] Blue agent registered successfully")
        print()
        print("Agent card (summary):")
        print(f"  agent_id:     {agent_id}")
        print(f"  name:         {data.get('name', 'Blue agent')}")
        print(f"  description:  {data.get('description', '')[:80]}...")
        print()
        if agent_api_key:
            print("  agent_api_key (shown once):", agent_api_key[:20] + "..." + agent_api_key[-8:])
            print()
            print("  [WARN] Save the full agent_api_key - it won't be shown again.")
            print("  Rotate via dashboard if lost.")
        print()
        print("Full response:")
        out = {k: v for k, v in data.items() if k != "agent_api_key"}
        if agent_api_key:
            out["agent_api_key"] = agent_api_key
        import json
        print(json.dumps(out, indent=2))

    except requests.RequestException as e:
        print(f"Error: {e}")
        if hasattr(e, "response") and e.response is not None:
            try:
                err = e.response.json()
                print("Response:", err)
            except Exception:
                print("Response:", e.response.text[:500])
        exit(1)


if __name__ == "__main__":
    main()
