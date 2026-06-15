import type { Tool } from "./types.ts";

const FIELDS = "summary,status,assignee,reporter,description,issuetype,priority,created,updated";

export const getIssue: Tool = {
  name: "jira_get_issue",
  description: "Get a Jira issue by key (e.g. PROJ-17619): summary, status, assignee, reporter, type, priority, dates, description.",
  inputSchema: {
    type: "object",
    properties: { issue_key: { type: "string", description: "Issue key, e.g. PROJ-17619" } },
    required: ["issue_key"],
    additionalProperties: false,
  },
  async handler(client, args) {
    const data = await client.get(`/rest/api/2/issue/${encodeURIComponent(args.issue_key)}`, { fields: FIELDS });
    const f = data.fields ?? {};
    return JSON.stringify(
      {
        key: data.key,
        summary: f.summary ?? null,
        status: f.status?.name ?? null,
        assignee: f.assignee?.displayName ?? null,
        reporter: f.reporter?.displayName ?? null,
        type: f.issuetype?.name ?? null,
        priority: f.priority?.name ?? null,
        created: f.created ?? null,
        updated: f.updated ?? null,
        description: f.description ?? null,
      },
      null,
      2,
    );
  },
};
