import type { Tool } from "./types.ts";

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function toJiraDateTime(value: string): string {
  const date = new Date(value);
  if (!ISO_DATE_TIME.test(value) || Number.isNaN(date.getTime())) {
    throw new Error(
      "`started` must be an ISO 8601 date-time, e.g. 2026-10-21T09:00 or 2026-10-21T09:00:00+02:00.",
    );
  }
  return date.toISOString().replace("Z", "+0000");
}

export const addWorklog: Tool = {
  name: "jira_add_worklog",
  description:
    "Log work time on a Jira issue. Write tool: only available when enabled via JIRA_WRITE_TOOLS.",
  inputSchema: {
    type: "object",
    properties: {
      issue_key: { type: "string", description: "Issue key, e.g. PROJ-17619" },
      time_spent: {
        type: "string",
        description: 'Time spent in Jira duration format, e.g. "1h 30m", "45m", "1d"',
      },
      started: {
        type: "string",
        description:
          "When the work started, ISO 8601 date-time (without an offset: local time of the server). Defaults to now.",
      },
      comment: { type: "string", description: "Optional work description (Jira wiki markup)" },
    },
    required: ["issue_key", "time_spent"],
    additionalProperties: false,
  },
  async handler(client, args) {
    const timeSpent = typeof args.time_spent === "string" ? args.time_spent.trim() : "";
    if (!timeSpent) throw new Error("`time_spent` must not be empty.");
    const body: Record<string, string> = { timeSpent };
    if (args.started !== undefined) body.started = toJiraDateTime(args.started);
    if (typeof args.comment === "string" && args.comment.trim()) body.comment = args.comment;
    const data = await client.post(
      `/rest/api/2/issue/${encodeURIComponent(args.issue_key)}/worklog`,
      body,
    );
    return JSON.stringify(
      {
        key: args.issue_key,
        id: data?.id ?? null,
        author: data?.author?.displayName ?? null,
        started: data?.started ?? null,
        timeSpent: data?.timeSpent ?? null,
        timeSpentSeconds: data?.timeSpentSeconds ?? null,
      },
      null,
      2,
    );
  },
};