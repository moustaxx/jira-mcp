import type { JiraClient } from "../jiraClient.ts";
import type { Tool } from "./types.ts";

// Undocumented Jira Software endpoint behind the issue "Development" panel.
const DEV_STATUS = "/rest/dev-status/1.0/issue";

async function devDetail(
  client: JiraClient,
  issueId: string,
  applicationType: string,
  dataType: string,
) {
  const data = await client.get(`${DEV_STATUS}/detail`, { issueId, applicationType, dataType });
  return Array.isArray(data.detail) ? data.detail : [];
}

export const getDevInfo: Tool = {
  name: "jira_get_dev_info",
  description:
    "Get development info linked to a Jira issue: merge/pull requests and branches from the Development panel (dev-status, e.g. GitLab integration) plus remote links. Sources that fail are reported under `errors` instead of failing the call.",
  inputSchema: {
    type: "object",
    properties: { issue_key: { type: "string", description: "Issue key, e.g. PROJ-18710" } },
    required: ["issue_key"],
    additionalProperties: false,
  },
  async handler(client, args) {
    const key = encodeURIComponent(args.issue_key);
    const issue = await client.get(`/rest/api/2/issue/${key}`, { fields: "summary" });
    const errors: string[] = [];

    let remoteLinks: any[] = [];
    try {
      const links = await client.get(`/rest/api/2/issue/${key}/remotelink`);
      remoteLinks = (Array.isArray(links) ? links : []).map((l: any) => ({
        title: l.object?.title ?? null,
        url: l.object?.url ?? null,
        relationship: l.relationship ?? null,
        application: l.application?.name ?? l.application?.type ?? null,
      }));
    } catch (e: any) {
      errors.push(`remotelink: ${e.message}`);
    }

    const pullRequests: any[] = [];
    const branches: any[] = [];
    try {
      const summary = await client.get(`${DEV_STATUS}/summary`, { issueId: issue.id });
      const s = summary.summary ?? {};
      const types = new Set([
        ...Object.keys(s.pullrequest?.byInstanceType ?? {}),
        ...Object.keys(s.branch?.byInstanceType ?? {}),
      ]);
      for (const type of types) {
        try {
          for (const d of await devDetail(client, issue.id, type, "pullrequest")) {
            for (const pr of d.pullRequests ?? []) {
              pullRequests.push({
                id: pr.id ?? null,
                title: pr.name ?? null,
                status: pr.status ?? null,
                url: pr.url ?? null,
                sourceBranch: pr.source?.branch ?? null,
                targetBranch: pr.destination?.branch ?? null,
                repository: pr.repositoryName ?? null,
                author: pr.author?.name ?? null,
                lastUpdate: pr.lastUpdate ?? null,
              });
            }
          }
          for (const d of await devDetail(client, issue.id, type, "branch")) {
            for (const b of d.branches ?? []) {
              branches.push({
                name: b.name ?? null,
                url: b.url ?? null,
                repository: b.repository?.name ?? null,
              });
            }
          }
        } catch (e: any) {
          errors.push(`dev-status ${type}: ${e.message}`);
        }
      }
    } catch (e: any) {
      errors.push(`dev-status: ${e.message}`);
    }

    return JSON.stringify(
      { key: issue.key, pullRequests, branches, remoteLinks, ...(errors.length > 0 && { errors }) },
      null,
      2,
    );
  },
};