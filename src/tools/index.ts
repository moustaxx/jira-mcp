import type { Tool } from "./types.ts";
import { whoami } from "./whoami.ts";
import { getIssue } from "./getIssue.ts";
import { search } from "./search.ts";
import { getComments } from "./getComments.ts";
import { getTransitions } from "./getTransitions.ts";
import { getAttachment } from "./getAttachment.ts";
import { setDeployDescription } from "./setDeployDescription.ts";

export const tools: Tool[] = [whoami, getIssue, search, getComments, getTransitions, getAttachment, setDeployDescription];
