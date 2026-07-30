# Command: Intake — Start work on a ticket

Reusable prompt to activate agent `00-task-intake`.
OJ-aware brief constraints: `.stackguide/oj.md`.
Jira: **Atlassian OAuth MCP primary** (avoids StackGuide 404 when `JIRA_TOKEN` is unset).

## Prompt

```
Act as the "Task Intake" agent.
Load skills: traceability, oj-health.

Ticket: <TICKET-KEY>

Goal: read the ticket (read-only), detect gaps, produce the normalized brief
for the Planner. Do not write in the tracker. Do not run OJ.

## Jira read path (important — avoid StackGuide 404 noise)

Default for Jira tickets: use the Atlassian OAuth MCP FIRST.
Do NOT call StackGuide agent action:"intake" unless JIRA_TOKEN is known set
or the user explicitly asks for StackGuide intake.

Steps:
1. getAccessibleAtlassianResources → cloudId for your site (<your-site>.atlassian.net)
2. getJiraIssue (markdown) for <TICKET-KEY>
   fields: summary, description, status, issuetype, subtasks, labels, priority, assignee, components
3. searchJiraIssuesUsingJql: parent = <TICKET-KEY> ORDER BY key ASC
4. Fetch missing subtask descriptions if needed
5. Build the brief per agent 00-task-intake
6. Mark Intake source: atlassian-mcp-primary

Optional — only if JIRA_TOKEN is set / user asks:
- Try agent action:"intake" ticket:"<TICKET-KEY>" first
- On 404/auth/empty → use Atlassian steps above; mark atlassian-mcp-fallback

Not Jira? Read via the configured tracker (Linear MCP, GitHub CLI…) and mark
Intake source: other-tracker.

OJ (brief only):
- OJ contract: present | missing (.stackguide/repo-health.json or .repo-health.json)
- Architecture / large-module risk → stay within OJ contract; do not loosen it

When done, close with: "Brief ready, handing off to TDD Planner".
```

## Expected result

- Brief without a failed StackGuide 404 round-trip (default Jira path).
- `Intake source: atlassian-mcp-primary` (or fallback if StackGuide was tried).
- `OJ contract: present | missing` in Technical constraints.
- Subtasks when present; handoff to Planner.
