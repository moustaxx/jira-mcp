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
      return {
        ok: true,
        status: 200,
        json: async () => body,
        text: async () => JSON.stringify(body),
      } as any;
    },
  });
}

test("jira_whoami hits /myself and returns user fields", async () => {
  const cap: any = {};
  const client = clientReturning(
    { displayName: "Marek B", emailAddress: "m@b.pl", key: "mbedna" },
    cap,
  );
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
        parent: {
          key: "PROJ-17000",
          fields: {
            summary: "Checkout epic",
            status: { name: "Open" },
            issuetype: { name: "Epic" },
          },
        },
        subtasks: [
          {
            key: "PROJ-17620",
            fields: { summary: "Sub A", status: { name: "Done" }, issuetype: { name: "Sub-task" } },
          },
        ],
        issuelinks: [
          {
            type: { name: "Blocks", inward: "is blocked by", outward: "blocks" },
            outwardIssue: {
              key: "PROJ-17700",
              fields: { summary: "Deploy", status: { name: "Open" }, issuetype: { name: "Task" } },
            },
          },
          {
            type: { name: "Relates", inward: "relates to", outward: "relates to" },
            inwardIssue: {
              key: "PROJ-17500",
              fields: {
                summary: "Old bug",
                status: { name: "Closed" },
                issuetype: { name: "Bug" },
              },
            },
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
    {
      key: "PROJ-1",
      fields: {
        summary: "A",
        customfield_11513: "MR !30 -> master",
        customfield_10001: { value: "X" },
      },
    },
    cap,
  );
  const parsed = JSON.parse(
    await getIssue.handler(client, {
      issue_key: "PROJ-1",
      fields: ["customfield_11513", "customfield_10001", "customfield_99999"],
    }),
  );
  assert.match(
    decodeURIComponent(cap.url),
    /fields=[^&]*,parent,customfield_11513,customfield_10001,customfield_99999(&|$)/,
  );
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
        {
          key: "PROJ-1",
          fields: { summary: "A", status: { name: "Open" }, assignee: { displayName: "X" } },
        },
        { key: "PROJ-2", fields: { summary: "B", status: { name: "Done" }, assignee: null } },
      ],
    },
    cap,
  );
  const out = await search.handler(client, { jql: "project = PROJ", limit: 10 });
  assert.match(cap.url, /\/rest\/api\/2\/search\?/);
  assert.match(decodeURIComponent(cap.url), /jql=project = PROJ/);
  assert.match(cap.url, /maxResults=10/);
  const parsed = JSON.parse(out).issues;
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].key, "PROJ-1");
  assert.equal(parsed[1].assignee, null);
});

test("jira_search requests extra fields and returns them per issue", async () => {
  const cap: any = {};
  const client = clientReturning(
    {
      issues: [
        { key: "PROJ-1", fields: { summary: "A", customfield_11513: "MR !30" } },
        { key: "PROJ-2", fields: { summary: "B" } },
      ],
    },
    cap,
  );
  const parsed = JSON.parse(
    await search.handler(client, { jql: "x", fields: ["customfield_11513"] }),
  ).issues;
  assert.match(
    decodeURIComponent(cap.url),
    /fields=summary,status,assignee,customfield_11513(&|$)/,
  );
  assert.deepEqual(parsed[0].extraFields, { customfield_11513: "MR !30" });
  assert.deepEqual(parsed[1].extraFields, { customfield_11513: null });
});

test("jira_search omits extraFields when no fields are requested", async () => {
  const client = clientReturning({ issues: [{ key: "PROJ-1", fields: { summary: "A" } }] });
  const parsed = JSON.parse(await search.handler(client, { jql: "x" })).issues;
  assert.equal("extraFields" in parsed[0], false);
});

test("jira_search defaults limit to 25", async () => {
  const cap: any = {};
  const client = clientReturning({ issues: [] }, cap);
  await search.handler(client, { jql: "x" });
  assert.match(cap.url, /maxResults=25/);
  assert.doesNotMatch(cap.url, /startAt=/);
});

