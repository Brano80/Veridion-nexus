#!/bin/bash
# Test if order matters: KR first, then AD
echo "KR first (5x):"
for i in 1 2 3 4 5; do
  curl -s -w "  %{time_total}s\n" -o /dev/null -X POST http://localhost:8080/api/v1/shield/evaluate \
    -H 'Authorization: Bearer ss_test_25cc5fc40167da75ea0f34ac8b5a53ca' \
    -H 'Content-Type: application/json' \
    -d '{"destination_country_code":"KR","data_categories":["email","name"],"partner_name":"AWS","agent_id":"agt_875f09beed20","agent_api_key":"agt_key_73e78ef5b9c50f337d7132638fe991dc","purpose":"latency_test"}'
done
echo "AD second (5x):"
for i in 1 2 3 4 5; do
  curl -s -w "  %{time_total}s\n" -o /dev/null -X POST http://localhost:8080/api/v1/shield/evaluate \
    -H 'Authorization: Bearer ss_test_25cc5fc40167da75ea0f34ac8b5a53ca' \
    -H 'Content-Type: application/json' \
    -d '{"destination_country_code":"AD","data_categories":["email","name"],"partner_name":"AWS","agent_id":"agt_875f09beed20","agent_api_key":"agt_key_73e78ef5b9c50f337d7132638fe991dc","purpose":"latency_test"}'
done
