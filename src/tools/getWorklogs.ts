import type { Tool } from "./types.ts";

export const getWorklogs: Tool = {
  name: "jira_get_worklogs",
  description: "Get work logged on a Jira issue: author, start, time spent, comment per entry, plus the total in seconds.",
  inputSchema: {
    type: "object",
    properties: { issue_key: { type: "string", description: "Issue key, e.g. PROJ-17619" } },
    required: ["issue_key"],
    additionalProperties: false,
  },
  async handler(client, args) {
    const data = await client.get(`/rest/api/2/issue/${encodeURIComponent(args.issue_key)}/worklog`);
    const worklogs = (Array.isArray(data.worklogs) ? data.worklogs : []).map((w: any) => ({
      author: w.author?.displayName ?? null,
      started: w.started ?? null,
      timeSpent: w.timeSpent ?? null,
      timeSpentSeconds: w.timeSpentSeconds ?? 0,
      comment: w.comment || null,
    }));
    const totalSeconds = worklogs.reduce((sum: number, w: any) => sum + w.timeSpentSeconds, 0);
    return JSON.stringify({ totalSeconds, worklogs }, null, 2);
  },
};