test("jira_search pages with start_at and returns total", async () => {
  const cap: any = {};
  const client = clientReturning(
    { total: 120, startAt: 50, issues: [{ key: "PROJ-51", fields: { summary: "A" } }] },
    cap,
  );
  const parsed = JSON.parse(await search.handler(client, { jql: "x", start_at: 50 }));
  assert.match(cap.url, /startAt=50/);
  assert.equal(parsed.total, 120);
  assert.equal(parsed.startAt, 50);
  assert.equal(parsed.issues[0].key, "PROJ-51");
});

import { getComments } from "../src/tools/getComments.ts";

test("jira_get_comments fetches comments endpoint and maps fields", async () => {
  const cap: any = {};
  const client = clientReturning(
    {
      comments: [
        {
          author: { displayName: "Anna K" },
          created: "2026-06-02T09:00:00.000+0000",
          body: "Looks good",
        },
      ],
    },
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
        return {
          ok: true,
          status: 200,
          json: async () => body,
          text: async () => JSON.stringify(body),
        } as any;
      }
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () =>
          payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength),
        headers: { get: () => "image/png" },
        text: async () => "",
      } as any;
    },
  });

  const dir = await mkdtemp(join(tmpdir(), "jira-mcp-test-"));
  const out = await withEnv({ JIRA_ATTACHMENT_DIR: dir }, () =>
    getAttachment.handler(client, { attachment_id: "123" }),
  );
  assert.match(urls[0], /\/rest\/api\/2\/attachment\/123$/);
  assert.match(urls[1], /\/secure\/attachment\/123\/screenshot\.png$/);
  const parsed = JSON.parse(out);
  assert.equal(parsed.filename, "screenshot.png");
  assert.equal(parsed.mimeType, "image/png");
  assert.equal(parsed.size, payload.length);
  const saved = await readFile(parsed.path);
  assert.equal(saved.toString(), "PNGDATA");
});

async function withEnv<T>(vars: Record<string, string>, fn: () => Promise<T>): Promise<T> {
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  Object.assign(process.env, vars);
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

function attachmentClient(
  meta: any,
  payload = Buffer.from("DATA"),
  headers: Record<string, string> = {},
) {
  const urls: string[] = [];
  const client = new JiraClient({
    baseUrl: "https://jira.example.test",
    pat: "t",
    fetchImpl: async (url: string) => {
      urls.push(url);
      if (url.includes("/rest/api/2/attachment/")) {
        return { ok: true, status: 200, json: async () => meta, text: async () => "" } as any;
      }
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () =>
          payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength),
        headers: { get: (h: string) => headers[h.toLowerCase()] ?? null },
        text: async () => "",
      } as any;
    },
  });
  return { client, urls };
}

test("jira_get_attachment strips path components from the uploaded filename", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jira-mcp-test-"));
  const { client } = attachmentClient({
    filename: "../../../../etc/evil.sh",
    content: "https://jira.example.test/secure/attachment/7/x",
  });
  const out = JSON.parse(
    await withEnv({ JIRA_ATTACHMENT_DIR: dir }, () =>
      getAttachment.handler(client, { attachment_id: "7" }),
    ),
  );
  assert.equal(out.filename, "evil.sh");
  assert.equal(out.path, join(dir, "7-evil.sh"));
});

test("jira_get_attachment rejects a non-numeric attachment id without calling Jira", async () => {
  const { client, urls } = attachmentClient({});
  await assert.rejects(
    () => getAttachment.handler(client, { attachment_id: "../../x" }),
    /Invalid attachment id/,
  );
  assert.equal(urls.length, 0);
});

test("jira_get_attachment refuses content URLs on a foreign host", async () => {
  const { client, urls } = attachmentClient({
    filename: "a.png",
    content: "https://attacker.example/steal",
  });
  await assert.rejects(
    () => getAttachment.handler(client, { attachment_id: "1" }),
    /Refusing to send credentials/,
  );
  assert.equal(urls.length, 1);
});

