import { test } from "node:test";
import assert from "node:assert/strict";
import { JiraClient } from "../src/jiraClient.ts";
import { whoami } from "../src/tools/whoami.ts";

function clientReturning(body: any, captured?: { url?: string }) {
  return new JiraClient({
    baseUrl: "https://jira.example.test",
    pat: "t",
    fetchImpl: async (url: string) => {
      if (captured) captured.url = url;
      return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as any;
    },
  });
}

test("jira_whoami hits /myself and returns user fields", async () => {
  const cap: any = {};
  const client = clientReturning({ displayName: "Marek B", emailAddress: "m@b.pl", key: "mbedna" }, cap);
  const out = await whoami.handler(client, {});
  assert.match(cap.url, /\/rest\/api\/2\/myself$/);
  assert.match(out, /Marek B/);
  assert.match(out, /m@b\.pl/);
});
