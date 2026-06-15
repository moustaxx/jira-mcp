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

import { getIssue } from "../src/tools/getIssue.ts";

test("jira_get_issue fetches issue and flattens fields", async () => {
  const cap: any = {};
  const client = clientReturning(
    {
      key: "PROJ-17619",
      fields: {
        summary: "Fix checkout",
        status: { name: "In Progress" },
        assignee: { displayName: "Anna K" },
        reporter: { displayName: "Marek B" },
        issuetype: { name: "Bug" },
        priority: { name: "High" },
        created: "2026-06-01T10:00:00.000+0000",
        updated: "2026-06-10T12:00:00.000+0000",
        description: "details",
      },
    },
    cap,
  );
  const out = await getIssue.handler(client, { issue_key: "PROJ-17619" });
  assert.match(cap.url, /\/rest\/api\/2\/issue\/PROJ-17619\?/);
  const parsed = JSON.parse(out);
  assert.equal(parsed.key, "PROJ-17619");
  assert.equal(parsed.status, "In Progress");
  assert.equal(parsed.assignee, "Anna K");
  assert.equal(parsed.type, "Bug");
});

import { search } from "../src/tools/search.ts";

test("jira_search posts jql and maps issue list", async () => {
  const cap: any = {};
  const client = clientReturning(
    {
      issues: [
        { key: "PROJ-1", fields: { summary: "A", status: { name: "Open" }, assignee: { displayName: "X" } } },
        { key: "PROJ-2", fields: { summary: "B", status: { name: "Done" }, assignee: null } },
      ],
    },
    cap,
  );
  const out = await search.handler(client, { jql: "project = PROJ", limit: 10 });
  assert.match(cap.url, /\/rest\/api\/2\/search\?/);
  assert.match(decodeURIComponent(cap.url), /jql=project = PROJ/);
  assert.match(cap.url, /maxResults=10/);
  const parsed = JSON.parse(out);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].key, "PROJ-1");
  assert.equal(parsed[1].assignee, null);
});

test("jira_search defaults limit to 25", async () => {
  const cap: any = {};
  const client = clientReturning({ issues: [] }, cap);
  await search.handler(client, { jql: "x" });
  assert.match(cap.url, /maxResults=25/);
});

import { getComments } from "../src/tools/getComments.ts";

test("jira_get_comments fetches comments endpoint and maps fields", async () => {
  const cap: any = {};
  const client = clientReturning(
    { comments: [{ author: { displayName: "Anna K" }, created: "2026-06-02T09:00:00.000+0000", body: "Looks good" }] },
    cap,
  );
  const out = await getComments.handler(client, { issue_key: "PROJ-17619" });
  assert.match(cap.url, /\/rest\/api\/2\/issue\/PROJ-17619\/comment$/);
  const parsed = JSON.parse(out);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].author, "Anna K");
  assert.equal(parsed[0].body, "Looks good");
});

import { getTransitions } from "../src/tools/getTransitions.ts";

test("jira_get_transitions lists available transitions", async () => {
  const cap: any = {};
  const client = clientReturning(
    { transitions: [{ id: "21", name: "Start Progress", to: { name: "In Progress" } }] },
    cap,
  );
  const out = await getTransitions.handler(client, { issue_key: "PROJ-17619" });
  assert.match(cap.url, /\/rest\/api\/2\/issue\/PROJ-17619\/transitions$/);
  const parsed = JSON.parse(out);
  assert.equal(parsed[0].id, "21");
  assert.equal(parsed[0].to, "In Progress");
});