test("jira_get_attachment enforces the size limit from metadata and content-length", async () => {
  const content = "https://jira.example.test/secure/attachment/1/a";
  const env = { JIRA_ATTACHMENT_MAX_BYTES: "10" };
  const big = attachmentClient({ filename: "a", size: 11, content });
  await withEnv(env, () =>
    assert.rejects(() => getAttachment.handler(big.client, { attachment_id: "1" }), /limit/),
  );
  assert.equal(big.urls.length, 1);
  const declared = attachmentClient({ filename: "a", content }, Buffer.from("x"), {
    "content-length": "11",
  });
  await withEnv(env, () =>
    assert.rejects(
      () => getAttachment.handler(declared.client, { attachment_id: "1" }),
      /too large/,
    ),
  );
});

import { setDeployDescription } from "../src/tools/setDeployDescription.ts";

function writeClient(captured: { calls: any[] }, getBody: any = {}) {
  return new JiraClient({
    baseUrl: "https://jira.example.test",
    pat: "t",
    fetchImpl: async (url: string, init: any) => {
      captured.calls.push({ url, method: init?.method ?? "GET", body: init?.body });
      if ((init?.method ?? "GET") === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => getBody,
          text: async () => JSON.stringify(getBody),
        } as any;
      }
      return { ok: true, status: 204, json: async () => null, text: async () => "" } as any;
    },
  });
}

test("jira_set_deploy_description replaces the field with a single PUT", async () => {
  const cap = { calls: [] as any[] };
  const client = writeClient(cap);
  const out = await setDeployDescription.handler(client, {
    issue_key: "PROJ-18710",
    text: "MR !30 -> master",
  });
  assert.equal(cap.calls.length, 1);
  assert.equal(cap.calls[0].method, "PUT");
  assert.match(cap.calls[0].url, /\/rest\/api\/2\/issue\/PROJ-18710$/);
  assert.deepEqual(JSON.parse(cap.calls[0].body), {
    fields: { customfield_11513: "MR !30 -> master" },
  });
  const parsed = JSON.parse(out);
  assert.equal(parsed.key, "PROJ-18710");
  assert.equal(parsed.mode, "replace");
  assert.equal(parsed.field, "customfield_11513");
});

test("jira_set_deploy_description appends after the existing value", async () => {
  const cap = { calls: [] as any[] };
  const client = writeClient(cap, { fields: { customfield_11513: "old line" } });
  await setDeployDescription.handler(client, {
    issue_key: "PROJ-1",
    text: "new line",
    mode: "append",
  });
  assert.equal(cap.calls.length, 2);
  assert.equal(cap.calls[0].method, "GET");
  assert.match(cap.calls[0].url, /\/rest\/api\/2\/issue\/PROJ-1\?fields=customfield_11513$/);
  assert.deepEqual(JSON.parse(cap.calls[1].body), {
    fields: { customfield_11513: "old line\n\nnew line" },
  });
});

test("jira_set_deploy_description appending to an empty field adds no leading blank lines", async () => {
  const cap = { calls: [] as any[] };
  const client = writeClient(cap, { fields: { customfield_11513: null } });
  await setDeployDescription.handler(client, {
    issue_key: "PROJ-1",
    text: "first line",
    mode: "append",
  });
  assert.deepEqual(JSON.parse(cap.calls[1].body), { fields: { customfield_11513: "first line" } });
});

test("jira_set_deploy_description rejects an unknown mode without calling Jira", async () => {
  const cap = { calls: [] as any[] };
  const client = writeClient(cap);
  await assert.rejects(
    () => setDeployDescription.handler(client, { issue_key: "PROJ-1", text: "x", mode: "delete" }),
    /mode/,
  );
  assert.equal(cap.calls.length, 0);
});

test("jira_set_deploy_description refuses to append to a non-text field", async () => {
  const cap = { calls: [] as any[] };
  const client = writeClient(cap, { fields: { customfield_11513: { value: "x" } } });
  await assert.rejects(
    () => setDeployDescription.handler(client, { issue_key: "PROJ-1", text: "y", mode: "append" }),
    /not a text field/,
  );
  assert.equal(cap.calls.length, 1);
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
      {
        id: "customfield_11513",
        name: "Deploy Description",
        custom: true,
        schema: { type: "string" },
      },
      { id: "customfield_10001", name: "Team", custom: true, schema: { type: "option" } },
    ],
    cap,
  );
  const parsed = JSON.parse(await listFields.handler(client, { query: "DEPLOY" }));
  assert.match(cap.url, /\/rest\/api\/2\/field$/);
  assert.deepEqual(parsed, [
    { id: "customfield_11513", name: "Deploy Description", custom: true, type: "string" },
  ]);

  const all = JSON.parse(await listFields.handler(client, {}));
  assert.deepEqual(
    all.map((f: any) => f.id),
    ["customfield_10001", "customfield_11513", "summary"],
  );
});

