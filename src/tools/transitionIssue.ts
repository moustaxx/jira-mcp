import type { Tool } from "./types.ts";

interface Transition {
  id: string;
  name: string;
  to: string | null;
}

function describe(t: Transition): string {
  return `${t.name} (${t.id}) → ${t.to ?? "?"}`;
}

// Matches by transition id first, then by transition name or target status name (case-insensitive).
function resolve(transitions: Transition[], wanted: string): Transition {
  const byId = transitions.find((t) => t.id === wanted);
  if (byId) return byId;
  const needle = wanted.trim().toLowerCase();
  const byName = transitions.filter((t) => t.name.toLowerCase() === needle);
  const matches =
    byName.length > 0 ? byName : transitions.filter((t) => t.to?.toLowerCase() === needle);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    throw new Error(
      `Transition "${wanted}" is ambiguous: ${matches.map(describe).join("; ")}. Pass the id.`,
    );
  }
  const available = transitions.length ? transitions.map(describe).join("; ") : "none";
  throw new Error(`No transition "${wanted}" available for this issue. Available: ${available}.`);
}

export const transitionIssue: Tool = {
  name: "jira_transition_issue",
  description:
    "Change the status of a Jira issue by running a workflow transition. `transition` is a transition id, transition name or target status name (see jira_get_transitions). Write tool: only available when enabled via JIRA_WRITE_TOOLS.",
  inputSchema: {
    type: "object",
    properties: {
      issue_key: { type: "string", description: "Issue key, e.g. PROJ-17619" },
      transition: {
        type: "string",
        description: 'Transition id (e.g. "21"), transition name or target status name',
      },
      comment: {
        type: "string",
        description: "Optional comment added with the transition (Jira wiki markup)",
      },
      fields: {
        type: "object",
        description:
          'Fields required by the transition screen, keyed by field id, e.g. {"resolution": {"name": "Fixed"}}',
      },
    },
    required: ["issue_key", "transition"],
    additionalProperties: false,
  },
  async handler(client, args) {
    if (typeof args.transition !== "string" || !args.transition.trim())
      throw new Error("`transition` must not be empty.");
    if (
      args.fields !== undefined &&
      (typeof args.fields !== "object" || args.fields === null || Array.isArray(args.fields))
    ) {
      throw new Error("`fields` must be an object keyed by field id.");
    }
    const path = `/rest/api/2/issue/${encodeURIComponent(args.issue_key)}/transitions`;
    const data = await client.get(path);
    const transitions: Transition[] = (
      Array.isArray(data?.transitions) ? data.transitions : []
    ).map((t: any) => ({ id: String(t.id), name: String(t.name), to: t.to?.name ?? null }));
    const chosen = resolve(transitions, args.transition);

    const body: Record<string, any> = { transition: { id: chosen.id } };
    if (args.fields !== undefined) body.fields = args.fields;
    if (typeof args.comment === "string" && args.comment.trim()) {
      body.update = { comment: [{ add: { body: args.comment } }] };
    }
    await client.post(path, body);
    return JSON.stringify(
      { key: args.issue_key, transition: chosen.name, status: chosen.to },
      null,
      2,
    );
  },
};
