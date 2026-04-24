# Skill: Ticket Traceability

Mandatory traceability between the ticket system (Jira, Linear, GitHub Issues) and the VCS (GitLab, GitHub, Bitbucket).

The ticket system is the **source of truth** of work. The Intake agent accesses it in **read-only** mode and produces the brief for the Planner. It does not write states or comments in the initial phase.

## `TICKET-KEY` convention

Typical format: `PROJ-123`, `ENG-45`, `#87`. Mandatory in:

- Branch name: `feature/PROJ-123-customer-onboarding`.
- MR title: `PROJ-123: customer onboarding`.
- First commit of the slice: `feat(frontend): customer onboarding form (PROJ-123)`.

## Flow with the ticket tracker

1. The Intake agent receives the `TICKET-KEY` from the user.
2. Reads the ticket (via Jira MCP, Linear MCP, GitHub CLI, etc.) and extracts:
   - Description and acceptance criteria.
   - Technical constraints, permissions, dependencies.
   - Links to Confluence / Notion, designs or related tickets.
3. Produces a **normalized brief** for the Planner.
4. The Planner defines the vertical slice and the 3 target tests.

## What the Intake agent does NOT do

- Does not transition states in the ticket tracker.
- Does not comment on the ticket.
- Does not create subtasks.
- Does not expose tracker credentials in responses.

State updates remain in human hands until the team decides to enable write mode.

## If information is missing in the ticket

The Intake agent must **ask the user** before handing off to the Planner. It does not assume silently. Typical questions:

- What is the main observable criterion?
- What new entities/fields does it imply?
- Are there specific permissions/roles?
- Does it affect public API or only internal?

## Automatic validation

The scripts under `hooks/` validate:

- `check-branch-name.sh`: format `feature/<TICKET-KEY>-<slug>`.
- `check-ticket-key.sh`: presence of `TICKET-KEY` in the branch name.
- `check-commit-msg.sh`: conventional format and `TICKET-KEY` when applicable.

They are invoked from local Git hooks (Lefthook, Husky) and from CI.
