import type { JiraClient } from "../jiraClient.ts";

export interface Tool {
  name: string;
  description: string;
  inputSchema: object;
  handler(client: JiraClient, args: Record<string, any>): Promise<string>;
}