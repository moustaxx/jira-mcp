import type { Tool } from "./types.ts";

function matches(query: string | undefined, id: string, name: string | null): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return id.toLowerCase().includes(q) || (name ?? "").toLowerCase().includes(q);
}

export const listFields: Tool = {
  name: "jira_list_fields",
  description:
    "List Jira fields (id, name, custom, type) to find ids for jira_get_issue `fields`. With issue_key, lists only fields that have a value on that issue. Optional query filters by name or id (case-insensitive substring).",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Filter by field name or id, e.g. \"deploy\"" },
      issue_key: { type: "string", description: "Only fields set on this issue, e.g. PROJ-18710" },
    },
    additionalProperties: false,
  },
  async handler(client, args) {
    if (args.issue_key) {
      const data = await client.get(`/rest/api/2/issue/${encodeURIComponent(args.issue_key)}`, {
        fields: "*all",
        expand: "names",
      });
      const values = data.fields ?? {};
      const names = data.names ?? {};
      const result = Object.keys(values)
        .filter((id) => values[id] !== null && !(Array.isArray(values[id]) && values[id].length === 0))
        .map((id) => ({ id, name: names[id] ?? null, custom: id.startsWith("customfield_") }))
        .filter((f) => matches(args.query, f.id, f.name))
        .sort((a, b) => a.id.localeCompare(b.id));
      return JSON.stringify(result, null, 2);
    }

    const fields: any[] = await client.get("/rest/api/2/field");
    const result = fields
      .map((f) => ({ id: f.id, name: f.name ?? null, custom: Boolean(f.custom), type: f.schema?.type ?? null }))
      .filter((f) => matches(args.query, f.id, f.name))
      .sort((a, b) => a.id.localeCompare(b.id));
    return JSON.stringify(result, null, 2);
  },
};
