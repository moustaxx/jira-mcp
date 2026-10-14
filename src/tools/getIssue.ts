import type { Tool } from "./types.ts";

const FIELDS =
  "summary,status,assignee,reporter,description,issuetype,priority,created,updated,attachment,issuelinks,subtasks,parent";

function issueRef(issue: any) {
  return {
    key: issue.key,
    summary: issue.fields?.summary ?? null,
    status: issue.fields?.status?.name ?? null,
    type: issue.fields?.issuetype?.name ?? null,
  };
}

export const getIssue: Tool = {
  name: "jira_get_issue",
  description: "Get a Jira issue by key (e.g. PROJ-17619): summary, status, assignee, reporter, type, priority, dates, description, attachments, plus linked issues, parent and subtasks. Extra fields (e.g. custom fields) can be requested via `fields` and are returned raw under `extraFields`.",
  inputSchema: {
    type: "object",
    properties: {
      issue_key: { type: "string", description: "Issue key, e.g. PROJ-17619" },
      fields: {
        type: "array",
        items: { type: "string" },
        description: "Additional field ids to include, e.g. [\"customfield_11513\"] (Deploy Description)",
      },
    },
    required: ["issue_key"],
    additionalProperties: false,
  },
  async handler(client, args) {
    const extra: string[] = Array.isArray(args.fields) ? args.fields : [];
    const data = await client.get(`/rest/api/2/issue/${encodeURIComponent(args.issue_key)}`, {
      fields: [FIELDS, ...extra].join(","),
    });
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
        attachments: Array.isArray(f.attachment)
          ? f.attachment.map((a: any) => ({
              id: a.id,
              filename: a.filename,
              mimeType: a.mimeType ?? null,
              size: a.size ?? null,
            }))
          : [],
        parent: f.parent ? issueRef(f.parent) : null,
        subtasks: Array.isArray(f.subtasks) ? f.subtasks.map(issueRef) : [],
        links: Array.isArray(f.issuelinks)
          ? f.issuelinks.map((l: any) => {
              const outward = Boolean(l.outwardIssue);
              const linked = outward ? l.outwardIssue : l.inwardIssue;
              return {
                linkType: l.type?.name ?? null,
                direction: outward ? "outward" : "inward",
                relation: (outward ? l.type?.outward : l.type?.inward) ?? null,
                ...issueRef(linked ?? {}),
              };
            })
          : [],
        ...(extra.length > 0 && {
          extraFields: Object.fromEntries(extra.map((name) => [name, f[name] ?? null])),
        }),
      },
      null,
      2,
    );
  },
};
