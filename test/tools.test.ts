import { test } from "node:test";
import assert from "node:assert/strict";
import { JiraClient } from "../src/jiraClient.ts";
import { whoami } from "../src/tools/whoami.ts";

function clientReturning(body: any, captured?: { url?: string; }) {
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
    { displayName: "Marek B", emailAddress: "m@b.pl", key: "mbilski" },
    cap,
  );
  const out = await whoami.handler(client, {});
  assert.match(cap.url, /\/rest\/api\/2\/myself$/);
  assert.match(out, /Marek B/);
  assert.match(out, /m@b\.pl/);
});

test("jira_whoami falls back to name when key is missing and nulls absent fields", async () => {
  const parsed = JSON.parse(await whoami.handler(clientReturning({ name: "mbilski" }), {}));
  assert.deepEqual(parsed, { displayName: null, email: null, key: "mbilski" });
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

test("jira_get_issue maps attachments with null defaults for missing metadata", async () => {
  const client = clientReturning({
    key: "PROJ-1",
    fields: {
      attachment: [
        { id: "100", filename: "shot.png", mimeType: "image/png", size: 2048 },
        { id: "101", filename: "notes.txt" },
      ],
    },
  });
  const parsed = JSON.parse(await getIssue.handler(client, { issue_key: "PROJ-1" }));
  assert.deepEqual(parsed.attachments, [
    { id: "100", filename: "shot.png", mimeType: "image/png", size: 2048 },
    { id: "101", filename: "notes.txt", mimeType: null, size: null },
  ]);
});

test("jira_get_issue encodes the issue key and tolerates a response without fields", async () => {
  const cap: any = {};
  const client = clientReturning({ key: "PROJ-1" }, cap);
  const parsed = JSON.parse(await getIssue.handler(client, { issue_key: "PROJ 1/x" }));
  assert.match(cap.url, /\/rest\/api\/2\/issue\/PROJ%201%2Fx\?/);
  assert.equal(parsed.summary, null);
  assert.equal(parsed.status, null);
  assert.deepEqual(parsed.attachments, []);
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

test("comments and transitions return empty lists or nulls for incomplete responses", async () => {
  assert.deepEqual(
    JSON.parse(await getComments.handler(clientReturning({}), { issue_key: "PROJ-1" })),
    [],
  );
  assert.deepEqual(
    JSON.parse(
      await getComments.handler(clientReturning({ comments: [{}] }), { issue_key: "E-1" }),
    ),
    [{ author: null, created: null, body: null }],
  );
  assert.deepEqual(
    JSON.parse(await getTransitions.handler(clientReturning({}), { issue_key: "PROJ-1" })),
    [],
  );
  assert.deepEqual(
    JSON.parse(
      await getTransitions.handler(clientReturning({ transitions: [{ id: "1", name: "X" }] }), {
        issue_key: "PROJ-1",
      }),
    ),
    [{ id: "1", name: "X", to: null }],
  );
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

test("jira_get_attachment fails when metadata has no content URL", async () => {
  const { client, urls } = attachmentClient({ filename: "a.png" });
  await assert.rejects(
    () => getAttachment.handler(client, { attachment_id: "5" }),
    /Attachment 5 has no downloadable content/,
  );
  assert.equal(urls.length, 1);
});

test("jira_get_attachment falls back to the id when the filename is unusable", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jira-mcp-test-"));
  for (const filename of [undefined, "..", "\\", "\u0000\u0001"]) {
    const { client } = attachmentClient({
      filename,
      content: "https://jira.example.test/secure/attachment/9/x",
    });
    const out = JSON.parse(
      await withEnv({ JIRA_ATTACHMENT_DIR: dir }, () =>
        getAttachment.handler(client, { attachment_id: "9" }),
      ),
    );
    assert.equal(out.path, join(dir, "9-9"), `filename ${JSON.stringify(filename)}`);
    assert.equal(out.mimeType, null);
  }
});

test("jira_get_attachment strips control characters from the filename", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jira-mcp-test-"));
  const { client } = attachmentClient({
    filename: "re\u0007port\n.pdf",
    content: "https://jira.example.test/secure/attachment/3/x",
  });
  const out = JSON.parse(
    await withEnv({ JIRA_ATTACHMENT_DIR: dir }, () =>
      getAttachment.handler(client, { attachment_id: "3" }),
    ),
  );
  assert.equal(out.filename, "report.pdf");
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

test("jira_list_fields with issue_key applies the query and tolerates missing names", async () => {
  const client = clientReturning({
    fields: { customfield_11513: "MR !30", summary: "A" },
  });
  const parsed = JSON.parse(
    await listFields.handler(client, { issue_key: "PROJ-1", query: "CUSTOMFIELD" }),
  );
  assert.deepEqual(parsed, [{ id: "customfield_11513", name: null, custom: true }]);
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

test("jira_get_changelog falls back to raw values and handles missing histories", async () => {
  const client = clientReturning({
    changelog: {
      histories: [
        { items: [{ field: "assignee", from: "u1", to: "u2" }] },
        { created: "2026-06-02T10:00:00.000+0000" },
      ],
    },
  });
  const parsed = JSON.parse(await getChangelog.handler(client, { issue_key: "PROJ-1" }));
  assert.deepEqual(parsed, [
    { created: null, author: null, field: "assignee", fieldId: null, from: "u1", to: "u2" },
  ]);
  const empty = JSON.parse(await getChangelog.handler(clientReturning({}), { issue_key: "E-1" }));
  assert.deepEqual(empty, []);
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
      [
        /\/issue\/PROJ-1\?fields=summary$/,
        { id: "10042", key: "PROJ-1", fields: { summary: "A" } },
      ],
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

test("jira_get_dev_info keeps other instance types when one detail call fails", async () => {
  const client = routedClient([
    [/\/issue\/PROJ-1\?fields=summary$/, { id: "1", key: "PROJ-1" }],
    [/\/issue\/PROJ-1\/remotelink$/, [{ object: {}, application: { type: "gitlab" } }]],
    [
      /\/dev-status\/1\.0\/issue\/summary/,
      {
        summary: {
          pullrequest: { byInstanceType: { github: {} } },
          branch: { byInstanceType: { gitlab: {} } },
        },
      },
    ],
    [/applicationType=gitlab&dataType=pullrequest/, { detail: [{}] }],
    [/applicationType=gitlab&dataType=branch/, { detail: [{ branches: [{ name: "main" }] }] }],
  ]);
  const parsed = JSON.parse(await getDevInfo.handler(client, { issue_key: "PROJ-1" }));
  assert.deepEqual(parsed.errors.length, 1);
  assert.match(parsed.errors[0], /^dev-status github: Not found/);
  assert.deepEqual(parsed.pullRequests, []);
  assert.deepEqual(parsed.branches, [{ name: "main", url: null, repository: null }]);
  assert.deepEqual(parsed.remoteLinks, [
    { title: null, url: null, relationship: null, application: "gitlab" },
  ]);
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

function pagingClient(pageFor: (url: string) => any, urls: string[]) {
  return new JiraClient({
    baseUrl: "https://jira.example.test",
    pat: "t",
    fetchImpl: async (url: string) => {
      urls.push(url);
      const body = pageFor(url);
      return {
        ok: true,
        status: 200,
        json: async () => body,
        text: async () => JSON.stringify(body),
      } as any;
    },
  });
}

test("jira_list_sprints stops paging after 20 pages even if Jira never reports isLast", async () => {
  const urls: string[] = [];
  const client = pagingClient(() => ({ isLast: false, values: [{ id: 1 }] }), urls);
  const parsed = JSON.parse(await listSprints.handler(client, { board_id: 7, state: "closed" }));
  assert.equal(urls.length, 20);
  assert.equal(parsed.length, 20);
  assert.match(urls[0], /state=closed&/);
});

test("jira_list_boards stops on an empty page and maps missing fields to null", async () => {
  const urls: string[] = [];
  const client = pagingClient(
    (url) => (/startAt=0&/.test(url) ? { isLast: false, values: [{ id: 3 }] } : { isLast: false }),
    urls,
  );
  const parsed = JSON.parse(await listBoards.handler(client, {}));
  assert.equal(urls.length, 2);
  assert.match(urls[0], /\/board\?startAt=0&maxResults=50$/);
  assert.deepEqual(parsed, [{ id: 3, name: null, type: null, project: null }]);
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

test("jira_get_worklogs treats missing time as zero and an absent list as empty", async () => {
  const one = JSON.parse(
    await getWorklogs.handler(clientReturning({ worklogs: [{ comment: "" }] }), {
      issue_key: "PROJ-1",
    }),
  );
  assert.deepEqual(one, {
    totalSeconds: 0,
    worklogs: [
      { author: null, started: null, timeSpent: null, timeSpentSeconds: 0, comment: null },
    ],
  });
  const none = JSON.parse(await getWorklogs.handler(clientReturning({}), { issue_key: "PROJ-1" }));
  assert.deepEqual(none, { totalSeconds: 0, worklogs: [] });
});

import { addComment } from "../src/tools/addComment.ts";
import { createIssue, updateIssue } from "../src/tools/writeIssue.ts";

function postClient(captured: { calls: any[]; }, responseBody: any = {}) {
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

test("jira_add_comment returns nulls when Jira echoes no comment data", async () => {
  const parsed = JSON.parse(
    await addComment.handler(postClient({ calls: [] }), { issue_key: "PROJ-1", body: "x" }),
  );
  assert.deepEqual(parsed, { key: "PROJ-1", id: null, author: null, created: null });
});

import { addWorklog } from "../src/tools/addWorklog.ts";

test("jira_add_worklog posts time, start in Jira format and comment to the worklog endpoint", async () => {
  const cap = { calls: [] as any[] };
  const client = postClient(cap, {
    id: "777",
    author: { displayName: "Marek B" },
    started: "2026-10-21T07:00:00.000+0000",
    timeSpent: "1h 30m",
    timeSpentSeconds: 5400,
  });
  const parsed = JSON.parse(
    await addWorklog.handler(client, {
      issue_key: "PROJ-1",
      time_spent: " 1h 30m ",
      started: "2026-10-21T09:00:00+02:00",
      comment: "code review",
    }),
  );
  assert.equal(cap.calls[0].method, "POST");
  assert.match(cap.calls[0].url, /\/rest\/api\/2\/issue\/PROJ-1\/worklog$/);
  assert.deepEqual(JSON.parse(cap.calls[0].body), {
    timeSpent: "1h 30m",
    started: "2026-10-21T07:00:00.000+0000",
    comment: "code review",
  });
  assert.deepEqual(parsed, {
    key: "PROJ-1",
    id: "777",
    author: "Marek B",
    started: "2026-10-21T07:00:00.000+0000",
    timeSpent: "1h 30m",
    timeSpentSeconds: 5400,
  });
});

test("jira_add_worklog sends only the time when start and comment are omitted", async () => {
  const cap = { calls: [] as any[] };
  const parsed = JSON.parse(
    await addWorklog.handler(postClient(cap), { issue_key: "PROJ-1", time_spent: "2h", comment: " " }),
  );
  assert.deepEqual(JSON.parse(cap.calls[0].body), { timeSpent: "2h" });
  assert.deepEqual(parsed, {
    key: "PROJ-1",
    id: null,
    author: null,
    started: null,
    timeSpent: null,
    timeSpentSeconds: null,
  });
});

test("jira_add_worklog rejects invalid input without calling Jira", async () => {
  for (const [args, error] of [
    [{ time_spent: "  " }, /`time_spent` must not be empty/],
    [{ time_spent: "1h", started: "2026-10-21" }, /`started` must be an ISO 8601 date-time/],
    [{ time_spent: "1h", started: "yesterday 9am" }, /`started` must be an ISO 8601 date-time/],
    [{ time_spent: "1h", started: "2026-13-45T25:00" }, /`started` must be an ISO 8601 date-time/],
  ] as const) {
    const cap = { calls: [] as any[] };
    await assert.rejects(
      () => addWorklog.handler(postClient(cap), { issue_key: "PROJ-1", ...args }),
      error,
    );
    assert.equal(cap.calls.length, 0);
  }
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

test("jira_update_issue rejects writes when no field whitelist is configured", async () => {
  const cap = { calls: [] as any[] };
  await assert.rejects(
    () => updateIssue.handler(postClient(cap), { issue_key: "PROJ-1", fields: { labels: ["x"] } }),
    /JIRA_WRITE_FIELDS/,
  );
  assert.equal(cap.calls.length, 0);
});

test("jira_update_issue PUTs only whitelisted fields", async () => {
  const cap = { calls: [] as any[] };
  process.env.JIRA_WRITE_FIELDS = "labels, summary";
  let parsed;
  try {
    parsed = JSON.parse(
      await updateIssue.handler(postClient(cap), {
        issue_key: "PROJ-1",
        summary: "New",
        fields: { labels: ["x"] },
      }),
    );
  } finally {
    delete process.env.JIRA_WRITE_FIELDS;
  }
  assert.equal(cap.calls[0].method, "PUT");
  assert.match(cap.calls[0].url, /\/rest\/api\/2\/issue\/PROJ-1$/);
  assert.deepEqual(JSON.parse(cap.calls[0].body), { fields: { labels: ["x"], summary: "New" } });
  assert.deepEqual(parsed.updated, ["labels", "summary"]);
});

test("jira_update_issue allows every field with JIRA_WRITE_FIELDS=*", async () => {
  const cap = { calls: [] as any[] };
  process.env.JIRA_WRITE_FIELDS = "*";
  try {
    await updateIssue.handler(postClient(cap), {
      issue_key: "PROJ-1",
      fields: { customfield_11513: "Deploy text", labels: ["x"] },
    });
  } finally {
    delete process.env.JIRA_WRITE_FIELDS;
  }
  assert.deepEqual(JSON.parse(cap.calls[0].body), {
    fields: { customfield_11513: "Deploy text", labels: ["x"] },
  });
});

test("jira_update_issue rejects a field outside the whitelist", async () => {
  const cap = { calls: [] as any[] };
  process.env.JIRA_WRITE_FIELDS = "summary";
  try {
    await assert.rejects(
      () =>
        updateIssue.handler(postClient(cap), { issue_key: "PROJ-1", fields: { labels: ["x"] } }),
      /not allowed by JIRA_WRITE_FIELDS/,
    );
  } finally {
    delete process.env.JIRA_WRITE_FIELDS;
  }
  assert.equal(cap.calls.length, 0);
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

function transitionClient(captured: { calls: any[]; }) {
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
    assert.deepEqual(parsed, {
      key: "PROJ-1",
      transition: "Start Progress",
      status: "In Progress",
    });
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

test("jira_transition_issue validates transition and fields before calling Jira", async () => {
  const cap = { calls: [] as any[] };
  const client = transitionClient(cap);
  await assert.rejects(
    () => transitionIssue.handler(client, { issue_key: "PROJ-1", transition: "  " }),
    /must not be empty/,
  );
  for (const fields of [null, [], "x"]) {
    await assert.rejects(
      () => transitionIssue.handler(client, { issue_key: "PROJ-1", transition: "21", fields }),
      /`fields` must be an object/,
    );
  }
  assert.equal(cap.calls.length, 0);
});

test("jira_transition_issue ignores a blank comment", async () => {
  const cap = { calls: [] as any[] };
  await transitionIssue.handler(transitionClient(cap), {
    issue_key: "PROJ-1",
    transition: "21",
    comment: "   ",
  });
  assert.deepEqual(JSON.parse(cap.calls[1].body), { transition: { id: "21" } });
});

test("jira_transition_issue reports 'none' when the issue has no transitions", async () => {
  const client = clientReturning({});
  await assert.rejects(
    () => transitionIssue.handler(client, { issue_key: "PROJ-1", transition: "Done" }),
    /No transition "Done" available for this issue\. Available: none\./,
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
  assert.equal(names.includes("jira_add_worklog"), false);
  assert.equal(names.includes("jira_set_deploy_description"), false);
});

test("JIRA_WRITE_TOOLS enables groups independently, tolerating spaces, case and duplicates", () => {
  const comments = enabledTools("comments").map((t) => t.name);
  assert.ok(comments.includes("jira_add_comment"));
  assert.equal(comments.includes("jira_update_issue"), false);

  const both = enabledTools(" Issues , comments,issues ").map((t) => t.name);
  assert.equal(both.length, tools.length + 3);

  const transitions = enabledTools("transitions").map((t) => t.name);
  assert.deepEqual(transitions.slice(tools.length), ["jira_transition_issue"]);

  const worklogs = enabledTools("worklogs").map((t) => t.name);
  assert.deepEqual(worklogs.slice(tools.length), ["jira_add_worklog"]);
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

test("registry exposes read-only tools with unique names", async () => {
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
    "jira_whoami",
  ]);
  assert.equal(new Set(names).size, names.length);
});

import { validateArgs } from "../src/tools/validate.ts";

test("validateArgs checks required, types, enums, array items and unknown arguments", () => {
  validateArgs(search.inputSchema, { jql: "x", limit: 5, fields: ["a"] });
  assert.throws(() => validateArgs(search.inputSchema, {}), /Missing required argument `jql`/);
  assert.throws(() => validateArgs(search.inputSchema, { jql: 1 }), /`jql` must be a string/);
  assert.throws(() => validateArgs(search.inputSchema, { jql: "x", limit: "5" }), /number/);
  assert.throws(
    () => validateArgs(search.inputSchema, { jql: "x", fields: [1] }),
    /array of strings/,
  );
  assert.throws(() => validateArgs(search.inputSchema, { jql: "x", foo: 1 }), /Unknown argument/);
});

test("validateArgs handles objects, nulls, undefined values and open schemas", () => {
  const schema = {
    properties: { obj: { type: "object" }, n: { type: "number" }, any: {} },
    required: ["obj"],
  };
  validateArgs(schema, { obj: {}, n: undefined, any: [1], extra: "allowed" });
  assert.throws(() => validateArgs(schema, { obj: null }), /Missing required argument `obj`/);
  for (const obj of [[], "x"]) {
    assert.throws(() => validateArgs(schema, { obj }), /`obj` must be a object/);
  }
  for (const n of [NaN, Infinity]) {
    assert.throws(() => validateArgs(schema, { obj: {}, n }), /`n` must be a number/);
  }
  validateArgs({}, { anything: 1 });
});