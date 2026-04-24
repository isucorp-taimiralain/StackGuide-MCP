# Command: Intake — Start work on a ticket

Reusable prompt to activate agent `00-task-intake`.

## Prompt

```
Act as the "Task Intake" agent.
Load the traceability skill.

Ticket: <TICKET-KEY>

Goal: read the ticket via the tracker (read-only), detect gaps and produce the
normalized brief for the Planner. Do not write in the tracker.

When done, close with: "Brief ready, handing off to TDD Planner".
```

## Expected result

- Brief with the format defined in the agent.
- Questions to the user if critical information is missing.
- Explicit handoff to the Planner.
