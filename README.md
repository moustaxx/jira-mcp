# jira-mcp

MCP server for self-hosted Jira (Server/Data Center). Read-only by default apart from one writable field: Deploy Description. Comments, issue create/edit and status transitions can be enabled explicitly (see [Optional write tools](#optional-write-tools)).

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
- `jira_set_deploy_description` — **write**: set or append the Deploy Description field
- `jira_add_comment` — **write, opt-in** (`comments`): add a comment
- `jira_create_issue` / `jira_update_issue` — **write, opt-in** (`issues`): create an issue, edit fields of an issue
- `jira_transition_issue` — **write, opt-in** (`transitions`): change status by running a workflow transition

## Optional write tools

Disabled by default: unless enabled, these tools are not even listed to the client. Enable them per
group with a comma-separated `JIRA_WRITE_TOOLS`:

    -e JIRA_WRITE_TOOLS=comments          # jira_add_comment
    -e JIRA_WRITE_TOOLS=issues            # jira_create_issue, jira_update_issue
    -e JIRA_WRITE_TOOLS=transitions       # jira_transition_issue
    -e JIRA_WRITE_TOOLS=comments,issues,transitions

An unknown group name stops the server at startup, so a typo never silently leaves a tool off.
`jira_update_issue` edits fields only (summary, description, any field by id); it never changes status.
Status changes go through `jira_transition_issue`, which takes a transition id, transition name or
target status name (resolved against `jira_get_transitions`; an unknown or ambiguous name is rejected
before anything is sent), plus an optional `comment` and `fields` required by the transition screen
(e.g. `{"resolution": {"name": "Fixed"}}`).

## Attachments

`jira_get_attachment` saves files as `<id>-<filename>` into a single directory, by default `jira-mcp`
in the system temp dir. Path components in the uploaded filename are stripped, so a file can never
land outside that directory. Downloads are limited to 50 MB, and the token is only ever sent to the
`JIRA_BASE_URL` host. Both settings can be overridden:

    -e JIRA_ATTACHMENT_DIR=/path/to/dir
    -e JIRA_ATTACHMENT_MAX_BYTES=104857600

## Writing the Deploy Description

`jira_set_deploy_description` is the only write tool that is always on. It can touch a single field
and nothing else — no other fields, no comments, no transitions.

    jira_set_deploy_description(issue_key: "PROJ-18710", text: "...", mode: "replace" | "append")

`mode` defaults to `replace`; `append` reads the current value first and adds the text after a
blank line. The field id defaults to `customfield_11513` (Deploy Description) and
can be overridden per instance:

    -e JIRA_DEPLOY_DESCRIPTION_FIELD=customfield_XXXXX

To find the id on another instance, check which fields your token may edit:

    curl -H "Authorization: Bearer $JIRA_PAT" \
      "$JIRA_BASE_URL/rest/api/2/issue/<KEY>/editmeta"
