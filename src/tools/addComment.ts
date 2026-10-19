import type { Tool } from "./types.ts";

export const addComment: Tool = {
  name: "jira_add_comment",
  description:
    "Add a comment to a Jira issue (wiki markup). Write tool: only available when enabled via JIRA_WRITE_TOOLS.",
  inputSchema: {
    type: "object",
    properties: {
      issue_key: { type: "string", description: "Issue key, e.g. PROJ-17619" },
      body: { type: "string", description: "Comment text (Jira wiki markup)" },
    },
    required: ["issue_key", "body"],
    additionalProperties: false,
  },
  async handler(client, args) {
    if (typeof args.body !== "string" || !args.body.trim())
      throw new Error("Comment body must not be empty.");
    const data = await client.post(
      `/rest/api/2/issue/${encodeURIComponent(args.issue_key)}/comment`,
      {
        body: args.body,
      },
    );
    return JSON.stringify(
      {
        key: args.issue_key,
        id: data?.id ?? null,
        author: data?.author?.displayName ?? null,
        created: data?.created ?? null,
      },
      null,
      2,
    );
  },
};