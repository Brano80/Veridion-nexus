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

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export interface UpstreamConfig {
  mode: 'stdio' | 'sse';
  // stdio
  command?: string;
  args?: string[];
  // sse
  url?: string;
  reconnectMs: number;
}

function getUpstreamConfig(): UpstreamConfig {
  const mode = (process.env.UPSTREAM_MCP_MODE ?? 'stdio') as 'stdio' | 'sse';
  const reconnectMs = parseInt(process.env.UPSTREAM_MCP_RECONNECT_MS ?? '5000', 10);

  if (mode === 'sse') {
    const url = process.env.UPSTREAM_MCP_URL;
    if (!url) throw new Error('UPSTREAM_MCP_URL must be set when UPSTREAM_MCP_MODE=sse');
    return { mode, url, reconnectMs };
  }

  // stdio mode
  const command = process.env.UPSTREAM_MCP_COMMAND;
  if (!command) {
    throw new Error(
      'UPSTREAM_MCP_COMMAND must be set when UPSTREAM_MCP_MODE=stdio.\n' +
      'Example: UPSTREAM_MCP_COMMAND="node /path/to/upstream/dist/index.js"',
    );
  }

  let args: string[] = [];
  if (process.env.UPSTREAM_MCP_ARGS) {
    try {
      args = JSON.parse(process.env.UPSTREAM_MCP_ARGS);
    } catch {
      throw new Error('UPSTREAM_MCP_ARGS must be a valid JSON array, e.g. \'["--port","3001"]\'');
    }
  }

  return { mode, command, args, reconnectMs };
}

export class UpstreamMcpClient {
  private client: Client | null = null;
  private config: UpstreamConfig;
  private tools: Tool[] = [];
  private connected = false;

  constructor() {
    this.config = getUpstreamConfig();
  }

  /**
   * Connect to the upstream MCP server and discover its tools.
   * Must be called before the proxy server starts accepting requests.
   */
  async connect(): Promise<void> {
    this.client = new Client(
      { name: 'accountability-ledger-upstream-client', version: '0.1.0' },
      { capabilities: {} },
    );

    const transport = this.createTransport();

    // Handle unexpected disconnects — attempt reconnect
    transport.onclose = () => {
      this.connected = false;
      this.tools = [];
      console.error(
        `[AL Upstream] Upstream MCP disconnected. Reconnecting in ${this.config.reconnectMs}ms…`,
      );
      setTimeout(() => this.connect().catch(console.error), this.config.reconnectMs);
    };

    transport.onerror = (err) => {
      console.error('[AL Upstream] Transport error:', err);
    };

    await this.client.connect(transport);
    this.connected = true;

    // Discover upstream tools
    const result = await this.client.listTools();
    this.tools = result.tools;

    console.error(
      `[AL Upstream] Connected (${this.config.mode}). ` +
      `Upstream tools: ${this.tools.map((t) => t.name).join(', ') || '(none)'}`,
    );
  }

  /**
   * List all tools exposed by the upstream server.
   * Returns cached list — refreshed on reconnect.
   */
  listTools(): Tool[] {
    return this.tools;
  }

  /**
   * Forward a tool call to the upstream server.
   * Throws if not connected.
   */
  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    if (!this.client || !this.connected) {
      throw new Error(
        `[AL Upstream] Cannot call tool '${name}': upstream MCP server is not connected.`,
      );
    }

    const result = await this.client.callTool({ name, arguments: args });

    // The SDK returns CallToolResult — pass through as-is
    return result as CallToolResult;
  }

  /**
   * Gracefully disconnect from the upstream server.
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.connected = false;
      this.tools = [];
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  // ── Transport factory ─────────────────────────────────────────────────────

  private createTransport(): StdioClientTransport | SSEClientTransport {
    if (this.config.mode === 'sse') {
      return new SSEClientTransport(new URL(this.config.url!));
    }

    // stdio: split command into executable + args
    const parts = this.config.command!.split(' ');
    const executable = parts[0]!;
    const commandArgs = [...parts.slice(1), ...(this.config.args ?? [])];

    return new StdioClientTransport({
      command: executable,
      args: commandArgs,
      env: {
        ...process.env as Record<string, string>,
      },
    });
  }
}
