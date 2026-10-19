import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import type { Tool } from "./types.ts";

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;

// The filename comes from whoever uploaded the attachment: strip any path so it cannot escape the dir.
function safeFilename(name: unknown, fallback: string): string {
  const base = [...basename(String(name ?? "").replace(/\\/g, "/"))]
    .filter((c) => c.charCodeAt(0) >= 0x20)
    .join("");
  return base && base !== "." && base !== ".." ? base : fallback;
}

export const getAttachment: Tool = {
  name: "jira_get_attachment",
  description:
    "Download a Jira attachment (image, file) by its attachment id and save it to disk. Returns the local file path and metadata. Discover attachment ids via jira_get_issue (the 'attachments' array).",
  inputSchema: {
    type: "object",
    properties: {
      attachment_id: {
        type: "string",
        description: "Attachment id, e.g. 123456 (from jira_get_issue attachments)",
      },
    },
    required: ["attachment_id"],
    additionalProperties: false,
  },
  async handler(client, args) {
    const id = String(args.attachment_id ?? "");
    if (!/^\d+$/.test(id)) throw new Error(`Invalid attachment id "${id}": expected digits.`);
    const maxBytes = Number(process.env.JIRA_ATTACHMENT_MAX_BYTES) || DEFAULT_MAX_BYTES;

    const meta = await client.get(`/rest/api/2/attachment/${id}`);
    if (!meta?.content) {
      throw new Error(`Attachment ${id} has no downloadable content.`);
    }
    if (typeof meta.size === "number" && meta.size > maxBytes) {
      throw new Error(`Attachment ${id} is ${meta.size} bytes, over the ${maxBytes}-byte limit.`);
    }

    const { data } = await client.getBinary(meta.content, maxBytes);

    const dir = resolve(process.env.JIRA_ATTACHMENT_DIR || join(tmpdir(), "jira-mcp"));
    await mkdir(dir, { recursive: true });
    const filename = safeFilename(meta.filename, id);
    const path = resolve(dir, `${id}-${filename}`);
    if (!path.startsWith(dir + sep)) throw new Error(`Refusing to write outside ${dir}.`);
    await writeFile(path, data);

    return JSON.stringify(
      {
        path,
        filename,
        mimeType: meta.mimeType ?? null,
        size: data.length,
      },
      null,
      2,
    );
  },
};