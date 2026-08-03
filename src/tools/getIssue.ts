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
  description: "Get a Jira issue by key (e.g. PROJ-17619): summary, status, assignee, reporter, type, priority, dates, description, attachments, plus linked issues, parent and subtasks.",
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
      },
      null,
      2,
    );
  },
};
