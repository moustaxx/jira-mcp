# jira-mcp

Read-only MCP server for self-hosted Jira (Server/Data Center).

## Build

    yarn install
    yarn run build

## Configure in Claude Code

    claude mcp add jira --scope user \
      -e JIRA_BASE_URL=https://<your-jira-host> \
      -e JIRA_PAT=<your-personal-access-token> \
      -- node /path/to/jira-mcp/dist/index.js

The instance URL is read from `JIRA_BASE_URL` and is never baked into the code.

## Tools

- `jira_whoami` — current user / auth check
- `jira_get_issue` — issue by key
- `jira_search` — JQL search
- `jira_get_comments` — comments on an issue
- `jira_get_transitions` — available transitions (read-only listing)
