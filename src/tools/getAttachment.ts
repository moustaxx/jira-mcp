import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Tool } from "./types.ts";

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
      dest_dir: {
        type: "string",
        description:
          "Optional directory to save into. Defaults to a 'jira-mcp' folder in the system temp dir.",
      },
    },
    required: ["attachment_id"],
    additionalProperties: false,
  },
  async handler(client, args) {
    const meta = await client.get(
      `/rest/api/2/attachment/${encodeURIComponent(args.attachment_id)}`,
    );
    if (!meta?.content) {
      throw new Error(`Attachment ${args.attachment_id} has no downloadable content.`);
    }

    const { data } = await client.getBinary(meta.content);

    const dir = args.dest_dir || join(tmpdir(), "jira-mcp");
    await mkdir(dir, { recursive: true });
    const filename = meta.filename || String(args.attachment_id);
    const path = join(dir, `${args.attachment_id}-${filename}`);
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
