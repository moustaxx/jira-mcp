import type { Tool } from "./types.ts";

// Instance-specific field id; overridable so it is not baked into the code.
const DEFAULT_FIELD = "customfield_11513";

export const setDeployDescription: Tool = {
  name: "jira_set_deploy_description",
  description:
    "Write the Deploy Description field of a Jira issue (the only field this tool can touch). mode=replace overwrites it, mode=append adds the text after the current value.",
  inputSchema: {
    type: "object",
    properties: {
      issue_key: { type: "string", description: "Issue key, e.g. PROJ-18710" },
      text: {
        type: "string",
        description:
          "Deploy description content, e.g. merge request links with their target branch",
      },
      mode: {
        type: "string",
        enum: ["replace", "append"],
        description: "replace (default) or append",
      },
    },
    required: ["issue_key", "text"],
    additionalProperties: false,
  },
  async handler(client, args) {
    const mode = args.mode ?? "replace";
    if (mode !== "replace" && mode !== "append") {
      throw new Error(`Unsupported mode "${args.mode}": use "replace" or "append".`);
    }
    const field = process.env.JIRA_DEPLOY_DESCRIPTION_FIELD ?? DEFAULT_FIELD;
    const key = encodeURIComponent(args.issue_key);

    let value = args.text;
    if (mode === "append") {
      const data = await client.get(`/rest/api/2/issue/${key}`, { fields: field });
      const current = data.fields?.[field] ?? "";
      if (current.trim()) value = `${current}\n\n${args.text}`;
    }

    await client.put(`/rest/api/2/issue/${key}`, { fields: { [field]: value } });
    return JSON.stringify(
      { key: args.issue_key, field, mode, length: value.length, value },
      null,
      2,
    );
  },
};
