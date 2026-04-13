/**
 * Upstream MCP client — connects the AL proxy to a real upstream MCP server.
 *
 * Supports two transport modes:
 *   stdio — launches the upstream server as a subprocess (default for Claude Desktop / Cursor)
 *   sse   — connects to an upstream server over HTTP SSE (for remote/cloud upstream servers)
 *
 * Environment variables:
 *   UPSTREAM_MCP_MODE     — 'stdio' (default) | 'sse'
 *   UPSTREAM_MCP_COMMAND  — stdio mode: shell command to launch upstream, e.g. 'node /path/dist/index.js'
 *   UPSTREAM_MCP_ARGS     — stdio mode: JSON array of args, e.g. '["--port","3001"]' (optional)
 *   UPSTREAM_MCP_URL      — sse mode: SSE endpoint, e.g. 'http://localhost:3001/sse'
 *   UPSTREAM_MCP_RECONNECT_MS — reconnect delay on disconnect (default 5000)
 */
import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
export interface UpstreamConfig {
    mode: 'stdio' | 'sse';
    command?: string;
    args?: string[];
    url?: string;
    reconnectMs: number;
}
export declare class UpstreamMcpClient {
    private client;
    private config;
    private tools;
    private connected;
    constructor();
    /**
     * Connect to the upstream MCP server and discover its tools.
     * Must be called before the proxy server starts accepting requests.
     */
    connect(): Promise<void>;
    /**
     * List all tools exposed by the upstream server.
     * Returns cached list — refreshed on reconnect.
     */
    listTools(): Tool[];
    /**
     * Forward a tool call to the upstream server.
     * Throws if not connected.
     */
    callTool(name: string, args: Record<string, unknown>): Promise<CallToolResult>;
    /**
     * Gracefully disconnect from the upstream server.
     */
    disconnect(): Promise<void>;
    isConnected(): boolean;
    private createTransport;
}
