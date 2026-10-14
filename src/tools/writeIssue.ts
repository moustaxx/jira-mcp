import type { Tool } from "./types.ts";

const FIELDS_DESCRIPTION =
  'Other fields as Jira REST v2 values, keyed by field id, e.g. {"assignee": {"name": "jkowalski"}, "labels": ["backend"], "customfield_11513": "..."}. Use jira_list_fields to find ids.';

function extraFields(args: Record<string, any>): Record<string, any> {
  if (args.fields === undefined) return {};
  if (typeof args.fields !== "object" || args.fields === null || Array.isArray(args.fields)) {
    throw new Error("`fields` must be an object keyed by field id.");
  }
  return args.fields;
}

export const createIssue: Tool = {
  name: "jira_create_issue",
  description:
    'Create a Jira issue. For a sub-task pass fields.parent = {"key": "PROJ-1"}. Write tool: only available when enabled via JIRA_WRITE_TOOLS.',
  inputSchema: {
    type: "object",
    properties: {
      project: { type: "string", description: "Project key, e.g. PROJ" },
      issue_type: { type: "string", description: "Issue type name, e.g. Task, Bug, Sub-task" },
      summary: { type: "string", description: "Issue summary (title)" },
      description: { type: "string", description: "Description (Jira wiki markup)" },
      fields: { type: "object", description: FIELDS_DESCRIPTION },
    },
    required: ["project", "issue_type", "summary"],
    additionalProperties: false,
  },
  async handler(client, args) {
    const fields: Record<string, any> = {
      ...extraFields(args),
      project: { key: args.project },
      issuetype: { name: args.issue_type },
      summary: args.summary,
    };
    if (args.description !== undefined) fields.description = args.description;
    const data = await client.post("/rest/api/2/issue", { fields });
    return JSON.stringify({ key: data?.key ?? null, id: data?.id ?? null }, null, 2);
  },
};

export const updateIssue: Tool = {
  name: "jira_update_issue",
  description:
    "Edit fields of an existing Jira issue (summary, description and any other field by id). Does not change status (use jira_transition_issue). Write tool: only available when enabled via JIRA_WRITE_TOOLS.",
  inputSchema: {
    type: "object",
    properties: {
      issue_key: { type: "string", description: "Issue key, e.g. PROJ-17619" },
      summary: { type: "string", description: "New summary" },
      description: {
        type: "string",
        description: "New description (Jira wiki markup), replaces the current one",
      },
      fields: { type: "object", description: FIELDS_DESCRIPTION },
    },
    required: ["issue_key"],
    additionalProperties: false,
  },
  async handler(client, args) {
    const fields: Record<string, any> = { ...extraFields(args) };
    if (args.summary !== undefined) fields.summary = args.summary;
    if (args.description !== undefined) fields.description = args.description;
    const changed = Object.keys(fields);
    if (changed.length === 0)
      throw new Error("Nothing to update: pass summary, description or fields.");
    await client.put(`/rest/api/2/issue/${encodeURIComponent(args.issue_key)}`, { fields });
    return JSON.stringify({ key: args.issue_key, updated: changed }, null, 2);
  },
};
