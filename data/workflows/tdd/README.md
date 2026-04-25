# TDD Agentic Workflow

Portable, stack-agnostic methodology for AI coding agents based on **Test-Driven Development** with **vertical slices**.

Originally inspired by the `.claude/` methodology from `inexsupport-new`, now generalized and lazy-loaded via the StackGuide MCP Server.

## Philosophy

- **Five roles** orchestrate every change: Intake → Planner → Implementer → Verifier → Releaser.
- **Lazy loading**: agents, skills and hooks are returned on demand through the MCP `workflow` tool.
- **Token-efficient**: only the role/skill currently needed is injected into context.
- **Stack-aware**: skills cover Laravel, React, Postgres migrations, VCS conventions and ticket traceability, but adapt to whatever StackGuide auto-detects.

## Structure

```
data/workflows/tdd/
├── agents/     # The five roles
├── skills/     # How-to guides invoked by the roles
├── hooks/      # POSIX shell scripts for local/CI validation
└── commands/   # Ready-to-use prompt templates for each role
```

## Usage via MCP

```text
workflow action:"list"                          # Discover what is available
workflow action:"agent" name:"tdd-planner"      # Load planner role just-in-time
workflow action:"skill" name:"tdd-core"         # Pull the baseline TDD policy
workflow action:"command" name:"plan"           # Get a ready-to-copy prompt
workflow action:"hook" name:"check-branch-name" # Retrieve the shell script
```

## Install into a project

```text
init action:"full"
```

`init` auto-detects your stack and copies only the relevant agents/skills into `.stackguide/` inside your project.
