#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { JiraClient } from "./jiraClient.ts";
import { tools } from "./tools/index.ts";

const baseUrl = process.env.JIRA_BASE_URL;
const pat = process.env.JIRA_PAT;

if (!baseUrl || !pat) {
  console.error("jira-mcp: JIRA_BASE_URL and JIRA_PAT environment variables are required.");
  process.exit(1);
}

const client = new JiraClient({ baseUrl, pat });

const server = new Server(
  { name: "jira-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = tools.find((t) => t.name === req.params.name);
  if (!tool) {
    return { content: [{ type: "text", text: `Unknown tool: ${req.params.name}` }], isError: true };
  }
  try {
    const text = await tool.handler(client, (req.params.arguments ?? {}) as Record<string, any>);
    return { content: [{ type: "text", text }] };
  } catch (e) {
    return { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true };
  }
});

await server.connect(new StdioServerTransport());
console.error("jira-mcp: server started on stdio");
