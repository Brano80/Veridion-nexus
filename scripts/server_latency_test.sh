#!/bin/bash
for code in AD AR BR CA FO GG IL IM JP JE NZ KR CH GB UY; do
  result=$(curl -s -w '\n%{time_total}' -X POST http://localhost:8080/api/v1/shield/evaluate \
    -H 'Authorization: Bearer ss_test_25cc5fc40167da75ea0f34ac8b5a53ca' \
    -H 'Content-Type: application/json' \
    -d "{\"destination_country_code\":\"$code\",\"data_categories\":[\"email\",\"name\"],\"partner_name\":\"AWS\",\"agent_id\":\"agt_875f09beed20\",\"agent_api_key\":\"agt_key_73e78ef5b9c50f337d7132638fe991dc\",\"purpose\":\"latency_test\"}")
  latency=$(echo "$result" | tail -1)
  ms=$(echo "$latency * 1000" | bc)
  echo "Country: $code | Latency: ${ms}ms"
done
