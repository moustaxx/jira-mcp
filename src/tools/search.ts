import type { Tool } from "./types.ts";

export const search: Tool = {
  name: "jira_search",
  description: "Search Jira issues with a JQL query. Returns key, summary, status, assignee for each match.",
  inputSchema: {
    type: "object",
    properties: {
      jql: { type: "string", description: "JQL query, e.g. 'project = PROJ AND status = Open'" },
      limit: { type: "number", description: "Max results (default 25)" },
    },
    required: ["jql"],
    additionalProperties: false,
  },
  async handler(client, args) {
    const limit = typeof args.limit === "number" ? args.limit : 25;
    const data = await client.get("/rest/api/2/search", {
      jql: args.jql,
      maxResults: limit,
      fields: "summary,status,assignee",
    });
    const issues = Array.isArray(data.issues) ? data.issues : [];
    const rows = issues.map((it: any) => ({
      key: it.key,
      summary: it.fields?.summary ?? null,
      status: it.fields?.status?.name ?? null,
      assignee: it.fields?.assignee?.displayName ?? null,
    }));
    return JSON.stringify(rows, null, 2);
  },
};
