import type { Tool } from "./types.ts";

export const search: Tool = {
  name: "jira_search",
  description: "Search Jira issues with a JQL query. Returns key, summary, status, assignee for each match. Extra fields (e.g. custom fields) can be requested via `fields` and are returned raw under `extraFields`.",
  inputSchema: {
    type: "object",
    properties: {
      jql: { type: "string", description: "JQL query, e.g. 'project = PROJ AND status = Open'" },
      limit: { type: "number", description: "Max results (default 25)" },
      fields: {
        type: "array",
        items: { type: "string" },
        description: "Additional field ids to include per issue, e.g. [\"customfield_11513\"] (Deploy Description)",
      },
    },
    required: ["jql"],
    additionalProperties: false,
  },
  async handler(client, args) {
    const limit = typeof args.limit === "number" ? args.limit : 25;
    const extra: string[] = Array.isArray(args.fields) ? args.fields : [];
    const data = await client.get("/rest/api/2/search", {
      jql: args.jql,
      maxResults: limit,
      fields: ["summary,status,assignee", ...extra].join(","),
    });
    const issues = Array.isArray(data.issues) ? data.issues : [];
    const rows = issues.map((it: any) => ({
      key: it.key,
      summary: it.fields?.summary ?? null,
      status: it.fields?.status?.name ?? null,
      assignee: it.fields?.assignee?.displayName ?? null,
      ...(extra.length > 0 && {
        extraFields: Object.fromEntries(extra.map((name) => [name, it.fields?.[name] ?? null])),
      }),
    }));
    return JSON.stringify(rows, null, 2);
  },
};
