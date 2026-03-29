#!/bin/bash
# Profile AD (slow) vs KR (fast) - run multiple requests to capture timing variance.
# Requires instrumented build with [LATENCY] logs. Set RUST_LOG=info before starting API.
# Usage: Run on server after deploying instrumented build, then check logs:
#   docker logs veridion-api 2>&1 | grep LATENCY

echo "Profiling AD (5x) and KR (5x) via localhost..."
for i in 1 2 3 4 5; do
  curl -s -X POST http://localhost:8080/api/v1/shield/evaluate \
    -H 'Authorization: Bearer ss_test_25cc5fc40167da75ea0f34ac8b5a53ca' \
    -H 'Content-Type: application/json' \
    -d '{"destination_country_code":"AD","data_categories":["email","name"],"partner_name":"AWS","agent_id":"agt_875f09beed20","agent_api_key":"agt_key_73e78ef5b9c50f337d7132638fe991dc","purpose":"latency_test"}' > /dev/null
  echo "AD request $i done"
done
for i in 1 2 3 4 5; do
  curl -s -X POST http://localhost:8080/api/v1/shield/evaluate \
    -H 'Authorization: Bearer ss_test_25cc5fc40167da75ea0f34ac8b5a53ca' \
    -H 'Content-Type: application/json' \
    -d '{"destination_country_code":"KR","data_categories":["email","name"],"partner_name":"AWS","agent_id":"agt_875f09beed20","agent_api_key":"agt_key_73e78ef5b9c50f337d7132638fe991dc","purpose":"latency_test"}' > /dev/null
  echo "KR request $i done"
done
echo "Done. Check: docker logs veridion-api 2>&1 | grep LATENCY"
