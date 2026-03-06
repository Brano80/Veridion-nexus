#!/usr/bin/env node
/**
 * Test client for Sovereign Shield API endpoints
 *
 * This script directly calls the Sovereign Shield API endpoints
 * (not via MCP stdio) to verify the tools work correctly.
 *
 * Usage: npx ts-node --esm test-client.ts
 */
const API_URL = "http://localhost:8080";
const API_KEY = "ss_test_admin_dev_key_12345678901234";
async function apiRequest(method, path, body) {
    const url = `${API_URL}${path}`;
    const opts = {
        method,
        headers: {
            Authorization: `Bearer ${API_KEY}`,
            "Content-Type": "application/json",
        },
    };
    if (body) {
        opts.body = JSON.stringify(body);
    }
    console.log(`\n${method} ${url}`);
    if (body) {
        console.log("Request body:", JSON.stringify(body, null, 2));
    }
    try {
        const res = await fetch(url, opts);
        const text = await res.text();
        console.log(`Status: ${res.status} ${res.statusText}`);
        let json;
        try {
            json = JSON.parse(text);
        }
        catch {
            console.log("Response (not JSON):", text);
            return text;
        }
        console.log("Response JSON:");
        console.log(JSON.stringify(json, null, 2));
        return json;
    }
    catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
}
async function main() {
    console.log("=".repeat(60));
    console.log("Sovereign Shield API Test Client");
    console.log("=".repeat(60));
    console.log(`API URL: ${API_URL}`);
    console.log(`API Key: ${API_KEY.substring(0, 20)}...`);
    try {
        // Test 1: Evaluate transfer
        console.log("\n" + "=".repeat(60));
        console.log("TEST 1: POST /api/v1/shield/evaluate");
        console.log("=".repeat(60));
        await apiRequest("POST", "/api/v1/shield/evaluate", {
            destination_country_code: "US",
            data_categories: ["email", "name"],
            partner_name: "OpenAI",
        });
        // Test 2: Get SCC registries
        console.log("\n" + "=".repeat(60));
        console.log("TEST 2: GET /api/v1/scc-registries");
        console.log("=".repeat(60));
        await apiRequest("GET", "/api/v1/scc-registries");
        // Test 3: Get compliance stats
        console.log("\n" + "=".repeat(60));
        console.log("TEST 3: GET /api/v1/lenses/sovereign-shield/stats");
        console.log("=".repeat(60));
        await apiRequest("GET", "/api/v1/lenses/sovereign-shield/stats");
        console.log("\n" + "=".repeat(60));
        console.log("All tests completed!");
        console.log("=".repeat(60));
    }
    catch (error) {
        console.error("\n" + "=".repeat(60));
        console.error("Test failed with error:");
        console.error(error);
        console.error("=".repeat(60));
        process.exit(1);
    }
}
main();
export {};
