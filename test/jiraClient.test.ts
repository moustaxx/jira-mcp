import { test } from "node:test";
import assert from "node:assert/strict";
import { JiraClient, JiraError } from "../src/jiraClient.ts";

function fakeFetch(
  captured: { url?: string; headers?: any },
  response: { ok: boolean; status: number; body: any },
) {
  return async (url: string, init: any) => {
    captured.url = url;
    captured.headers = init.headers;
    return {
      ok: response.ok,
      status: response.status,
      json: async () => response.body,
      text: async () =>
        typeof response.body === "string" ? response.body : JSON.stringify(response.body),
    } as any;
  };
}

test("builds URL from base + path + query and strips trailing slash", async () => {
  const cap: any = {};
  const client = new JiraClient({
    baseUrl: "https://jira.example.test/",
    pat: "tok",
    fetchImpl: fakeFetch(cap, { ok: true, status: 200, body: { ok: true } }),
  });
  await client.get("/rest/api/2/myself", { foo: "bar", skip: undefined });
  assert.equal(cap.url, "https://jira.example.test/rest/api/2/myself?foo=bar");
});

test("sends Bearer auth header", async () => {
  const cap: any = {};
  const client = new JiraClient({
    baseUrl: "https://jira.example.test",
    pat: "secret",
    fetchImpl: fakeFetch(cap, { ok: true, status: 200, body: {} }),
  });
  await client.get("/rest/api/2/myself");
  assert.equal(cap.headers.Authorization, "Bearer secret");
});

test("maps 401 to auth error", async () => {
  const client = new JiraClient({
    baseUrl: "https://x",
    pat: "t",
    fetchImpl: fakeFetch({}, { ok: false, status: 401, body: "nope" }),
  });
  await assert.rejects(
    () => client.get("/x"),
    (e: any) => e instanceof JiraError && e.status === 401 && /401/.test(e.message),
  );
});

test("maps 404 to not found", async () => {
  const client = new JiraClient({
    baseUrl: "https://x",
    pat: "t",
    fetchImpl: fakeFetch({}, { ok: false, status: 404, body: "missing" }),
  });
  await assert.rejects(
    () => client.get("/x"),
    (e: any) => e instanceof JiraError && e.status === 404,
  );
});

test("maps 500 with body snippet", async () => {
  const client = new JiraClient({
    baseUrl: "https://x",
    pat: "t",
    fetchImpl: fakeFetch({}, { ok: false, status: 500, body: "boom" }),
  });
  await assert.rejects(
    () => client.get("/x"),
    (e: any) => e instanceof JiraError && e.status === 500 && /boom/.test(e.message),
  );
});

function fakeWriteFetch(
  captured: { url?: string; method?: string; headers?: any; body?: string },
  response: { ok: boolean; status: number; body?: any },
) {
  return async (url: string, init: any) => {
    captured.url = url;
    captured.method = init.method;
    captured.headers = init.headers;
    captured.body = init.body;
    return {
      ok: response.ok,
      status: response.status,
      json: async () => response.body,
      text: async () =>
        typeof response.body === "string" ? response.body : JSON.stringify(response.body ?? ""),
    } as any;
  };
}

test("put sends PUT with JSON body and Bearer auth", async () => {
  const cap: any = {};
  const client = new JiraClient({
    baseUrl: "https://jira.example.test",
    pat: "secret",
    fetchImpl: fakeWriteFetch(cap, { ok: true, status: 204 }),
  });
  await client.put("/rest/api/2/issue/PROJ-1", { fields: { customfield_11513: "text" } });
  assert.equal(cap.url, "https://jira.example.test/rest/api/2/issue/PROJ-1");
  assert.equal(cap.method, "PUT");
  assert.equal(cap.headers.Authorization, "Bearer secret");
  assert.equal(cap.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(cap.body), { fields: { customfield_11513: "text" } });
});

test("put returns null on 204 without parsing a body", async () => {
  const client = new JiraClient({
    baseUrl: "https://x",
    pat: "t",
    fetchImpl: async () =>
      ({
        ok: true,
        status: 204,
        json: async () => {
          throw new Error("no body to parse");
        },
        text: async () => "",
      }) as any,
  });
  assert.equal(await client.put("/x", {}), null);
});

test("put maps 400 to JiraError with body snippet", async () => {
  const client = new JiraClient({
    baseUrl: "https://x",
    pat: "t",
    fetchImpl: fakeWriteFetch(
      {},
      { ok: false, status: 400, body: "Field 'customfield_11513' cannot be set" },
    ),
  });
  await assert.rejects(
    () => client.put("/x", {}),
    (e: any) => e instanceof JiraError && e.status === 400 && /cannot be set/.test(e.message),
  );
});

test("post sends POST with JSON body and returns parsed response", async () => {
  const cap: any = {};
  const client = new JiraClient({
    baseUrl: "https://jira.example.test",
    pat: "secret",
    fetchImpl: fakeWriteFetch(cap, { ok: true, status: 201, body: { id: "10001", key: "PROJ-2" } }),
  });
  const out = await client.post("/rest/api/2/issue", { fields: { summary: "A" } });
  assert.equal(cap.method, "POST");
  assert.equal(cap.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(cap.body), { fields: { summary: "A" } });
  assert.deepEqual(out, { id: "10001", key: "PROJ-2" });
});

test("reports a non-JSON 200 response (e.g. SSO login page) clearly", async () => {
  const client = new JiraClient({
    baseUrl: "https://jira.example.test",
    pat: "t",
    fetchImpl: async () =>
      ({
        ok: true,
        status: 200,
        json: async () => JSON.parse("<html>"),
        text: async () => "<html>",
      }) as any,
  });
  await assert.rejects(() => client.get("/rest/api/2/myself"), /non-JSON response/);
});

test("aborts requests that exceed the timeout", async () => {
  const client = new JiraClient({
    baseUrl: "https://jira.example.test",
    pat: "t",
    timeoutMs: 10,
    fetchImpl: (_url, init) =>
      new Promise((_resolve, reject) => {
        // A real fetch keeps the event loop alive; AbortSignal.timeout's timer alone does not.
        const keepAlive = setTimeout(() => {}, 1000);
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(keepAlive);
          reject(init.signal!.reason);
        });
      }),
  });
  await assert.rejects(() => client.get("/rest/api/2/myself"), /timed out after 10 ms/);
});

test("getBinary sends the token only to the Jira origin", async () => {
  const urls: string[] = [];
  const client = new JiraClient({
    baseUrl: "https://jira.example.test",
    pat: "t",
    fetchImpl: async (url: string) => {
      urls.push(url);
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => new ArrayBuffer(0),
        headers: { get: () => null },
      } as any;
    },
  });
  await client.getBinary("https://jira.example.test/secure/attachment/1/a");
  await assert.rejects(
    () => client.getBinary("https://jira.example.test.attacker.example/a"),
    /Refusing to send credentials/,
  );
  await assert.rejects(() => client.getBinary("http://jira.example.test/a"), /Refusing/);
  assert.deepEqual(urls, ["https://jira.example.test/secure/attachment/1/a"]);
});
