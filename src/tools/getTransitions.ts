import type { Tool } from "./types.ts";

export const getTransitions: Tool = {
  name: "jira_get_transitions",
  description:
    "List the workflow transitions currently available for an issue (read-only): id, name, target status.",
  inputSchema: {
    type: "object",
    properties: { issue_key: { type: "string", description: "Issue key, e.g. PROJ-17619" } },
    required: ["issue_key"],
    additionalProperties: false,
  },
  async handler(client, args) {
    const data = await client.get(
      `/rest/api/2/issue/${encodeURIComponent(args.issue_key)}/transitions`,
    );
    const transitions = Array.isArray(data.transitions) ? data.transitions : [];
    const rows = transitions.map((t: any) => ({ id: t.id, name: t.name, to: t.to?.name ?? null }));
    return JSON.stringify(rows, null, 2);
  },
};
