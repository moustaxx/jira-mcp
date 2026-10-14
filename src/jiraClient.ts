// Narrower than `typeof fetch`: the client only ever passes a URL string.
export type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

export interface JiraConfig {
  baseUrl: string;
  pat: string;
  fetchImpl?: FetchImpl;
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

export class JiraClient {
  private readonly baseUrl: string;
  private readonly pat: string;
  private readonly fetchImpl: FetchImpl;

  constructor(cfg: JiraConfig) {
    this.baseUrl = cfg.baseUrl.replace(/\/+$/, "");
    this.pat = cfg.pat;
    this.fetchImpl = cfg.fetchImpl ?? fetch;
  }

  async get(path: string, query?: Record<string, QueryValue>): Promise<any> {
    let urlStr = this.baseUrl + path;
    if (query) {
      const parts: string[] = [];
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
      }
      if (parts.length) urlStr += "?" + parts.join("&");
    }
    const res = await this.fetchImpl(urlStr, {
      headers: { Authorization: `Bearer ${this.pat}`, Accept: "application/json" },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new JiraError(res.status, mapError(res.status, body));
    }
    return res.json();
  }

  async put(path: string, body: unknown): Promise<any> {
    const res = await this.fetchImpl(this.baseUrl + path, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${this.pat}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new JiraError(res.status, mapError(res.status, text));
    }
    // Jira answers a successful issue update with 204 No Content.
    return res.status === 204 ? null : res.json();
  }

  async getBinary(pathOrUrl: string): Promise<{ data: Buffer; contentType: string | null }> {
    const urlStr = /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : this.baseUrl + pathOrUrl;
    const res = await this.fetchImpl(urlStr, {
      headers: { Authorization: `Bearer ${this.pat}` },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new JiraError(res.status, mapError(res.status, body));
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return { data: buf, contentType: res.headers.get("content-type") };
  }
}

function mapError(status: number, body: string): string {
  if (status === 401) return "Authentication failed (401): invalid or expired token.";
  if (status === 403) return "Permission denied (403): token lacks access to this resource.";
  if (status === 404) return "Not found (404): the requested resource does not exist.";
  return `Jira request failed (${status}): ${body.slice(0, 300)}`;
}
