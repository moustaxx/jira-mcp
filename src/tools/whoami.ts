import type { Tool } from "./types.ts";

export const whoami: Tool = {
  name: "jira_whoami",
  description:
    "Return the current Jira user (name, email, key). Also serves as a connectivity/auth check.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  async handler(client) {
    const u = await client.get("/rest/api/2/myself");
    return JSON.stringify(
      {
        displayName: u.displayName ?? null,
        email: u.emailAddress ?? null,
        key: u.key ?? u.name ?? null,
      },
      null,
      2,
    );
  },
};
