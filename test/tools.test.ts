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

test("jira_get_issue maps issue links, parent and subtasks", async () => {
  const cap: any = {};
  const client = clientReturning(
    {
      key: "PROJ-17619",
      fields: {
        summary: "Fix checkout",
        parent: { key: "PROJ-17000", fields: { summary: "Checkout epic", status: { name: "Open" }, issuetype: { name: "Epic" } } },
        subtasks: [
          { key: "PROJ-17620", fields: { summary: "Sub A", status: { name: "Done" }, issuetype: { name: "Sub-task" } } },
        ],
        issuelinks: [
          {
            type: { name: "Blocks", inward: "is blocked by", outward: "blocks" },
            outwardIssue: { key: "PROJ-17700", fields: { summary: "Deploy", status: { name: "Open" }, issuetype: { name: "Task" } } },
          },
          {
            type: { name: "Relates", inward: "relates to", outward: "relates to" },
            inwardIssue: { key: "PROJ-17500", fields: { summary: "Old bug", status: { name: "Closed" }, issuetype: { name: "Bug" } } },
          },
        ],
      },
    },
    cap,
  );
  const out = await getIssue.handler(client, { issue_key: "PROJ-17619" });
  assert.match(decodeURIComponent(cap.url), /issuelinks/);
  assert.match(decodeURIComponent(cap.url), /subtasks/);
  const parsed = JSON.parse(out);
  assert.equal(parsed.parent.key, "PROJ-17000");
  assert.equal(parsed.parent.type, "Epic");
  assert.equal(parsed.subtasks.length, 1);
  assert.equal(parsed.subtasks[0].key, "PROJ-17620");
  assert.equal(parsed.subtasks[0].status, "Done");
  assert.deepEqual(parsed.links[0], {
    linkType: "Blocks",
    direction: "outward",
    relation: "blocks",
    key: "PROJ-17700",
    summary: "Deploy",
    status: "Open",
    type: "Task",
  });
  assert.equal(parsed.links[1].direction, "inward");
  assert.equal(parsed.links[1].relation, "relates to");
  assert.equal(parsed.links[1].key, "PROJ-17500");
});

test("jira_get_issue returns empty links/subtasks and null parent when absent", async () => {
  const client = clientReturning({ key: "PROJ-1", fields: { summary: "A" } });
  const parsed = JSON.parse(await getIssue.handler(client, { issue_key: "PROJ-1" }));
  assert.deepEqual(parsed.links, []);
  assert.deepEqual(parsed.subtasks, []);
  assert.equal(parsed.parent, null);
  assert.equal("extraFields" in parsed, false);
});

