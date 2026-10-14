import type { Tool } from "./types.ts";

export const getChangelog: Tool = {
  name: "jira_get_changelog",
  description:
    'Get the change history of a Jira issue: who changed which field, when, from what to what (oldest first). Optional field filters by field name or id (case-insensitive), e.g. "status" or "customfield_11513".',
  inputSchema: {
    type: "object",
    properties: {
      issue_key: { type: "string", description: "Issue key, e.g. PROJ-17619" },
      field: {
        type: "string",
        description: 'Only changes of this field (name or id), e.g. "status"',
      },
    },
    required: ["issue_key"],
    additionalProperties: false,
  },
  async handler(client, args) {
    const data = await client.get(`/rest/api/2/issue/${encodeURIComponent(args.issue_key)}`, {
      fields: "summary",
      expand: "changelog",
    });
    const histories: any[] = Array.isArray(data.changelog?.histories)
      ? data.changelog.histories
      : [];
    const wanted = typeof args.field === "string" ? args.field.toLowerCase() : null;
    const rows = histories.flatMap((h) =>
      (Array.isArray(h.items) ? h.items : [])
        .filter(
          (i: any) =>
            !wanted ||
            String(i.field ?? "").toLowerCase() === wanted ||
            String(i.fieldId ?? "").toLowerCase() === wanted,
        )
        .map((i: any) => ({
          created: h.created ?? null,
          author: h.author?.displayName ?? null,
          field: i.field ?? null,
          fieldId: i.fieldId ?? null,
          from: i.fromString ?? i.from ?? null,
          to: i.toString ?? i.to ?? null,
        })),
    );
    // Jira returns histories oldest first; string sorting would break on mixed timezone offsets.
    return JSON.stringify(rows, null, 2);
  },
};
