import type { Tool } from "./types.ts";
import { whoami } from "./whoami.ts";
import { getIssue } from "./getIssue.ts";
import { search } from "./search.ts";
import { getComments } from "./getComments.ts";
import { getTransitions } from "./getTransitions.ts";
import { getAttachment } from "./getAttachment.ts";
import { listFields } from "./listFields.ts";
import { getChangelog } from "./getChangelog.ts";
import { getDevInfo } from "./getDevInfo.ts";
import { listBoards, listSprints } from "./agile.ts";
import { getWorklogs } from "./getWorklogs.ts";
import { addComment } from "./addComment.ts";
import { createIssue, updateIssue } from "./writeIssue.ts";
import { transitionIssue } from "./transitionIssue.ts";
import { addWorklog } from "./addWorklog.ts";

export const tools: Tool[] = [
  whoami,
  getIssue,
  search,
  getComments,
  getTransitions,
  getAttachment,
  listFields,
  getChangelog,
  getDevInfo,
  listBoards,
  listSprints,
  getWorklogs,
];

// Opt-in write tools, enabled per group via JIRA_WRITE_TOOLS (comma-separated), e.g. "comments,issues".
export const writeToolGroups: Record<string, Tool[]> = {
  comments: [addComment],
  issues: [createIssue, updateIssue],
  transitions: [transitionIssue],
  worklogs: [addWorklog],
};

export function enabledTools(writeToolsEnv: string | undefined): Tool[] {
  const groups = (writeToolsEnv ?? "")
    .split(",")
    .map((g) => g.trim().toLowerCase())
    .filter(Boolean);
  const unknown = groups.filter((g) => !Object.hasOwn(writeToolGroups, g));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown JIRA_WRITE_TOOLS group(s): ${unknown.join(", ")}. Allowed: ${Object.keys(writeToolGroups).join(", ")}.`,
    );
  }
  return [...tools, ...[...new Set(groups)].flatMap((g) => writeToolGroups[g])];
}