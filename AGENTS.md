# AGENTS.md

## Project

- This repository contains a TypeScript MCP server for self-hosted Jira Server/Data Center.
- Use Node.js `>=22.6` and pnpm for dependency and script commands.
- Keep the server read-only by default. Treat write tools and Jira credentials as security-sensitive.

## Structure

- `src/index.ts` starts the MCP server.
- `src/jiraClient.ts` owns Jira HTTP access and authentication.
- `src/tools/` contains individual MCP tools and their shared types.
- `test/` contains Node's built-in test suite.

## Development

- Install dependencies with `pnpm install`.
- Build with `pnpm build`.
- Run tests with `pnpm test`.
- Run lint with `pnpm lint`.
- Check formatting with `pnpm format:check`.
- Keep imports compatible with ESM and the existing TypeScript configuration.

## Change Guidelines

- Follow existing tool registration, validation, error-handling, and Jira API patterns.
- Add or update focused tests for behavior changes, especially around authentication, input validation, pagination, and write-tool permissions.
- Do not log or commit `JIRA_PAT` or other credentials.
- Preserve the default opt-in behavior for write operations.
- Avoid unrelated refactors and generated build output changes in `dist/`.