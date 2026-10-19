// Narrower than `typeof fetch`: the client only ever passes a URL string.
export type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

export interface JiraConfig {
  baseUrl: string;
  pat: string;
  fetchImpl?: FetchImpl;
  timeoutMs?: number;
}

export class JiraError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "JiraError";
  }
}

type QueryValue = string | number | undefined;

const DEFAULT_TIMEOUT_MS = 30_000;

export class JiraClient {
  private readonly baseUrl: string;
  private readonly origin: string;
  private readonly pat: string;
  private readonly fetchImpl: FetchImpl;
  private readonly timeoutMs: number;

  constructor(cfg: JiraConfig) {
    this.baseUrl = cfg.baseUrl.replace(/\/+$/, "");
    this.origin = new URL(this.baseUrl).origin;
    this.pat = cfg.pat;
    this.fetchImpl = cfg.fetchImpl ?? fetch;
    this.timeoutMs = cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async get(path: string, query?: Record<string, QueryValue>): Promise<any> {
    let urlStr = this.baseUrl + path;
    if (query) {
      const parts: string[] = [];
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined)
          parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
      }
      if (parts.length) urlStr += "?" + parts.join("&");
    }
    return parseJson(await this.request("GET", urlStr));
  }

  async put(path: string, body: unknown): Promise<any> {
    return this.send("PUT", path, body);
  }

  async post(path: string, body: unknown): Promise<any> {
    return this.send("POST", path, body);
  }

  private async send(method: "PUT" | "POST", path: string, body: unknown): Promise<any> {
    const res = await this.request(method, this.baseUrl + path, body);
    // Jira answers a successful issue update with 204 No Content.
    return res.status === 204 ? null : parseJson(res);
  }

  // Absolute URLs (e.g. attachment `content` links) must point at the configured Jira host,
  // otherwise the PAT would be sent to a foreign server.
  async getBinary(
    pathOrUrl: string,
    maxBytes = Infinity,
  ): Promise<{ data: Buffer; contentType: string | null }> {
    const urlStr = /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : this.baseUrl + pathOrUrl;
    if (new URL(urlStr).origin !== this.origin) {
      throw new Error(
        `Refusing to send credentials to ${new URL(urlStr).origin}: not the Jira host.`,
      );
    }
    const res = await this.request("GET", urlStr, undefined, false);
    const declared = Number(res.headers?.get("content-length"));
    if (declared > maxBytes) throw tooLarge(declared, maxBytes);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) throw tooLarge(buf.length, maxBytes);
    return { data: buf, contentType: res.headers?.get("content-type") ?? null };
  }

  private async request(
    method: "GET" | "PUT" | "POST",
    url: string,
    body?: unknown,
    json = true,
  ): Promise<Response> {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.pat}` };
    if (json) headers.Accept = "application/json";
    if (body !== undefined) headers["Content-Type"] = "application/json";
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method,
        headers,
        ...(body !== undefined && { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      if (e instanceof Error && e.name === "TimeoutError") {
        throw new Error(`Jira request timed out after ${this.timeoutMs} ms.`);
      }
      throw e;
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new JiraError(res.status, mapError(res.status, text));
    }
    return res;
  }
}

// A 200 with a non-JSON body usually means an SSO/login page from a proxy in front of Jira.
async function parseJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    throw new JiraError(
      res.status,
      `Jira returned a non-JSON response (${res.status}); check JIRA_BASE_URL and any SSO proxy.`,
    );
  }
}

function tooLarge(size: number, maxBytes: number): Error {
  return new Error(`Attachment too large: ${size} bytes exceeds the ${maxBytes}-byte limit.`);
}

function mapError(status: number, body: string): string {
  if (status === 401) return "Authentication failed (401): invalid or expired token.";
  if (status === 403) return "Permission denied (403): token lacks access to this resource.";
  if (status === 404) return "Not found (404): the requested resource does not exist.";
  return `Jira request failed (${status}): ${body.slice(0, 300)}`;
}