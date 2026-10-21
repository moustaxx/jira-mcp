# jira-mcp

MCP server for self-hosted Jira (Server/Data Center). Read-only by default. Comments, issue create/edit, status transitions and work logging can be enabled explicitly (see [Optional write tools](#optional-write-tools)).

## Development

```console
pnpm install
pnpm build
```

The published npm package includes the compiled server, so users do not need
to clone the repository or build it locally.

## Configure MCP clients

Add an MCP server entry to the client you use. The client downloads the
published package through `npx`; provide your token through the client's
environment settings.

### Claude Code

```console
claude mcp add jira --scope user \
  -e JIRA_BASE_URL=https://<your-jira-host> \
  -e JIRA_PAT=<your-personal-access-token> \
  -- npx -y @moustaxx/jira-mcp
```

The instance URL is read from `JIRA_BASE_URL` and is never baked into the code.

### GitHub Copilot in VS Code

Create `.vscode/mcp.json` in the workspace (or use **MCP: Open User
Configuration** for a user-wide setup):

```json
{
  "servers": {
    "jira": {
      "command": "npx",
      "args": ["-y", "@moustaxx/jira-mcp"],
      "env": {
        "JIRA_BASE_URL": "https://<your-jira-host>",
        "JIRA_PAT": "<your-personal-access-token>"
      }
    }
  }
}
```

### Antigravity

Add the server to Antigravity's MCP configuration file, usually
`~/.gemini/antigravity/mcp_config.json`:

```json
{
  "mcpServers": {
    "jira": {
      "command": "npx",
      "args": ["-y", "@moustaxx/jira-mcp"],
      "env": {
        "JIRA_BASE_URL": "https://<your-jira-host>",
        "JIRA_PAT": "<your-personal-access-token>"
      }
    }
  }
}
```

### Cursor

Create `.cursor/mcp.json` in the project (or add the server from Cursor's MCP
settings):

```json
{
  "mcpServers": {
    "jira": {
      "command": "npx",
      "args": ["-y", "@moustaxx/jira-mcp"],
      "env": {
        "JIRA_BASE_URL": "https://<your-jira-host>",
        "JIRA_PAT": "<your-personal-access-token>"
      }
    }
  }
}
```

Restart or reload the MCP connections after saving the configuration. Keep
the token out of version control; use a user-level configuration or the
client's secret/environment-variable support when available.

## Tools

- `jira_whoami` — current user / auth check
- `jira_get_issue` — issue by key (optional `fields`: extra field ids, returned under `extraFields`)
- `jira_list_fields` — field ids and names (optionally filtered, or only those set on an issue)
- `jira_search` — JQL search (optional `fields`, same as `jira_get_issue`; paged with `start_at`, returns `total`)
- `jira_get_comments` — comments on an issue
- `jira_get_changelog` — change history of an issue (optionally for one field)
- `jira_get_dev_info` — merge requests and branches from the Development panel, plus remote links
- `jira_get_worklogs` — work logged on an issue
- `jira_list_boards` / `jira_list_sprints` — Jira Software boards and their sprints (sprint issues: `jira_search` with `sprint = <id>`)
- `jira_get_transitions` — available transitions (read-only listing)
- `jira_get_attachment` — download an attachment to disk (see [Attachments](#attachments))
- `jira_add_comment` — **write, opt-in** (`comments`): add a comment
- `jira_create_issue` / `jira_update_issue` — **write, opt-in** (`issues`): create an issue, edit fields of an issue
- `jira_transition_issue` — **write, opt-in** (`transitions`): change status by running a workflow transition
- `jira_add_worklog` — **write, opt-in** (`worklogs`): log work time on an issue

## Optional write tools

Disabled by default: unless enabled, these tools are not even listed to the client. Enable them per
group with a comma-separated `JIRA_WRITE_TOOLS`:

    -e JIRA_WRITE_TOOLS=comments          # jira_add_comment
    -e JIRA_WRITE_TOOLS=issues            # jira_create_issue, jira_update_issue
    -e JIRA_WRITE_TOOLS=transitions       # jira_transition_issue
    -e JIRA_WRITE_TOOLS=worklogs          # jira_add_worklog
    -e JIRA_WRITE_TOOLS=comments,issues,transitions,worklogs

When the `issues` group is enabled, `jira_update_issue` requires `JIRA_WRITE_FIELDS`.
Set it to a comma-separated whitelist of Jira field ids, or to `*` to allow every field:

    -e JIRA_WRITE_TOOLS=issues \
    -e JIRA_WRITE_FIELDS=summary,description,customfield_11513

    -e JIRA_WRITE_FIELDS=*

An unknown group name stops the server at startup, so a typo never silently leaves a tool off.
`jira_update_issue` edits fields only (summary, description, any field by id); it never changes status.
Status changes go through `jira_transition_issue`, which takes a transition id, transition name or
target status name (resolved against `jira_get_transitions`; an unknown or ambiguous name is rejected
before anything is sent), plus an optional `comment` and `fields` required by the transition screen
(e.g. `{"resolution": {"name": "Fixed"}}`).

`jira_add_worklog` takes `time_spent` in Jira duration format (`1h 30m`, `45m`, `1d`), an optional
`started` ISO 8601 date-time (without an offset it is the local time of the machine running the server;
defaults to now) and an optional `comment`. The remaining estimate is adjusted automatically by Jira.

## Attachments

`jira_get_attachment` saves files as `<id>-<filename>` into a single directory, by default `jira-mcp`
in the system temp dir. Path components in the uploaded filename are stripped, so a file can never
land outside that directory. Downloads are limited to 50 MB, and the token is only ever sent to the
`JIRA_BASE_URL` host. Both settings can be overridden:

    -e JIRA_ATTACHMENT_DIR=/path/to/dir
    -e JIRA_ATTACHMENT_MAX_BYTES=104857600