test("jira_list_fields with issue_key lists only fields set on the issue", async () => {
  const cap: any = {};
  const client = clientReturning(
    {
      key: "PROJ-1",
      names: {
        summary: "Summary",
        customfield_11513: "Deploy Description",
        customfield_10001: "Team",
        labels: "Labels",
      },
      fields: { summary: "A", customfield_11513: "MR !30", customfield_10001: null, labels: [] },
    },
    cap,
  );
  const parsed = JSON.parse(await listFields.handler(client, { issue_key: "PROJ-1" }));
  assert.match(
    decodeURIComponent(cap.url),
    /\/rest\/api\/2\/issue\/PROJ-1\?fields=\*all&expand=names$/,
  );
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
        items: [
          {
            field: "Deploy Description",
            fieldId: "customfield_11513",
            fromString: null,
            toString: "MR !30",
          },
        ],
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
  const byName = JSON.parse(
    await getChangelog.handler(client, { issue_key: "PROJ-1", field: "Status" }),
  );
  assert.deepEqual(
    byName.map((r: any) => r.to),
    ["In Progress"],
  );
  const byId = JSON.parse(
    await getChangelog.handler(client, { issue_key: "PROJ-1", field: "customfield_11513" }),
  );
  assert.deepEqual(
    byId.map((r: any) => r.to),
    ["MR !30"],
  );
});

import { getDevInfo } from "../src/tools/getDevInfo.ts";

function routedClient(routes: Array<[RegExp, any]>, urls: string[] = []) {
  return new JiraClient({
    baseUrl: "https://jira.example.test",
    pat: "t",
    fetchImpl: async (url: string) => {
      urls.push(url);
      const hit = routes.find(([re]) => re.test(url));
      if (!hit)
        return { ok: false, status: 404, json: async () => null, text: async () => "" } as any;
      return {
        ok: true,
        status: 200,
        json: async () => hit[1],
        text: async () => JSON.stringify(hit[1]),
      } as any;
    },
  });
}

