#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { JiraClient } from "./jiraClient.ts";
import { enabledTools } from "./tools/index.ts";
import { validateArgs } from "./tools/validate.ts";

const baseUrl = process.env.JIRA_BASE_URL;
const pat = process.env.JIRA_PAT;

if (!baseUrl || !pat) {
  console.error("jira-mcp: JIRA_BASE_URL and JIRA_PAT environment variables are required.");
  process.exit(1);
}

let tools;
try {
  tools = enabledTools(process.env.JIRA_WRITE_TOOLS);
} catch (e) {
  console.error(`jira-mcp: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}

let client: JiraClient;
try {
  client = new JiraClient({ baseUrl, pat });
} catch {
  console.error(`jira-mcp: JIRA_BASE_URL is not a valid URL: ${baseUrl}`);
  process.exit(1);
}

// Resolves to the package root from both src/ and dist/.
const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const server = new Server({ name: "jira-mcp", version }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = tools.find((t) => t.name === req.params.name);
  if (!tool) {
    return { content: [{ type: "text", text: `Unknown tool: ${req.params.name}` }], isError: true };
  }
  try {
    const args = (req.params.arguments ?? {}) as Record<string, any>;
    validateArgs(tool.inputSchema, args);
    const text = await tool.handler(client, args);
    return { content: [{ type: "text", text }] };
  } catch (e) {
    return {
      content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }],
      isError: true,
    };
  }
});

await server.connect(new StdioServerTransport());
console.error("jira-mcp: server started on stdio");
