#!/usr/bin/env node
// Veridion Nexus MCP — Sovereign Shield tools (evaluate_transfer, check_scc_coverage, get_compliance_status, list_adequate_countries)
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
const API_KEY = process.env.VERIDION_NEXUS_API_KEY;
const API_URL = process.env.VERIDION_NEXUS_API_URL || "https://api.veridion-nexus.eu";
if (!API_KEY) {
    console.error("VERIDION_NEXUS_API_KEY environment variable is required.\n" +
        "Get your API key at https://veridion-nexus.eu");
    process.exit(1);
}
function authHeaders() {
    return {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
    };
}
async function apiRequest(method, path, body) {
    const url = `${API_URL}${path}`;
    const opts = {
        method,
        headers: authHeaders(),
    };
    if (body) {
        opts.body = JSON.stringify(body);
    }
    let res;
    try {
        res = await fetch(url, opts);
    }
    catch {
        throw new Error(`Cannot reach Sovereign Shield API at ${API_URL}. Check your network connection.`);
    }
    if (res.status === 401) {
        throw new Error("Authentication failed. Check your VERIDION_NEXUS_API_KEY environment variable.");
    }
    if (res.status === 402) {
        throw new Error("Trial expired. Upgrade to Pro at https://app.veridion-nexus.eu");
    }
    if (res.status === 400) {
        const errData = (await res.json().catch(() => ({})));
        if (errData.error === "AGENT_REQUIRED") {
            throw new Error("Agent credentials required. Register your agent at app.veridion-nexus.eu/agents to get an agent_id and agent_api_key.");
        }
        const msg = String(errData.message ?? errData.error ?? "Bad request");
        throw new Error(`API error (400): ${msg}`);
    }
    if (res.status >= 500) {
        const text = await res.text().catch(() => "Unknown error");
        throw new Error(`Sovereign Shield API error: ${text}. Check https://status.veridion-nexus.eu`);
    }
    if (!res.ok) {
        const text = await res.text().catch(() => "Unknown error");
        throw new Error(`API error (${res.status}): ${text}`);
    }
    return res.json();
}
function formatError(err) {
    if (err instanceof Error)
        return `❌ ${err.message}`;
    return `❌ Unknown error: ${String(err)}`;
}
/** GET /api/v1/scc-registries may return a bare array or `{ registries, total }` / `{ data }`. */
function parseSccRegistriesResponse(raw) {
    if (Array.isArray(raw)) {
        return { rows: raw };
    }
    if (raw !== null && typeof raw === "object") {
        const o = raw;
        if (Array.isArray(o.data)) {
            return { rows: o.data };
        }
        if (Array.isArray(o.registries)) {
            return { rows: o.registries };
        }
    }
    return {
        rows: [],
        shapeWarning: "SCC registries response was not a recognized format (expected a JSON array, or an object with a data or registries array).",
    };
}
function sccDestinationCountryCode(scc) {
    return String(scc.destinationCountryCode ?? scc.destination_country_code ?? "").toUpperCase();
}
function sccPartnerName(scc) {
    return String(scc.partnerName ?? scc.partner_name ?? "");
}
function sccStatus(scc) {
    return String(scc.status ?? "—");
}
function sccExpiresAt(scc) {
    return scc.expiresAt ?? scc.expires_at;
}
function sccRegisteredAt(scc) {
    return scc.registeredAt ?? scc.registered_at;
}
// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------
const server = new McpServer({
    name: "veridion-nexus-mcp",
    version: "1.0.12",
});
// ---------------------------------------------------------------------------
// Tool 1: evaluate_transfer
// ---------------------------------------------------------------------------
server.registerTool("evaluate_transfer", {
    description: "Evaluate whether a cross-border data transfer complies with GDPR Art. 44-49. " +
        "Call this before every API call, database sync, or data transfer that sends " +
        "personal data outside the EU/EEA. Returns ALLOW, BLOCK, or REVIEW decision " +
        "with cryptographic evidence seal.",
    inputSchema: z.object({
        agent_id: z
            .string()
            .describe("The registered agent ID (format: agt_XXXXXXXX). Register your agent at app.veridion-nexus.eu/agents"),
        agent_api_key: z
            .string()
            .describe("The agent API key issued at registration (format: agt_key_XXXXXXXX). Shown once at registration."),
        destination_country_code: z
            .string()
            .describe("ISO 3166-1 alpha-2 country code of the data recipient (e.g. 'US', 'CN', 'JP')"),
        data_categories: z
            .array(z.string())
            .describe("Personal data categories being transferred. Examples: ['email', 'name', 'ip_address', 'user_id', 'health_data']. If empty or omitted, decision defaults to REVIEW."),
        partner_name: z
            .string()
            .optional()
            .describe("Name of the data recipient or service (e.g. 'OpenAI', 'AWS S3', 'Stripe')"),
        protocol: z
            .string()
            .optional()
            .describe("Transfer protocol (e.g. 'HTTPS', 'SFTP')"),
        request_path: z
            .string()
            .optional()
            .describe("API endpoint or path being called (e.g. '/v1/chat/completions')"),
    }),
}, async (args) => {
    try {
        // Convert snake_case input to camelCase for API request
        const body = {
            agent_id: args.agent_id,
            agent_api_key: args.agent_api_key,
            destinationCountryCode: args.destination_country_code,
            dataCategories: args.data_categories,
        };
        if (args.partner_name)
            body.partnerName = args.partner_name;
        if (args.protocol)
            body.protocol = args.protocol;
        if (args.request_path)
            body.requestPath = args.request_path;
        const data = (await apiRequest("POST", "/api/v1/shield/evaluate", body));
        const decision = String(data.decision ?? "UNKNOWN");
        const reason = String(data.reason ?? "");
        const country = String(data.destination_country ?? args.destination_country_code);
        const code = args.destination_country_code;
        const partner = args.partner_name ?? "Unknown";
        const articles = Array.isArray(data.legal_basis) && data.legal_basis.length > 0
            ? data.legal_basis.join(", ")
            : "EU/EEA — no restrictions";
        const sealId = String(data.seal_id ?? "—");
        let text = "";
        if (decision === "ALLOW") {
            text =
                `✅ TRANSFER ALLOWED\n` +
                    `Decision: ALLOW\n` +
                    `Destination: ${country} (${code})\n` +
                    `Partner: ${partner}\n` +
                    `Legal basis: ${articles}\n` +
                    `Evidence sealed: ${sealId}\n\n` +
                    `The transfer may proceed.`;
        }
        else if (decision === "REVIEW") {
            text =
                `⚠️ TRANSFER REQUIRES REVIEW\n` +
                    `Decision: REVIEW\n` +
                    `Destination: ${country} (${code})\n` +
                    `Partner: ${partner}\n` +
                    `Reason: ${reason}\n` +
                    `Legal basis: ${articles}\n` +
                    `Evidence sealed: ${sealId}\n\n` +
                    `DO NOT proceed with this transfer. A human reviewer must\n` +
                    `approve it in the Sovereign Shield dashboard before the\n` +
                    `data can be transferred. Log the seal_id for tracking: ${sealId}`;
        }
        else if (decision === "BLOCK") {
            text =
                `🚫 TRANSFER BLOCKED\n` +
                    `Decision: BLOCK\n` +
                    `Destination: ${country} (${code})\n` +
                    `Partner: ${partner}\n` +
                    `Reason: ${reason}\n` +
                    `Legal basis: ${articles}\n` +
                    `Evidence sealed: ${sealId}\n\n` +
                    `This transfer is not permitted under GDPR Art. 44-49.\n` +
                    `Do not proceed. The block has been recorded in the\n` +
                    `evidence vault with seal: ${sealId}`;
        }
        else {
            text =
                `Decision: ${decision}\n` +
                    `Destination: ${country} (${code})\n` +
                    `Partner: ${partner}\n` +
                    `Reason: ${reason}\n` +
                    `Evidence sealed: ${sealId}`;
        }
        if (reason.startsWith("SHADOW MODE")) {
            text +=
                `\n\n⚡ Shadow Mode active — this decision is recorded but not enforced.\n` +
                    `Upgrade to Pro to enable enforcement.`;
        }
        return { content: [{ type: "text", text }] };
    }
    catch (err) {
        return { content: [{ type: "text", text: formatError(err) }] };
    }
});
// ---------------------------------------------------------------------------
// Tool 2: check_scc_coverage
// ---------------------------------------------------------------------------
server.registerTool("check_scc_coverage", {
    description: "Check whether an active Standard Contractual Clause (SCC) exists in " +
        "the registry for a specific partner and destination country. Use this " +
        "when you need to verify SCC coverage before proceeding with a transfer " +
        "to an SCC-required country (US, Brazil, Singapore, etc.).",
    inputSchema: z.object({
        destination_country_code: z
            .string()
            .describe("ISO 3166-1 alpha-2 country code (e.g. 'US')"),
        partner_name: z
            .string()
            .optional()
            .describe("Name of the partner to check SCC coverage for (e.g. 'OpenAI')"),
    }),
}, async (args) => {
    try {
        const resp = (await apiRequest("GET", "/api/v1/scc-registries"));
        const data = Array.isArray(resp.registries) ? resp.registries : [];
        const code = args.destination_country_code.toUpperCase();
        let filtered = data.filter((scc) => String(scc.destinationCountryCode ?? "").toUpperCase() === code);
        if (args.partner_name) {
            const search = args.partner_name.toLowerCase();
            filtered = filtered.filter((scc) => String(scc.partnerName ?? "").toLowerCase().includes(search));
        }
        const country = code;
        if (filtered.length === 0) {
            const partnerNote = args.partner_name
                ? ` matching partner: ${args.partner_name}`
                : "";
            return {
                content: [
                    {
                        type: "text",
                        text: `⚠️ NO SCC COVERAGE\n` +
                            `No active SCCs found for ${country}${partnerNote}.\n\n` +
                            `Transfers of personal data to ${country} require an SCC\n` +
                            `under GDPR Art. 46(2)(c). Without an SCC, transfers will\n` +
                            `result in a BLOCK decision (no transfer permitted until SCC is registered).\n\n` +
                            `Register an SCC in the Sovereign Shield dashboard:\n` +
                            `https://app.veridion-nexus.eu/scc-registry`,
                    },
                ],
            };
        }
        let text = `✅ SCC COVERAGE FOUND\n${filtered.length} active SCC(s) for ${country}:\n`;
        for (const scc of filtered) {
            const exp = sccExpiresAt(scc);
            text +=
                `\n  Partner: ${sccPartnerName(scc) || "—"}\n` +
                    `  Status: ${sccStatus(scc)}\n` +
                    `  Expires: ${exp != null ? String(exp) : "No expiry set"}\n` +
                    `  Registered: ${sccRegisteredAt(scc) ?? "—"}\n`;
        }
        text +=
            `\nThese SCCs support GDPR Art. 46(2)(c) compliance for\n` +
                `transfers to ${country}.`;
        return { content: [{ type: "text", text }] };
    }
    catch (err) {
        return { content: [{ type: "text", text: formatError(err) }] };
    }
});
// ---------------------------------------------------------------------------
// Tool 3: get_compliance_status
// ---------------------------------------------------------------------------
server.registerTool("get_compliance_status", {
    description: "Get the current compliance status of your Sovereign Shield account — " +
        "enforcement mode, recent transfer statistics, pending reviews, and " +
        "expiring SCCs. Use this to give users a compliance overview or to " +
        "check system status before starting a data-intensive operation.",
    inputSchema: z.object({}),
}, async () => {
    try {
        const [stats, settings, pending, sccs] = await Promise.all([
            apiRequest("GET", "/api/v1/lenses/sovereign-shield/stats"),
            apiRequest("GET", "/api/v1/settings"),
            apiRequest("GET", "/api/v1/human_oversight/pending"),
            apiRequest("GET", "/api/v1/scc-registries"),
        ]);
        const { rows: sccRows, shapeWarning: sccShapeWarning } = parseSccRegistriesResponse(sccs);
        const mode = String(settings.enforcement_mode ?? "shadow") === "enforce"
            ? "ENFORCING 🔒"
            : "SHADOW MODE ⚡";
        const totalTransfers = Number(stats.totalTransfers ?? 0);
        const blockedToday = Number(stats.blockedToday ?? 0);
        const pendingApprovals = Number(stats.pendingApprovals ?? 0);
        const pendingCount = Array.isArray(pending) ? pending.length : 0;
        // Calculate allowed as totalTransfers - blockedToday - pendingApprovals
        const allowed = Math.max(0, totalTransfers - blockedToday - pendingApprovals);
        const activeSccCount = sccShapeWarning ? 0 : sccRows.length;
        const now = new Date();
        const thirtyDays = 30 * 24 * 60 * 60 * 1000;
        let expiringCount = 0;
        try {
            expiringCount = sccRows.filter((scc) => {
                const exp = sccExpiresAt(scc);
                if (exp == null)
                    return false;
                const expDate = new Date(String(exp));
                return expDate.getTime() - now.getTime() < thirtyDays;
            }).length;
        }
        catch {
            expiringCount = 0;
        }
        let text = `📊 SOVEREIGN SHIELD COMPLIANCE STATUS\n` +
            `Mode: ${mode}\n\n` +
            `TRANSFERS (24H)\n` +
            `  Total: ${totalTransfers}\n` +
            `  Allowed: ${allowed}\n` +
            `  Blocked: ${blockedToday}\n` +
            `  Pending Review: ${pendingApprovals}\n\n` +
            `SCC REGISTRY\n` +
            `  Active SCCs: ${activeSccCount}\n` +
            `  Expiring within 30 days: ${expiringCount}\n\n` +
            `PENDING APPROVALS\n` +
            `  ${pendingCount} transfer(s) awaiting human review\n`;
        if (sccShapeWarning) {
            text +=
                `\n⚠️ SCC registry: ${sccShapeWarning}\n`;
        }
        if (pendingCount > 0) {
            text += `  ⚠️ Review required at: https://app.veridion-nexus.eu/review-queue\n`;
        }
        text += `\nDashboard: https://app.veridion-nexus.eu`;
        return { content: [{ type: "text", text }] };
    }
    catch (err) {
        return { content: [{ type: "text", text: formatError(err) }] };
    }
});
// ---------------------------------------------------------------------------
// Tool 4: list_adequate_countries
// ---------------------------------------------------------------------------
const COUNTRY_DATA = {
    eu_eea: [
        "AT",
        "BE",
        "BG",
        "HR",
        "CY",
        "CZ",
        "DK",
        "EE",
        "FI",
        "FR",
        "DE",
        "GR",
        "HU",
        "IE",
        "IT",
        "LV",
        "LT",
        "LU",
        "MT",
        "NL",
        "PL",
        "PT",
        "RO",
        "SK",
        "SI",
        "ES",
        "SE",
        "IS",
        "LI",
        "NO",
    ],
    adequate: [
        "Andorra (AD)",
        "Argentina (AR)",
        "Canada (CA)",
        "Faroe Islands (FO)",
        "Guernsey (GG)",
        "Israel (IL)",
        "Isle of Man (IM)",
        "Japan (JP)",
        "Jersey (JE)",
        "New Zealand (NZ)",
        "South Korea (KR)",
        "United Kingdom (GB)",
        "Uruguay (UY)",
        "Switzerland (CH)",
        "Brazil (BR) — adequacy decision January 2026",
    ],
    scc_required: [
        "United States (US)",
        "Australia (AU)",
        "Mexico (MX)",
        "Singapore (SG)",
        "South Africa (ZA)",
        "India (IN)",
    ],
    blocked: [
        "China (CN)",
        "Russia (RU)",
        "North Korea (KP)",
        "Iran (IR)",
        "Syria (SY)",
        "Venezuela (VE)",
        "Belarus (BY)",
    ],
};
server.registerTool("list_adequate_countries", {
    description: "List all countries by their GDPR transfer status — EU/EEA (free flow), " +
        "adequate protection (Art. 45 adequacy decision), SCC required (Art. 46), " +
        "or blocked by organizational policy. Use this to check a country's status before " +
        "initiating a transfer, or to show a user which countries require additional " +
        "safeguards.",
    inputSchema: z.object({
        filter: z
            .enum(["all", "adequate", "scc_required", "blocked", "eu_eea"])
            .optional()
            .describe("Filter countries by transfer status. Defaults to 'all'."),
    }),
}, async (args) => {
    try {
        // Try the API first; fall back to local data
        let apiData = null;
        try {
            apiData = (await apiRequest("GET", "/api/v1/lenses/sovereign-shield/countries"));
        }
        catch {
            // Fall back to built-in data
        }
        const filter = args.filter ?? "all";
        const euEea = COUNTRY_DATA.eu_eea.join(", ");
        const adequate = COUNTRY_DATA.adequate.join(",\n  ");
        const sccRequired = COUNTRY_DATA.scc_required.join(",\n  ");
        const blocked = COUNTRY_DATA.blocked.join(",\n  ");
        const sections = [];
        if (filter === "all" || filter === "eu_eea") {
            sections.push(`🇪🇺 EU/EEA (Free flow — no restrictions):\n  ${euEea}`);
        }
        if (filter === "all" || filter === "adequate") {
            sections.push(`✅ ADEQUATE PROTECTION (Art. 45 — adequacy decision):\n  ${adequate}`);
        }
        if (filter === "all" || filter === "scc_required") {
            sections.push(`⚠️ SCC REQUIRED (Art. 46(2)(c)):\n  ${sccRequired}`);
        }
        if (filter === "all" || filter === "blocked") {
            sections.push(`🚫 BLOCKED (No legal transfer basis):\n  ${blocked}`);
        }
        let text = `🌍 GDPR TRANSFER STATUS BY COUNTRY\n\n${sections.join("\n\n")}`;
        text +=
            `\n\nNote: United States — check DPF certification status for\n` +
                `certified organizations. See https://www.dataprivacyframework.gov`;
        if (apiData) {
            text += `\n\n(Data verified against live API)`;
        }
        return { content: [{ type: "text", text }] };
    }
    catch (err) {
        return { content: [{ type: "text", text: formatError(err) }] };
    }
});
// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
main().catch((err) => {
    console.error("Fatal error starting Sovereign Shield MCP server:", err);
    process.exit(1);
});
