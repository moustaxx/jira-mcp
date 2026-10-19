import type { Tool } from "./types.ts";

export const getComments: Tool = {
  name: "jira_get_comments",
  description: "Get the comments on a Jira issue (author, created timestamp, body).",
  inputSchema: {
    type: "object",
    properties: { issue_key: { type: "string", description: "Issue key, e.g. PROJ-17619" } },
    required: ["issue_key"],
    additionalProperties: false,
  },
  async handler(client, args) {
    const data = await client.get(
      `/rest/api/2/issue/${encodeURIComponent(args.issue_key)}/comment`,
    );
    const comments = Array.isArray(data.comments) ? data.comments : [];
    const rows = comments.map((c: any) => ({
      author: c.author?.displayName ?? null,
      created: c.created ?? null,
      body: c.body ?? null,
    }));
    return JSON.stringify(rows, null, 2);
  },
};