test("jira_get_issue requests extra fields and returns them raw under extraFields", async () => {
  const cap: any = {};
  const client = clientReturning(
    { key: "PROJ-1", fields: { summary: "A", customfield_11513: "MR !30 -> master", customfield_10001: { value: "X" } } },
    cap,
  );
  const parsed = JSON.parse(
    await getIssue.handler(client, {
      issue_key: "PROJ-1",
      fields: ["customfield_11513", "customfield_10001", "customfield_99999"],
    }),
  );
  assert.match(decodeURIComponent(cap.url), /fields=[^&]*,parent,customfield_11513,customfield_10001,customfield_99999(&|$)/);
  assert.deepEqual(parsed.extraFields, {
    customfield_11513: "MR !30 -> master",
    customfield_10001: { value: "X" },
    customfield_99999: null,
  });
  assert.equal(parsed.summary, "A");
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

test("jira_search requests extra fields and returns them per issue", async () => {
  const cap: any = {};
  const client = clientReturning(
    { issues: [{ key: "PROJ-1", fields: { summary: "A", customfield_11513: "MR !30" } }, { key: "PROJ-2", fields: { summary: "B" } }] },
    cap,
  );
  const parsed = JSON.parse(await search.handler(client, { jql: "x", fields: ["customfield_11513"] }));
  assert.match(decodeURIComponent(cap.url), /fields=summary,status,assignee,customfield_11513(&|$)/);
  assert.deepEqual(parsed[0].extraFields, { customfield_11513: "MR !30" });
  assert.deepEqual(parsed[1].extraFields, { customfield_11513: null });
});

test("jira_search omits extraFields when no fields are requested", async () => {
  const client = clientReturning({ issues: [{ key: "PROJ-1", fields: { summary: "A" } }] });
  const parsed = JSON.parse(await search.handler(client, { jql: "x" }));
  assert.equal("extraFields" in parsed[0], false);
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

import { getAttachment } from "../src/tools/getAttachment.ts";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("jira_get_attachment fetches metadata, downloads content, and saves to disk", async () => {
  const urls: string[] = [];
  const payload = Buffer.from("PNGDATA");
  const client = new JiraClient({
    baseUrl: "https://jira.example.test",
    pat: "t",
    fetchImpl: async (url: string) => {
      urls.push(url);
      if (url.endsWith("/rest/api/2/attachment/123")) {
        const body = {
          id: "123",
          filename: "screenshot.png",
          mimeType: "image/png",
          content: "https://jira.example.test/secure/attachment/123/screenshot.png",
        };
        return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as any;
      }
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength),
        headers: { get: () => "image/png" },
        text: async () => "",
      } as any;
    },
  });

  const dir = await mkdtemp(join(tmpdir(), "jira-mcp-test-"));
  const out = await getAttachment.handler(client, { attachment_id: "123", dest_dir: dir });
  assert.match(urls[0], /\/rest\/api\/2\/attachment\/123$/);
  assert.match(urls[1], /\/secure\/attachment\/123\/screenshot\.png$/);
  const parsed = JSON.parse(out);
  assert.equal(parsed.filename, "screenshot.png");
  assert.equal(parsed.mimeType, "image/png");
  assert.equal(parsed.size, payload.length);
  const saved = await readFile(parsed.path);
  assert.equal(saved.toString(), "PNGDATA");
});

import { setDeployDescription } from "../src/tools/setDeployDescription.ts";

function writeClient(captured: { calls: any[] }, getBody: any = {}) {
  return new JiraClient({
    baseUrl: "https://jira.example.test",
    pat: "t",
    fetchImpl: async (url: string, init: any) => {
      captured.calls.push({ url, method: init?.method ?? "GET", body: init?.body });
      if ((init?.method ?? "GET") === "GET") {
        return { ok: true, status: 200, json: async () => getBody, text: async () => JSON.stringify(getBody) } as any;
      }
      return { ok: true, status: 204, json: async () => null, text: async () => "" } as any;
    },
  });
}

test("jira_set_deploy_description replaces the field with a single PUT", async () => {
  const cap = { calls: [] as any[] };
  const client = writeClient(cap);
  const out = await setDeployDescription.handler(client, { issue_key: "PROJ-18710", text: "MR !30 -> master" });
  assert.equal(cap.calls.length, 1);
  assert.equal(cap.calls[0].method, "PUT");
  assert.match(cap.calls[0].url, /\/rest\/api\/2\/issue\/PROJ-18710$/);
  assert.deepEqual(JSON.parse(cap.calls[0].body), { fields: { customfield_11513: "MR !30 -> master" } });
  const parsed = JSON.parse(out);
  assert.equal(parsed.key, "PROJ-18710");
  assert.equal(parsed.mode, "replace");
  assert.equal(parsed.field, "customfield_11513");
});

test("jira_set_deploy_description appends after the existing value", async () => {
  const cap = { calls: [] as any[] };
  const client = writeClient(cap, { fields: { customfield_11513: "old line" } });
  await setDeployDescription.handler(client, { issue_key: "PROJ-1", text: "new line", mode: "append" });
  assert.equal(cap.calls.length, 2);
  assert.equal(cap.calls[0].method, "GET");
  assert.match(cap.calls[0].url, /\/rest\/api\/2\/issue\/PROJ-1\?fields=customfield_11513$/);
  assert.deepEqual(JSON.parse(cap.calls[1].body), { fields: { customfield_11513: "old line\n\nnew line" } });
});

test("jira_set_deploy_description appending to an empty field adds no leading blank lines", async () => {
  const cap = { calls: [] as any[] };
  const client = writeClient(cap, { fields: { customfield_11513: null } });
  await setDeployDescription.handler(client, { issue_key: "PROJ-1", text: "first line", mode: "append" });
  assert.deepEqual(JSON.parse(cap.calls[1].body), { fields: { customfield_11513: "first line" } });
});

test("jira_set_deploy_description rejects an unknown mode without calling Jira", async () => {
  const cap = { calls: [] as any[] };
  const client = writeClient(cap);
  await assert.rejects(() => setDeployDescription.handler(client, { issue_key: "PROJ-1", text: "x", mode: "delete" }), /mode/);
  assert.equal(cap.calls.length, 0);
});

test("jira_set_deploy_description honours JIRA_DEPLOY_DESCRIPTION_FIELD override", async () => {
  const cap = { calls: [] as any[] };
  const client = writeClient(cap);
  process.env.JIRA_DEPLOY_DESCRIPTION_FIELD = "customfield_11505";
  try {
    await setDeployDescription.handler(client, { issue_key: "PROJ-1", text: "x" });
  } finally {
    delete process.env.JIRA_DEPLOY_DESCRIPTION_FIELD;
  }
  assert.deepEqual(JSON.parse(cap.calls[0].body), { fields: { customfield_11505: "x" } });
});

import { listFields } from "../src/tools/listFields.ts";

test("jira_list_fields lists all fields filtered by name or id", async () => {
  const cap: any = {};
  const client = clientReturning(
    [
      { id: "summary", name: "Summary", custom: false, schema: { type: "string" } },
      { id: "customfield_11513", name: "Deploy Description", custom: true, schema: { type: "string" } },
      { id: "customfield_10001", name: "Team", custom: true, schema: { type: "option" } },
    ],
    cap,
  );
  const parsed = JSON.parse(await listFields.handler(client, { query: "DEPLOY" }));
  assert.match(cap.url, /\/rest\/api\/2\/field$/);
  assert.deepEqual(parsed, [{ id: "customfield_11513", name: "Deploy Description", custom: true, type: "string" }]);

  const all = JSON.parse(await listFields.handler(client, {}));
  assert.deepEqual(all.map((f: any) => f.id), ["customfield_10001", "customfield_11513", "summary"]);
});

test("jira_list_fields with issue_key lists only fields set on the issue", async () => {
  const cap: any = {};
  const client = clientReturning(
    {
      key: "PROJ-1",
      names: { summary: "Summary", customfield_11513: "Deploy Description", customfield_10001: "Team", labels: "Labels" },
      fields: { summary: "A", customfield_11513: "MR !30", customfield_10001: null, labels: [] },
    },
    cap,
  );
  const parsed = JSON.parse(await listFields.handler(client, { issue_key: "PROJ-1" }));
  assert.match(decodeURIComponent(cap.url), /\/rest\/api\/2\/issue\/PROJ-1\?fields=\*all&expand=names$/);
  assert.deepEqual(parsed, [
    { id: "customfield_11513", name: "Deploy Description", custom: true },
    { id: "summary", name: "Summary", custom: false },
  ]);
});

import { getChangelog } from "../src/tools/getChangelog.ts";

const changelogBody = {
  key: "PROJ-1",
  changelog: {
    histories: [
      {
        created: "2026-06-01T10:00:00.000+0000",
        author: { displayName: "Anna K" },
        items: [
          { field: "status", fieldId: "status", fromString: "Open", toString: "In Progress" },
          { field: "assignee", fieldId: "assignee", fromString: null, toString: "Anna K" },
        ],
      },
      {
        created: "2026-06-02T10:00:00.000+0000",
        author: { displayName: "Marek B" },
        items: [{ field: "Deploy Description", fieldId: "customfield_11513", fromString: null, toString: "MR !30" }],
      },
    ],
  },
};

test("jira_get_changelog flattens history items", async () => {
  const cap: any = {};
  const client = clientReturning(changelogBody, cap);
  const parsed = JSON.parse(await getChangelog.handler(client, { issue_key: "PROJ-1" }));
  assert.match(decodeURIComponent(cap.url), /\/rest\/api\/2\/issue\/PROJ-1\?.*expand=changelog/);
  assert.equal(parsed.length, 3);
  assert.deepEqual(parsed[0], {
    created: "2026-06-01T10:00:00.000+0000",
    author: "Anna K",
    field: "status",
    fieldId: "status",
    from: "Open",
    to: "In Progress",
  });
  assert.equal(parsed[2].author, "Marek B");
});

test("jira_get_changelog filters by field name or id, case-insensitive", async () => {
  const client = clientReturning(changelogBody);
  const byName = JSON.parse(await getChangelog.handler(client, { issue_key: "PROJ-1", field: "Status" }));
  assert.deepEqual(byName.map((r: any) => r.to), ["In Progress"]);
  const byId = JSON.parse(await getChangelog.handler(client, { issue_key: "PROJ-1", field: "customfield_11513" }));
  assert.deepEqual(byId.map((r: any) => r.to), ["MR !30"]);
});

import { getDevInfo } from "../src/tools/getDevInfo.ts";

function routedClient(routes: Array<[RegExp, any]>, urls: string[] = []) {
  return new JiraClient({
    baseUrl: "https://jira.example.test",
    pat: "t",
    fetchImpl: async (url: string) => {
      urls.push(url);
      const hit = routes.find(([re]) => re.test(url));
      if (!hit) return { ok: false, status: 404, json: async () => null, text: async () => "" } as any;
      return { ok: true, status: 200, json: async () => hit[1], text: async () => JSON.stringify(hit[1]) } as any;
    },
  });
}

test("jira_get_dev_info collects pull requests, branches and remote links", async () => {
  const urls: string[] = [];
  const client = routedClient(
    [
      [/\/issue\/PROJ-1\?fields=summary$/, { id: "10042", key: "PROJ-1", fields: { summary: "A" } }],
      [/\/issue\/PROJ-1\/remotelink$/, [{ relationship: "mentioned in", object: { title: "MR !30", url: "https://gitlab/mr/30" } }]],
      [/\/dev-status\/1\.0\/issue\/summary\?issueId=10042$/, { summary: { pullrequest: { byInstanceType: { gitlab: { count: 1 } } } } }],
      [
        /dataType=pullrequest/,
        {
          detail: [
            {
              pullRequests: [
                {
                  id: "!30",
                  name: "PROJ-1 fix",
                  status: "MERGED",
                  url: "https://gitlab/mr/30",
                  source: { branch: "feature/PROJ-1" },
                  destination: { branch: "master" },
                  repositoryName: "checkout",
                  author: { name: "Anna K" },
                },
              ],
            },
          ],
        },
      ],
      [/dataType=branch/, { detail: [{ branches: [{ name: "feature/PROJ-1", url: "https://gitlab/b", repository: { name: "checkout" } }] }] }],
    ],
    urls,
  );
  const parsed = JSON.parse(await getDevInfo.handler(client, { issue_key: "PROJ-1" }));
  assert.ok(urls.some((u) => /detail\?issueId=10042&applicationType=gitlab&dataType=pullrequest$/.test(u)));
  assert.deepEqual(parsed.pullRequests, [
    {
      id: "!30",
      title: "PROJ-1 fix",
      status: "MERGED",
      url: "https://gitlab/mr/30",
      sourceBranch: "feature/PROJ-1",
      targetBranch: "master",
      repository: "checkout",
      author: "Anna K",
      lastUpdate: null,
    },
  ]);
  assert.deepEqual(parsed.branches, [{ name: "feature/PROJ-1", url: "https://gitlab/b", repository: "checkout" }]);
  assert.equal(parsed.remoteLinks[0].url, "https://gitlab/mr/30");
  assert.equal("errors" in parsed, false);
});

test("jira_get_dev_info reports failing sources under errors instead of throwing", async () => {
  const client = routedClient([[/\/issue\/PROJ-1\?fields=summary$/, { id: "1", key: "PROJ-1" }]]);
  const parsed = JSON.parse(await getDevInfo.handler(client, { issue_key: "PROJ-1" }));
  assert.deepEqual(parsed.pullRequests, []);
  assert.deepEqual(parsed.remoteLinks, []);
  assert.equal(parsed.errors.length, 2);
  assert.match(parsed.errors[0], /^remotelink: Not found/);
  assert.match(parsed.errors[1], /^dev-status: Not found/);
});

import { tools } from "../src/tools/index.ts";

test("registry exposes all ten tools with unique names", async () => {
  const names = tools.map((t) => t.name).sort();
  assert.deepEqual(names, [
    "jira_get_attachment",
    "jira_get_changelog",
    "jira_get_comments",
    "jira_get_dev_info",
    "jira_get_issue",
    "jira_get_transitions",
    "jira_list_fields",
    "jira_search",
    "jira_set_deploy_description",
    "jira_whoami",
  ]);
  assert.equal(new Set(names).size, names.length);
});
