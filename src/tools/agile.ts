import type { JiraClient } from "../jiraClient.ts";
import type { Tool } from "./types.ts";

const AGILE = "/rest/agile/1.0";
// Safety cap: boards with years of closed sprints can have hundreds of pages.
const MAX_PAGES = 20;

async function fetchAll(
  client: JiraClient,
  path: string,
  query: Record<string, string | undefined>,
) {
  const values: any[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await client.get(path, { ...query, startAt: values.length, maxResults: 50 });
    const batch = Array.isArray(data.values) ? data.values : [];
    values.push(...batch);
    if (data.isLast !== false || batch.length === 0) break;
  }
  return values;
}

export const listBoards: Tool = {
  name: "jira_list_boards",
  description:
    "List Jira Software boards (id, name, type, project). Use the id with jira_list_sprints.",
  inputSchema: {
    type: "object",
    properties: {
      project: { type: "string", description: "Only boards of this project key, e.g. PROJ" },
      name: { type: "string", description: "Only boards whose name contains this text" },
    },
    additionalProperties: false,
  },
  async handler(client, args) {
    const boards = await fetchAll(client, `${AGILE}/board`, {
      projectKeyOrId: args.project,
      name: args.name,
    });
    const rows = boards.map((b: any) => ({
      id: b.id,
      name: b.name ?? null,
      type: b.type ?? null,
      project: b.location?.projectKey ?? null,
    }));
    return JSON.stringify(rows, null, 2);
  },
};

export const listSprints: Tool = {
  name: "jira_list_sprints",
  description:
    "List sprints of a Jira Software board (id, name, state, dates, goal). Default state is active,future. Get sprint issues with jira_search and JQL 'sprint = <id>'.",
  inputSchema: {
    type: "object",
    properties: {
      board_id: { type: "number", description: "Board id from jira_list_boards" },
      state: {
        type: "string",
        description: "Comma-separated: active, future, closed (default active,future)",
      },
    },
    required: ["board_id"],
    additionalProperties: false,
  },
  async handler(client, args) {
    const sprints = await fetchAll(
      client,
      `${AGILE}/board/${encodeURIComponent(args.board_id)}/sprint`,
      {
        state: args.state ?? "active,future",
      },
    );
    const rows = sprints.map((s: any) => ({
      id: s.id,
      name: s.name ?? null,
      state: s.state ?? null,
      startDate: s.startDate ?? null,
      endDate: s.endDate ?? null,
      completeDate: s.completeDate ?? null,
      goal: s.goal || null,
    }));
    return JSON.stringify(rows, null, 2);
  },
};