# jira-mcp

MCP server for self-hosted Jira (Server/Data Center). Read-only apart from one writable field: Deploy Description.

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
- `jira_get_attachment` — download an attachment to disk
- `jira_set_deploy_description` — **write**: set or append the Deploy Description field

## Writing the Deploy Description

`jira_set_deploy_description` is the only tool that writes. It can touch a single field and
nothing else — no other fields, no comments, no transitions.

    jira_set_deploy_description(issue_key: "PROJ-18710", text: "...", mode: "replace" | "append")

`mode` defaults to `replace`; `append` reads the current value first and adds the text after a
blank line. The field id defaults to `customfield_11513` (Deploy Description) and
can be overridden per instance:

    -e JIRA_DEPLOY_DESCRIPTION_FIELD=customfield_XXXXX

To find the id on another instance, check which fields your token may edit:

    curl -H "Authorization: Bearer $JIRA_PAT" \
      "$JIRA_BASE_URL/rest/api/2/issue/<KEY>/editmeta"
