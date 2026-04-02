import { logger } from "../utils/logger.js";

/**
 * MCP over HTTP Client (JSON-RPC 2.0)
 * Allows calling tools on remote MCP servers.
 */
export async function callMcpTool(
  endpoint: string,
  toolName: string,
  args: Record<string, any> = {}
): Promise<any> {
  const requestId = Math.floor(Math.random() * 1000000);
  
  const body = {
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      name: toolName,
      arguments: args
    },
    id: requestId
  };

  logger.debug(`[MCP Client] Calling tool "${toolName}" at ${endpoint}`, { args });

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream"
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000) // 15s timeout
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MCP Error ${response.status}: ${errorText}`);
    }

    const resJson = await response.json() as any;

    if (resJson.error) {
      throw new Error(`MCP RPC Error: ${resJson.error.message} (code: ${resJson.error.code})`);
    }

    return resJson.result;
  } catch (err) {
    logger.error(`[MCP Client] Call failed for "${toolName}":`, (err as Error).message);
    throw err;
  }
}

/**
 * Lists tools available on a remote MCP server.
 */
export async function listMcpTools(endpoint: string): Promise<any[]> {
  const body = {
    jsonrpc: "2.0",
    method: "tools/list",
    params: {},
    id: 1
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream"
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) throw new Error(`MCP Error ${response.status}`);

    const resJson = await response.json() as any;
    return resJson.result?.tools || [];
  } catch (err) {
    logger.error(`[MCP Client] List tools failed at ${endpoint}:`, (err as Error).message);
    return [];
  }
}