test("jira_get_dev_info collects pull requests, branches and remote links", async () => {
  const urls: string[] = [];
  const client = routedClient(
    [
      [/\/issue\/PROJ-1\?fields=summary$/, { id: "10042", key: "PROJ-1", fields: { summary: "A" } }],
      [
        /\/issue\/PROJ-1\/remotelink$/,
        [
          {
            relationship: "mentioned in",
            object: { title: "MR !30", url: "https://gitlab/mr/30" },
          },
        ],
      ],
      [
        /\/dev-status\/1\.0\/issue\/summary\?issueId=10042$/,
        { summary: { pullrequest: { byInstanceType: { gitlab: { count: 1 } } } } },
      ],
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
      [
        /dataType=branch/,
        {
          detail: [
            {
              branches: [
                {
                  name: "feature/PROJ-1",
                  url: "https://gitlab/b",
                  repository: { name: "checkout" },
                },
              ],
            },
          ],
        },
      ],
    ],
    urls,
  );
  const parsed = JSON.parse(await getDevInfo.handler(client, { issue_key: "PROJ-1" }));
  assert.ok(
    urls.some((u) =>
      u.endsWith("detail?issueId=10042&applicationType=gitlab&dataType=pullrequest"),
    ),
  );
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
  assert.deepEqual(parsed.branches, [
    { name: "feature/PROJ-1", url: "https://gitlab/b", repository: "checkout" },
  ]);
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

import { listBoards, listSprints } from "../src/tools/agile.ts";

test("jira_list_boards filters by project and maps boards", async () => {
  const cap: any = {};
  const client = clientReturning(
    {
      isLast: true,
      values: [{ id: 7, name: "PROJ board", type: "scrum", location: { projectKey: "PROJ" } }],
    },
    cap,
  );
  const parsed = JSON.parse(await listBoards.handler(client, { project: "PROJ" }));
  assert.match(cap.url, /\/rest\/agile\/1\.0\/board\?projectKeyOrId=PROJ&startAt=0&maxResults=50$/);
  assert.deepEqual(parsed, [{ id: 7, name: "PROJ board", type: "scrum", project: "PROJ" }]);
});

test("jira_list_sprints defaults to active,future and follows pages until isLast", async () => {
  const urls: string[] = [];
  const client = new JiraClient({
    baseUrl: "https://jira.example.test",
    pat: "t",
    fetchImpl: async (url: string) => {
      urls.push(url);
      const body = /startAt=0&/.test(url)
        ? { isLast: false, values: [{ id: 1, name: "S1", state: "active", goal: "" }] }
        : { isLast: true, values: [{ id: 2, name: "S2", state: "future" }] };
      return {
        ok: true,
        status: 200,
        json: async () => body,
        text: async () => JSON.stringify(body),
      } as any;
    },
  });
  const parsed = JSON.parse(await listSprints.handler(client, { board_id: 7 }));
  assert.equal(urls.length, 2);
  assert.match(decodeURIComponent(urls[0]), /\/board\/7\/sprint\?state=active,future&startAt=0&/);
  assert.match(urls[1], /startAt=1&/);
  assert.deepEqual(
    parsed.map((s: any) => s.id),
    [1, 2],
  );
  assert.equal(parsed[0].goal, null);
});

import { getWorklogs } from "../src/tools/getWorklogs.ts";

test("jira_get_worklogs maps entries and sums time", async () => {
  const cap: any = {};
  const client = clientReturning(
    {
      worklogs: [
        {
          author: { displayName: "Anna K" },
          started: "2026-06-01T09:00:00.000+0000",
          timeSpent: "1h",
          timeSpentSeconds: 3600,
          comment: "review",
        },
        {
          author: { displayName: "Marek B" },
          started: "2026-06-02T09:00:00.000+0000",
          timeSpent: "30m",
          timeSpentSeconds: 1800,
        },
      ],
    },
    cap,
  );
  const parsed = JSON.parse(await getWorklogs.handler(client, { issue_key: "PROJ-1" }));
  assert.match(cap.url, /\/rest\/api\/2\/issue\/PROJ-1\/worklog$/);
  assert.equal(parsed.totalSeconds, 5400);
  assert.equal(parsed.worklogs[0].comment, "review");
  assert.equal(parsed.worklogs[1].comment, null);
});

import { addComment } from "../src/tools/addComment.ts";
import { createIssue, updateIssue } from "../src/tools/writeIssue.ts";

function postClient(captured: { calls: any[] }, responseBody: any = {}) {
  return new JiraClient({
    baseUrl: "https://jira.example.test",
    pat: "t",
    fetchImpl: async (url: string, init: any) => {
      captured.calls.push({ url, method: init?.method ?? "GET", body: init?.body });
      const status = init?.method === "PUT" ? 204 : 201;
      return {
        ok: true,
        status,
        json: async () => responseBody,
        text: async () => JSON.stringify(responseBody),
      } as any;
    },
  });
}

test("jira_add_comment posts the body to the comment endpoint", async () => {
  const cap = { calls: [] as any[] };
  const client = postClient(cap, {
    id: "555",
    author: { displayName: "Marek B" },
    created: "2026-10-14T10:00:00.000+0000",
  });
  const parsed = JSON.parse(
    await addComment.handler(client, { issue_key: "PROJ-1", body: "Deployed to test" }),
  );
  assert.equal(cap.calls[0].method, "POST");
  assert.match(cap.calls[0].url, /\/rest\/api\/2\/issue\/PROJ-1\/comment$/);
  assert.deepEqual(JSON.parse(cap.calls[0].body), { body: "Deployed to test" });
  assert.equal(parsed.id, "555");
});

test("jira_add_comment rejects an empty body without calling Jira", async () => {
  const cap = { calls: [] as any[] };
  await assert.rejects(
    () => addComment.handler(postClient(cap), { issue_key: "PROJ-1", body: "  " }),
    /empty/,
  );
  assert.equal(cap.calls.length, 0);
});

test("jira_create_issue builds fields and lets explicit args win over fields", async () => {
  const cap = { calls: [] as any[] };
  const client = postClient(cap, { id: "10001", key: "PROJ-2" });
  const parsed = JSON.parse(
    await createIssue.handler(client, {
      project: "PROJ",
      issue_type: "Sub-task",
      summary: "Do it",
      description: "details",
      fields: { parent: { key: "PROJ-1" }, labels: ["backend"], summary: "ignored" },
    }),
  );
  assert.equal(cap.calls[0].method, "POST");
  assert.match(cap.calls[0].url, /\/rest\/api\/2\/issue$/);
  assert.deepEqual(JSON.parse(cap.calls[0].body), {
    fields: {
      parent: { key: "PROJ-1" },
      labels: ["backend"],
      summary: "Do it",
      project: { key: "PROJ" },
      issuetype: { name: "Sub-task" },
      description: "details",
    },
  });
  assert.deepEqual(parsed, { key: "PROJ-2", id: "10001" });
});

test("jira_create_issue rejects non-object fields", async () => {
  const cap = { calls: [] as any[] };
  await assert.rejects(
    () =>
      createIssue.handler(postClient(cap), {
        project: "PROJ",
        issue_type: "Task",
        summary: "A",
        fields: ["x"],
      }),
    /must be an object/,
  );
  assert.equal(cap.calls.length, 0);
});

test("jira_update_issue PUTs only the given fields", async () => {
  const cap = { calls: [] as any[] };
  const parsed = JSON.parse(
    await updateIssue.handler(postClient(cap), {
      issue_key: "PROJ-1",
      summary: "New",
      fields: { labels: ["x"] },
    }),
  );
  assert.equal(cap.calls[0].method, "PUT");
  assert.match(cap.calls[0].url, /\/rest\/api\/2\/issue\/PROJ-1$/);
  assert.deepEqual(JSON.parse(cap.calls[0].body), { fields: { labels: ["x"], summary: "New" } });
  assert.deepEqual(parsed.updated, ["labels", "summary"]);
});

test("jira_update_issue with nothing to change does not call Jira", async () => {
  const cap = { calls: [] as any[] };
  await assert.rejects(
    () => updateIssue.handler(postClient(cap), { issue_key: "PROJ-1" }),
    /Nothing to update/,
  );
  assert.equal(cap.calls.length, 0);
});

import { transitionIssue } from "../src/tools/transitionIssue.ts";

function transitionClient(captured: { calls: any[] }) {
  return new JiraClient({
    baseUrl: "https://jira.example.test",
    pat: "t",
    fetchImpl: async (url: string, init: any) => {
      const method = init?.method ?? "GET";
      captured.calls.push({ url, method, body: init?.body });
      const body =
        method === "GET"
          ? {
              transitions: [
                { id: "21", name: "Start Progress", to: { name: "In Progress" } },
                { id: "31", name: "Done", to: { name: "Closed" } },
                { id: "41", name: "Reject", to: { name: "Closed" } },
              ],
            }
          : null;
      return {
        ok: true,
        status: method === "GET" ? 200 : 204,
        json: async () => body,
        text: async () => JSON.stringify(body),
      } as any;
    },
  });
}

test("jira_transition_issue resolves by id, transition name or target status", async () => {
  for (const transition of ["21", "start progress", "In Progress"]) {
    const cap = { calls: [] as any[] };
    const parsed = JSON.parse(
      await transitionIssue.handler(transitionClient(cap), { issue_key: "PROJ-1", transition }),
    );
    assert.equal(cap.calls[1].method, "POST");
    assert.match(cap.calls[1].url, /\/rest\/api\/2\/issue\/PROJ-1\/transitions$/);
    assert.deepEqual(JSON.parse(cap.calls[1].body), { transition: { id: "21" } });
    assert.deepEqual(parsed, { key: "PROJ-1", transition: "Start Progress", status: "In Progress" });
  }
});

test("jira_transition_issue sends comment and fields with the transition", async () => {
  const cap = { calls: [] as any[] };
  await transitionIssue.handler(transitionClient(cap), {
    issue_key: "PROJ-1",
    transition: "Done",
    comment: "Released",
    fields: { resolution: { name: "Fixed" } },
  });
  assert.deepEqual(JSON.parse(cap.calls[1].body), {
    transition: { id: "31" },
    fields: { resolution: { name: "Fixed" } },
    update: { comment: [{ add: { body: "Released" } }] },
  });
});

test("jira_transition_issue rejects unknown or ambiguous transitions without posting", async () => {
  const cap = { calls: [] as any[] };
  await assert.rejects(
    () => transitionIssue.handler(transitionClient(cap), { issue_key: "PROJ-1", transition: "QA" }),
    /No transition "QA".*Start Progress \(21\) → In Progress/,
  );
  await assert.rejects(
    () =>
      transitionIssue.handler(transitionClient(cap), { issue_key: "PROJ-1", transition: "Closed" }),
    /ambiguous.*Done \(31\).*Reject \(41\)/,
  );
  assert.equal(
    cap.calls.some((c) => c.method === "POST"),
    false,
  );
});

import { tools, enabledTools } from "../src/tools/index.ts";

test("write tools are disabled by default", () => {
  const names = enabledTools(undefined).map((t) => t.name);
  assert.deepEqual(
    names,
    tools.map((t) => t.name),
  );
  assert.equal(names.includes("jira_add_comment"), false);
  assert.equal(names.includes("jira_create_issue"), false);
  assert.equal(names.includes("jira_transition_issue"), false);
});

test("JIRA_WRITE_TOOLS enables groups independently, tolerating spaces, case and duplicates", () => {
  const comments = enabledTools("comments").map((t) => t.name);
  assert.ok(comments.includes("jira_add_comment"));
  assert.equal(comments.includes("jira_update_issue"), false);

  const both = enabledTools(" Issues , comments,issues ").map((t) => t.name);
  assert.equal(both.length, tools.length + 3);

  const transitions = enabledTools("transitions").map((t) => t.name);
  assert.deepEqual(transitions.slice(tools.length), ["jira_transition_issue"]);
  assert.ok(both.includes("jira_create_issue"));
  assert.ok(both.includes("jira_update_issue"));
  assert.equal(new Set(both).size, both.length);
});

test("JIRA_WRITE_TOOLS rejects unknown groups", () => {
  assert.throws(
    () => enabledTools("comments,workflow"),
    /Unknown JIRA_WRITE_TOOLS group\(s\): workflow/,
  );
  assert.throws(() => enabledTools("constructor"), /Unknown/);
});

test("registry exposes all thirteen tools with unique names", async () => {
  const names = tools.map((t) => t.name).sort();
  assert.deepEqual(names, [
    "jira_get_attachment",
    "jira_get_changelog",
    "jira_get_comments",
    "jira_get_dev_info",
    "jira_get_issue",
    "jira_get_transitions",
    "jira_get_worklogs",
    "jira_list_boards",
    "jira_list_fields",
    "jira_list_sprints",
    "jira_search",
    "jira_set_deploy_description",
    "jira_whoami",
  ]);
  assert.equal(new Set(names).size, names.length);
});

import { validateArgs } from "../src/tools/validate.ts";

test("validateArgs checks required, types, enums, array items and unknown arguments", () => {
  validateArgs(search.inputSchema, { jql: "x", limit: 5, fields: ["a"] });
  validateArgs(setDeployDescription.inputSchema, { issue_key: "A-1", text: "x", mode: "append" });
  assert.throws(() => validateArgs(search.inputSchema, {}), /Missing required argument `jql`/);
  assert.throws(() => validateArgs(search.inputSchema, { jql: 1 }), /`jql` must be a string/);
  assert.throws(() => validateArgs(search.inputSchema, { jql: "x", limit: "5" }), /number/);
  assert.throws(
    () => validateArgs(search.inputSchema, { jql: "x", fields: [1] }),
    /array of strings/,
  );
  assert.throws(() => validateArgs(search.inputSchema, { jql: "x", foo: 1 }), /Unknown argument/);
  assert.throws(
    () =>
      validateArgs(setDeployDescription.inputSchema, { issue_key: "A-1", text: "x", mode: "d" }),
    /one of: replace, append/,
  );
});
